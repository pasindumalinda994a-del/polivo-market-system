# 10 — Fastify Local Data Access and Transactions

## Goal

Build the stall service’s data-access and transaction foundations on the SQLite schema implemented in phase 09.

Establish:

- Tenant-scoped repositories.
- Exact database-to-domain mapping.
- Atomic transaction execution.
- Durable command idempotency.
- Optimistic concurrency checks.
- Transactional audit and outbox writes.
- Consistent API validation and error handling.

Do not implement complete business workflows or expose unauthenticated business endpoints.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Review phase 08’s domain decisions and business-rule register.
4. Inspect the actual phase 09 migrations and database exports.
5. Inspect existing Fastify construction, lifecycle, contracts, and tests.
6. Run the relevant existing checks before modifying behavior.

The latest schema decision is:

**The first migration covers core operational tables only.**

Do not expand this phase into arrivals, inventory, or permissions-table implementation.

Use the schema actually present. Record missing prerequisites rather than assuming every table mentioned in an earlier guide exists.

Do not edit previously applied migrations. Add a forward migration only when necessary for this phase’s infrastructure.

## Architecture Boundaries

Keep responsibilities clear:

| Layer | Responsibility |
| --- | --- |
| `packages/domain` | Pure calculations and business invariants. |
| `packages/contracts` | Transport schemas and public error formats. |
| `packages/db-local` | SQLite connections, migrations, SQL, and row mapping. |
| `apps/stall-service` | Request handling, command orchestration, authorization boundaries, and transaction coordination. |

Only the stall service opens the operational database.

Web and desktop applications must not import the local database package.

Do not introduce another database connection model or ORM without a documented need.

## 1. Organize the Service Application Layer

Create focused areas for:

- Dependency composition.
- Command execution.
- Query execution.
- Execution context.
- Error mapping.
- HTTP validation helpers.

Follow existing repository conventions.

Inject:

- Database dependencies.
- Clock.
- Identifier generation.
- Logger.
- Authorization adapter.

Avoid global mutable request state and hidden database singletons inside business functions.

Keep Fastify application construction separate from server startup.

Do not build a generic plugin framework or command bus unless the existing architecture requires one.

## 2. Implement Tenant-Scoped Repositories

Implement small repository functions for the core tables already present.

Prioritize the operations needed to establish and test the foundation:

- Load the bound stall identity.
- Retrieve an existing farmer or buyer within that stall.
- Retrieve an existing bill with its revision.
- Read and write idempotency records.
- Append audit records.
- Append validated outbox events.
- Access approved bill-sequence storage.

Add other operations only where needed by this phase.

Do not implement full CRUD for every future module.

### Query Safety

- Parameterize all values.
- Allowlist any dynamic column or sort selection.
- Apply tenant scope to every business-record lookup.
- Do not trust a record ID alone to establish ownership.
- Bound list-query sizes.
- Use deterministic ordering for pagination.
- Keep raw database errors out of public responses.

Do not expose a generic table-name-based CRUD endpoint.

## 3. Map Database Rows to Domain Values

Create explicit mapping between:

- SQLite rows.
- Domain values.
- Public response DTOs.

Requirements:

- Preserve phase 08’s exact money and weight representation.
- Do not convert exact integers or decimal strings through JavaScript Number.
- Validate persisted enum, date, and numeric values.
- Handle optional fields deliberately.
- Reject malformed persisted data rather than silently replacing it with zero or an empty string.
- Do not return raw database rows directly from HTTP handlers.

Internal fields such as credential references, audit internals, and delivery bookkeeping must not leak into unrelated responses.

Document whether mapping validation occurs per row or through a clearly defined trusted boundary.

## 4. Create an Explicit Execution Context

Define an internal context containing the information required for an operation, such as:

- Bound tenant ID.
- Verified actor reference.
- Verified device reference where required.
- Required capability.
- Request/correlation ID.
- Idempotency key for eligible commands.

Tenant identity must agree with the local database binding.

Actor and device identities must eventually come from verified authentication, not request-body fields.

### Authentication Is Not Implemented Yet

Create an authorization interface that later phases can supply.

Until the real implementation exists:

- Production authorization must fail closed.
- Do not create an automatic owner identity.
- Do not trust tenant, actor, device, or role headers.
- Do not add a development authentication bypass reachable through HTTP.
- Test authorization adapters must exist only in test composition.

Keep business mutation routes unregistered in the production application during this phase.

The existing health endpoint may remain public.

## 5. Implement a Transaction Executor

Provide a transaction boundary that gives repositories access to the same active database transaction.

Requirements:

- Commit only when the entire operation succeeds.
- Roll back on any failure before commit.
- Prevent repositories from opening independent write connections inside the transaction.
- Prevent a transaction handle from being used after completion.
- Keep transactions short.
- Avoid network requests, printing, filesystem exports, or cloud calls inside transactions.
- Define nested-transaction behavior explicitly.

For this phase, reject accidental nested transactions unless an existing approved implementation deliberately uses savepoints.

Use a locking strategy compatible with the selected SQLite driver and command workload.

If the driver’s transaction callback is synchronous, prevent asynchronous callbacks or promises from escaping its transaction lifetime.

Do not assume that wrapping an async function automatically keeps a SQLite transaction open.

## 6. Implement Durable Command Idempotency

Use the persisted idempotency structure from phase 09.

Define a documented scope that includes the tenant and command identity, plus actor/device scope where appropriate.

### Request Fingerprint

Build the fingerprint from:

- Validated command input.
- Command type and version.
- Relevant semantic context.

Use deterministic canonical serialization.

Do not hash raw JSON property order or include changing request timestamps and correlation IDs unless they are part of the command’s meaning.

### Execution Behavior

For an authorized command:

1. Validate the input.
2. Resolve and check execution context.
3. Enter the transaction.
4. Inspect the idempotency record.
5. If the key and fingerprint match a completed command, return its recorded result.
6. If the key exists with a different fingerprint, return a conflict.
7. Otherwise execute the command.
8. Persist its result reference or bounded result.
9. Commit the result and all associated changes together.

Authorization must still be checked before returning a replayed result.

### Guarantees

- Duplicate retries must not create duplicate business, audit, or outbox effects.
- A rolled-back command must not leave a completed idempotency record.
- A process restart must not erase successful-command deduplication.
- If the response is lost after commit, retrying the same key must recover the committed result.

Keep request/correlation IDs separate from idempotency keys.

Do not claim universal exactly-once delivery.

Do not implement automatic idempotency-record cleanup in this phase.

## 7. Add Optimistic Concurrency Support

Use persisted revisions where the schema supports them.

For eligible updates:

- Require the expected revision.
- Update only when the stored revision matches.
- Increment the revision atomically.
- Return a conflict when another command has changed the record.

Include tenant scope and relevant lifecycle conditions in the mutation.

Do not silently overwrite a newer change.

Do not automatically retry a stale draft update with a newer revision.

A user retry of the same successful idempotent command should return the original result rather than fail because that command already advanced the revision.

Actual inline draft editing belongs to the billing-interface phase.

Finalized financial corrections remain separate workflows.

## 8. Coordinate Business, Audit, and Outbox Writes

Provide the infrastructure for a command to write:

- Its business changes.
- Required audit records.
- Required outbox events.
- Its idempotency result.

All must use the same transaction.

Requirements:

- Validate event payloads against their concrete schemas.
- Preserve stable event IDs once committed.
- Roll back the entire operation if a required audit or outbox write fails.
- Avoid secrets and unrestricted request bodies in audit data.
- Do not acknowledge synchronization or mark records delivered here.

Do not invent production financial event payloads before the relevant feature phase.

Use explicitly test-only events when proving transaction behavior.

Outbox insertion is the durable handoff. Network delivery occurs after commit in a later worker.

## 9. Add Sequence Allocation Infrastructure

If phase 09 includes sequence storage, implement a transaction-scoped allocator.

Requirements:

- Scope allocation to the bound stall and approved bill type.
- Allocate atomically.
- Avoid `MAX(number) + 1`.
- Reject missing configuration clearly.
- Enforce supported numeric bounds.
- Participate in the caller’s transaction.
- Preserve separate farmer and trader sequences.

Do not allocate actual bill numbers at application startup.

Do not initialize the example starts `111111` and `444444` unless the final numbering policy has been approved.

Keep number allocation separate from printed formatting.

Test allocator behavior with synthetic sequences without treating them as production policy.

## 10. Handle SQLite Contention and Failures

Map database failures deliberately.

Distinguish:

- Expected uniqueness conflicts.
- Stale revisions.
- Invalid references or invariant failures.
- Temporary database contention.
- Unavailable storage.
- Unexpected internal errors.

Use the shared public error format and appropriate HTTP statuses.

Do not classify every constraint failure as a user validation error.

A constraint failure caused by an implementation defect must remain an internal error.

### Retry Rules

- Keep busy waits and retries bounded.
- Do not blindly retry individual statements from a partially executed command.
- Retry only when the transaction outcome is known and replay is safe.
- Preserve the original idempotency key across retries.
- Do not retry stale revisions automatically.
- For an uncertain outcome, resolve the durable command result before executing again.

Do not hide disk-full, corruption, or permission failures with repeated retries.

## 11. Add Fastify Validation and Error Foundations

Integrate shared contracts with reusable route-level helpers.

Support:

- Request-body validation.
- Route-parameter validation.
- Query validation.
- Explicit response serialization.
- Consistent public errors.
- Request/correlation IDs.

Requirements:

- Keep validation distinct from authorization.
- Apply bounded request-body sizes.
- Use validated data after parsing.
- Do not silently coerce financial JSON values.
- Redact credentials and sensitive input from logs.
- Return generic messages for unexpected failures.
- Preserve useful diagnostic details in protected logs.

Map malformed JSON and other framework-level request errors consistently where appropriate.

Do not expose stack traces, SQL, local paths, or database contents.

Verify current Fastify integration patterns against official documentation before changing framework configuration.

## 12. Prove the Foundation Without Shipping Test Endpoints

Create an integration harness that exercises:

- Validation.
- Authorization.
- Transaction execution.
- Idempotency.
- Revision checks.
- Audit and outbox persistence.
- Public error mapping.

Register any test routes only inside test application construction.

Use isolated fixture tables where needed rather than inventing a real billing workflow.

Test-only routes, schemas, and commands must not be imported into production startup.

Verify they return HTTP 404 in the production application.

Do not expose generic SQL, database inspection, reset, or fixture endpoints.

## 13. Add Meaningful Integration Tests

Use isolated file-backed SQLite databases.

Test:

### Data Access

- Tenant-scoped reads return only eligible records.
- Cross-tenant references are rejected.
- SQL-like input is handled as data.
- Exact numeric values survive persistence and mapping.
- Invalid persisted values are detected.

### Transactions

- Successful operations commit all required writes.
- A failure after the first write rolls back all effects.
- Audit or outbox failure rolls back business changes.
- Transaction handles cannot be reused after completion.
- Nested or asynchronous misuse is rejected according to the chosen driver contract.

### Idempotency

- Same key and payload return the original result.
- Same key with a different payload returns a conflict.
- Retry after reopening the database does not duplicate effects.
- A committed command with a lost response can be replayed.
- Unauthorized callers cannot retrieve a recorded result.
- Concurrent duplicate attempts produce one committed effect.

### Concurrency

- Two updates using the same revision cannot both succeed.
- The losing update receives a conflict.
- Sequence allocation is unique under competing connections.
- Lock contention terminates within the documented bound.

Use separate connections or processes where needed to create real contention. Do not describe sequential calls as concurrency tests.

### HTTP Safety

- Invalid input uses the shared error format.
- Unexpected failures do not expose internals.
- Missing authorization cannot mutate data.
- Test routes are absent from production composition.

Do not use production data or credentials.

## 14. Document the Data-Access Pattern

Create:

`docs/operations/local-data-access-and-transactions.md`

Document:

- Layer responsibilities.
- Repository conventions.
- Exact row mapping.
- Execution context and authorization boundary.
- Transaction ownership.
- Driver-specific callback limitations.
- Idempotency scope and fingerprinting.
- Revision-conflict behavior.
- Audit/outbox atomicity.
- Sequence allocation.
- Failure and retry policy.
- How future feature phases add commands safely.

Include a short command lifecycle description.

Clearly distinguish guarantees verified now from business workflows still to be implemented.

## Scope Limits

For this phase:

- Do not implement full farmer, buyer, billing, payment, or inventory APIs.
- Do not add arrivals, inventory, or permissions tables merely to broaden the first schema.
- Do not implement commission overrides or unapproved commission configuration.
- Do not implement authentication, provisioning, or remote permission synchronization.
- Do not implement cheque tracking.
- Do not connect desktop clients.
- Do not expose the service to the LAN.
- Do not implement cloud synchronization or printing.
- Do not change approved business rules.
- Do not commit, push, or deploy automatically.

## Check When Done

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check`

Verify that:

- Compiled service startup still works.
- Existing health behavior remains valid.
- No unauthenticated business mutation routes are exposed.
- Transaction tests use real SQLite.
- Required audit/outbox effects are atomic.
- Durable idempotency survives database reopen.
- Revision conflicts prevent lost updates.
- No sensitive runtime files are tracked.
- Existing migration checksums remain unchanged.

Run additional end-to-end checks only if application-facing behavior changed.

Review `git diff` and `git status --short`.

Report checks that could not run.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Repositories and transaction infrastructure implemented.
- Idempotency and concurrency behavior.
- Authorization integration points still awaiting phases 14–15.
- API validation and error handling completed.
- Test results.
- Schema limitations or unresolved business decisions.
- Readiness for phase 11, `11-supabase-schema-and-tenant-isolation.md`.

Preserve the core-operational-schema decision.

Do not mark billing, payments, authentication, or synchronization complete.

## Completion Report

Provide:

1. Data-access and transaction components created.
2. Verified atomicity, idempotency, and concurrency behavior.
3. Production endpoints exposed after this phase.
4. Test and build results.
5. Remaining blockers or deferred features.
6. Whether phase 11 can begin.