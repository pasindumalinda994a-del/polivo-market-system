# Local Data Access and Transactions

This document describes the stall-service data-access and transaction foundations built in phase 10 on the migration `001` core schema. It does not describe complete billing, payment, authentication, or synchronization workflows.

## Layer responsibilities

| Layer                | Responsibility                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- |
| `@polivo/domain`     | Pure calculations and business invariants                                               |
| `@polivo/contracts`  | Transport schemas and public `ApiError` format                                          |
| `@polivo/db-local`   | SQLite connections, migrations, SQL repositories, row mapping, transaction executor     |
| `apps/stall-service` | Request handling, command orchestration, authorization boundary, HTTP validation/errors |

Only the stall service opens the operational database. Web and desktop applications must not import `@polivo/db-local`.

## Repository conventions

- Prefer small, parameterized repository functions over generic table CRUD.
- Scope every business-record lookup by `stall_id` (and composite FKs where present). Do not trust a record ID alone.
- Allowlist any dynamic table or column selection (for example bill kind → `farmer_bills` / `trader_bills`).
- Bound list queries and use deterministic ordering when pagination is added.
- Keep raw database errors out of public HTTP responses.

Core repositories available now:

- Stall binding / local installation
- Farmer and trader get-by-id within a stall
- Farmer/trader bill get + optimistic revision update
- Command idempotency read/write
- Audit append
- Sync outbox append (with per-stall `local_sequence`)
- Bill sequence allocation

## Exact row mapping

Mapping validation occurs **per row at the repository boundary**. Malformed persisted enums, dates, booleans, or numeric values raise `RowMappingError` and are not silently replaced with `0` or empty strings.

Money and weight use the phase 08 integer adapters (`moneyMinor*` / `weightHundredths*`). Authoritative values must never pass through JavaScript `Number` floating-point conversion or SQLite `REAL`.

Internal fields (credential references, delivery bookkeeping) must not leak into unrelated public DTOs. HTTP handlers must not return raw SQLite rows.

## Execution context and authorization boundary

An execution context carries:

- Bound `tenantId` / `stallId` from `stall_binding` (must agree with the local database)
- Verified `actorRef` / `deviceRef`
- Required capability
- Request/correlation ID
- Idempotency key for eligible commands

Actor and device identities must come from a verified authorization adapter, not request-body fields or trusted headers.

Until phases 14–15:

- Production authorization **fails closed** (`productionFailClosedAuthorization`)
- No automatic owner identity
- No HTTP-reachable development authentication bypass
- Business mutation routes remain **unregistered** in production `buildApp`
- Test authorization adapters exist only in test composition (`buildTestApp`)

The public health endpoint remains available without authentication.

## Transaction ownership

Use `runInTransaction(db, fn)` from `@polivo/db-local`:

1. `BEGIN IMMEDIATE`
2. Run synchronous repository work with a `TxHandle`
3. `COMMIT` on success, otherwise `ROLLBACK`

Rules:

- Nested transactions are rejected (no savepoints in this phase)
- Promise-returning callbacks are rejected — `node:sqlite` APIs are synchronous; async work must not escape the transaction lifetime
- The `TxHandle` is invalidated after commit/rollback
- Keep transactions short: no network, printing, filesystem export, or cloud calls inside
- Retry only when the transaction outcome is known and replay is safe; preserve the original idempotency key

Busy waits are bounded by `SQLITE_BUSY_TIMEOUT_MS` (5000). Disk-full, corruption, and permission failures must not be hidden behind repeated retries.

## Idempotency scope and fingerprinting

Scope format:

`{tenantId}:{stallId}:{commandType}` and, when the command is principal-scoped, `:actor:{actorRef}:device:{deviceRef}`.

Fingerprint = deterministic canonical JSON of:

- Command type and version
- Validated command input
- Relevant semantic context (excluding correlation IDs and changing request timestamps unless they are part of the command meaning)

Behavior for an authorized command:

1. Validate input
2. Authorize (also required before returning a replayed result)
3. Enter a transaction
4. Inspect the idempotency record
5. Same key + fingerprint + completed → return stored result
6. Same key + different fingerprint → conflict
7. Otherwise execute, persist bounded result reference, audit, outbox, and commit together

Guarantees verified for this foundation:

- Duplicate retries must not create duplicate business, audit, or outbox effects
- Rolled-back commands leave no completed idempotency record
- Successful deduplication survives process restart / database reopen

This is durable command deduplication, not universal exactly-once delivery. Automatic idempotency-record cleanup is out of scope.

## Revision-conflict behavior

Eligible bill updates require `expectedRevision`. The update succeeds only when the stored revision matches, then increments atomically. A mismatch raises a conflict. Stale draft updates are not auto-retried with a newer revision. An idempotent replay of a successful command returns the original result even though that command already advanced the revision.

Finalized financial corrections remain separate workflows (not silent overwrites).

## Audit and outbox atomicity

A command may write business changes, audit rows, outbox events, and its idempotency result in one transaction. Failure of any required write rolls back all effects.

Outbox insertion is the durable handoff. Network delivery and acknowledgements belong to a later worker. Production financial event payloads are not invented here; tests use explicitly test-only event types such as `polivo.test.fixture`.

## Sequence allocation

`allocateNextBillSequence(tx, stallId, billType)` updates `bill_sequences.next_value` inside the caller’s transaction. It does not use `MAX(bill_number) + 1`. Missing configuration is a clear error. Supported values stay within safe integer bounds. Farmer and trader sequences remain separate. Example starts such as `111111` / `444444` are not seeded unless numbering policy is approved.

## Failure and retry policy

| Class                                                         | Typical public mapping                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Validation                                                    | `VALIDATION_ERROR` (400)                                          |
| Missing auth / capability                                     | `UNAUTHENTICATED` / `FORBIDDEN`                                   |
| Missing resource                                              | `NOT_FOUND`                                                       |
| Idempotency fingerprint / revision conflict / uniqueness race | `CONFLICT`                                                        |
| Temporary SQLite busy                                         | `SERVICE_UNAVAILABLE` (retry with same idempotency key when safe) |
| Storage unavailable / unexpected                              | `SERVICE_UNAVAILABLE` / `INTERNAL_ERROR`                          |

Unexpected failures return a generic message. Logs may keep diagnostics with credentials redacted. Stack traces, SQL, local paths, and row dumps must not appear in public responses.

## How future feature phases add commands safely

1. Define validated input/result schemas in `@polivo/contracts` (or feature-local schemas when not yet public).
2. Implement tenant-scoped repository operations in `@polivo/db-local` if new SQL is required.
3. Add a command definition that runs inside `runIdempotentCommand` with explicit capability, fingerprint inputs, and audit/outbox writes.
4. Register the HTTP route only when authorization can enforce the capability.
5. Cover atomicity, idempotency, and revision behavior with file-backed integration tests.

## Verified now vs still deferred

**Verified now:** repositories for core tables, synchronous transactions, durable idempotency, revision conflicts, audit/outbox atomicity, sequence allocation, HTTP validation/error mapping, fail-closed production auth boundary, absence of fixture routes from production composition.

**Deferred:** real authentication/devices/permissions (14–15), billing/payment APIs, outbox delivery workers, cloud sync, printing, LAN exposure, arrivals/inventory/permissions schema expansions.
