# Local Database and Migrations

This document describes the stall’s authoritative SQLite database owned by `@polivo/db-local` and opened only by `apps/stall-service` (plus explicit maintenance commands and isolated tests).

## Driver and runtime

| Item     | Choice                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Driver   | Node.js built-in `node:sqlite` (`DatabaseSync`)                                    |
| Node     | `>=26.13.0 <27` (`.node-version` `26.13.0`)                                        |
| ORM      | None                                                                               |
| Decision | [0007 — Local SQLite driver](../decisions/0007-local-sqlite-driver-node-sqlite.md) |

`node:sqlite` is Stability 1.2 (release candidate) on Node 26.13.0. Pin the Node minor and review upgrade notes before changing the runtime. No native addon build is required on Windows.

## Ownership and paths

- Only the stall service may open the operational database in production.
- Do not import `@polivo/db-local` into web, desktop, UI, domain, or contracts packages.
- The database file must live on the host’s local disk — not an SMB share, cloud-synced folder, or per-terminal copy.
- Desktop terminals access data through the stall-service API.

### Path configuration

| Context             | Setting                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Stall service / CLI | Absolute path in `POLIVO_LOCAL_DB_PATH`                                                              |
| Tests               | Temporary file-backed databases under the OS temp directory                                          |
| Installed service   | Future provisioning will place the file under an application-data directory (not derived from `cwd`) |

Rules:

- Operational paths must be absolute.
- Never fall back silently to `:memory:`.
- Never replace an unreadable database with a new empty file.
- Distinguishing modes: `initializeNewDatabase` vs `openExistingDatabase` / `openExistingDatabaseAndVerify`.

## Connection settings

Applied on every file-backed connection:

| Setting      | Value   | Notes                                                  |
| ------------ | ------- | ------------------------------------------------------ |
| Foreign keys | ON      | Enforced; not disabled for tests                       |
| Journal mode | WAL     | Concurrent readers; not unlimited writers              |
| Busy timeout | 5000 ms | Bounded wait only; does not replace transaction design |
| Synchronous  | FULL    | Prefer durability for financial commits                |

Checkpointing must not run after every bill. Open transactions and readers affect WAL growth. `.db-wal` and `.db-shm` files are runtime data. Do not implement live backup by copying only the main database file (phase 38).

## Commands

Build `@polivo/db-local` first so `dist/` and bundled SQL migrations exist.

```powershell
pnpm --filter @polivo/db-local build
```

Set an absolute path, then:

```powershell
$env:POLIVO_LOCAL_DB_PATH = "D:\polivo-data\stall.sqlite"
pnpm --filter @polivo/db-local db:init      # create new DB + apply migrations
pnpm --filter @polivo/db-local db:migrate   # apply pending migrations only
pnpm --filter @polivo/db-local db:status    # applied / pending
```

Normal stall-service startup opens an existing database and **verifies** schema compatibility. It does **not** auto-migrate an operational database.

Initialization creates `local_installation` identity only. It does not fabricate tenant, owner, or device rows. `stall_binding` remains empty until provisioning.

## Migrations

- Ordered, immutable SQL under `packages/db-local/src/migrations/sql/`.
- Copied into `dist/migrations/sql/` on package build so compiled services do not depend on the source tree.
- History table `schema_migrations`: `id`, `name`, `checksum` (SHA-256 of file contents), `applied_at`.
- Pending migrations apply under `BEGIN IMMEDIATE` with recheck after lock.
- Checksum mismatches and newer unsupported schemas refuse to open.
- No automatic down-migrations or database resets.

First migration `001_initial_core_schema` follows [0004](../decisions/0004-phase-09-first-migration-schema-breadth.md).

## Exact numeric storage

| Quantity | SQLite type | Representation           |
| -------- | ----------- | ------------------------ |
| Money    | INTEGER     | Paisa (`MoneyMinor`)     |
| Weight   | INTEGER     | Hundredths of a kilogram |

Do not store authoritative money or weights as REAL. Adapters in `@polivo/db-local` validate integer values and refuse unsafe JavaScript `Number` coercion. Aggregate reports must use integer/`BigInt` arithmetic, not REAL casts.

## Schema relationships (core)

- Stall scoping: business tables carry `stall_id`; composite foreign keys `(id, stall_id)` prevent mixed-stall relationships. A `tenant_id` column alone is not sufficient.
- One sale foundation: `sales` / `sale_lines` / package weights / farmer allocations; `farmer_bills` and `trader_bills` reference the same sale rather than duplicating independent financial transactions.
- Commission: stall-level band sets only ([0005](../decisions/0005-commission-configuration-v1.md)); snapshot rate/amount columns on sale lines; no production seeds.
- Bill sequences: `bill_sequences` keyed by `(stall_id, bill_type)`; no `MAX(number)+1`; starting numbers not seeded until numbering policy is finalized.
- Payments: method `cash` \| `bank_transfer` \| `cheque`; no cheque-clearance columns.
- Audit / idempotency / sync outbox scaffolding for later phases.

Restrictive deletes: referenced farmers, traders, sales, and bills cannot be deleted while dependents exist (`ON DELETE RESTRICT`).

### Deferred from first migration

Arrivals, inventory movements, staff, devices, permissions, vegetable categories, package-type masters, GL/postings/opening balances, cheque clearance, commission overrides.

Bill-number presentation/rollover policy beyond `F-`/`T-` formats remains open; sequences start at `next_value = 0` only when rows are created by later allocation logic (not seeded here).

## Data access and transactions

Repositories, the synchronous transaction executor, durable command idempotency, revision checks, and audit/outbox atomicity are documented in [local-data-access-and-transactions.md](./local-data-access-and-transactions.md).

## Backup limitations

Cloud sync is not a backup. Do not copy only the main `.sqlite` file while the service is running. Use SQLite-aware backup APIs in phase 38.

## Windows verification

Verified on Windows with Node 26.13.0: package build, `node:sqlite` load, file-backed WAL tests, and temporary-directory cleanup (best-effort if WAL sidecars linger briefly). Ubuntu CI `quality-and-build` also exercises unit/integration tests under Node from `.node-version`.
