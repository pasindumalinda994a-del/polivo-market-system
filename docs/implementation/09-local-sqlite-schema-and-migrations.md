# 09 — Local SQLite Schema and Migrations

## Goal

Implement the local SQLite persistence foundation for Polivo.

Create the connection lifecycle, versioned migrations, approved initial schema, constraints, indexes, and database verification tests.

Each stall has one authoritative database on its designated host computer. Only the stall service opens that database.

Do not implement business APIs, billing screens, synchronization workers, or complete repositories yet.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Review phase 08’s business-rule register and accepted decisions.
4. Inspect `packages/domain`, `packages/contracts`, and `packages/db-local`.
5. Verify the existing service lifecycle and test configuration.
6. Identify approved numeric representations and unresolved schema decisions.

Check current official SQLite and driver documentation before selecting dependencies or connection settings.

Preserve existing work and migrations.

Do not claim this phase is complete if unresolved financial representations prevent required tables from being designed correctly.

## Updated Product Requirements

Apply these decisions where they supersede older context:

- Farmers and traders are registered by stall staff through the desktop application.
- Do not add public farmer/trader registration or online approval tables.
- Remove lorry-owner fields.
- Include basic arrivals and inventory tracking.
- Draft bills must support straightforward inline editing.
- The owner can configure billing-staff and cashier permissions, including through the web application.
- Farmer cheque payouts count as paid when physically handed over.
- Do not implement cheque clearance, rejection, or banking-lifecycle tracking.

For bill numbers, preserve the requested distinction between farmer and trader sequences.

The examples `111111` and `444444` are starting-number proposals, not proof that numeric ranges will remain distinct forever.

Use the approved final numbering policy if available. Otherwise, record the unresolved presentation and rollover policy without inventing one.

Do not infer how incoming trader cheques work from the farmer payout rule.

Update contradictory context references with these explicit decisions while preserving unrelated requirements.

## 1. Initialize the Local Database Package

Work inside:

`packages/db-local`

Preserve the package name:

`@polivo/db-local`

Create a focused structure for:

- Connection creation and closure.
- Connection configuration.
- Versioned SQL migrations.
- Migration execution.
- Schema-version inspection.
- Approved numeric persistence adapters.
- Database integration tests.

Provide explicit exports and working build/type-check scripts.

Select one maintained SQLite driver compatible with:

- The chosen Node.js runtime.
- Windows deployment.
- The stall-service build.
- Exact numeric handling.
- Transactions and SQLite backup capabilities.

Record the driver choice and rationale.

Avoid adding an ORM unless an existing accepted decision requires one.

SQLite is embedded; do not require a separate SQLite database server.

If the driver needs native binaries, verify installation and execution on the supported Windows environment.

## 2. Enforce Database Ownership

Only `apps/stall-service` may use `@polivo/db-local` in production.

Do not import it into:

- The web application.
- Electron main or preload.
- The desktop renderer.
- Shared UI components.
- Domain or contracts packages.

Tests and explicit maintenance commands may open isolated database files.

The production database must reside on the host’s local disk.

Do not use:

- An SMB/network share.
- A cloud-synchronized folder.
- A database file copied independently to each terminal.

Desktop terminals will access data through the service API.

## 3. Define Runtime Paths and Safe Opening

Configure an explicit database path outside the repository.

Document separate locations or configuration for:

- Local development.
- Tests.
- The future installed service.

Do not derive the production path from the current working directory.

Requirements:

- Resolve and validate paths.
- Create only the intended application-data directory.
- Fail clearly on permission or disk errors.
- Never fall back silently to an in-memory database.
- Never replace an unreadable database with a new empty one.
- Distinguish opening an existing database from explicitly initializing a new database.
- Require the normal service startup to open an existing initialized database.

Provide an explicit development initialization command.

Production first-run initialization will be coordinated with provisioning and installation later.

Do not create a fake tenant, owner, or device during initialization.

## 4. Configure SQLite Connections

Configure and verify:

- Foreign-key enforcement on every connection.
- WAL journal mode for file-backed runtime databases.
- A documented bounded busy timeout.
- A durability setting appropriate for committed financial records.
- A documented checkpoint strategy.

Prefer durability over an unmeasured write-speed optimization.

Do not disable foreign keys or durability settings to make tests pass.

Document that:

- WAL does not allow unlimited simultaneous writers.
- Busy timeouts do not replace transaction design.
- Checkpointing must not run after every bill.
- Open transactions and readers can affect WAL growth.
- WAL and shared-memory files are runtime data.

Do not implement ad hoc live backup by copying only the main database file.

Backup workflows belong to phase 38.

## 5. Implement Versioned Migrations

Use ordered, immutable migrations.

Maintain a migration-history table containing:

- Migration identifier.
- Name.
- Content checksum.
- Applied timestamp.

Requirements:

- Apply pending migrations in order.
- Record successful application atomically with the migration where supported.
- Roll back failed transactional migrations.
- Detect modified checksums for previously applied migrations.
- Refuse to open a database with a newer unsupported schema.
- Prevent concurrent migration execution.
- Recheck migration state after acquiring the required lock.
- Never auto-reset the database.
- Never run destructive down-migrations automatically.

Keep connection-level operations that cannot run inside a transaction outside migration transactions and handle them explicitly.

Ensure migration SQL files are available in compiled service builds. Do not depend on source-tree paths.

Add explicit migration and migration-status commands.

For this phase, normal service startup should verify schema compatibility rather than silently migrate an existing operational database.

## 6. Define the Initial Schema by Responsibility

Create only tables supported by approved requirements.

Use consistent names, timestamps, identifiers, foreign keys, and lifecycle fields.

Do not use one generic JSON document as the entire business database.

### Local Installation and Stall Binding

Represent:

- Database/installation identity.
- Local schema metadata.
- The single stall binding once provisioning occurs.

Prevent accidental binding of one operational database to another tenant.

An unprovisioned database must not contain fabricated business ownership.

### Staff and Devices

Provide approved persistence foundations for:

- Local staff identities.
- Device enrollment records.
- Permission assignments and policy versions.

Do not implement authentication or credential generation yet.

Store only necessary credential hashes or secure-store references when their design is confirmed.

Never create plaintext password, reusable token, or private-key storage by default.

Keep web-editable permission configuration separate from locally authoritative financial records.

Do not imply that remote permission changes take effect immediately while the stall is offline.

### Master Records

Include approved structures for:

- Farmers.
- Buyers/traders.
- Vegetable categories and vegetables.
- Package types.

Support unique short codes within the stall and record deactivation.

Do not delete master records that historical transactions reference.

### Arrivals and Basic Inventory

Represent approved arrival records and their lines:

- Farmer.
- Vegetable.
- Recording timestamp and business date.
- Package quantities and actual weights where required.
- References for subsequent movements.

Do not include a lorry owner.

Prefer traceable stock movements over an unexplained editable balance.

Before creating allocation-dependent constraints, confirm:

- Whether sales must reference an arrival lot.
- Whether negative stock is allowed.
- Whether remaining stock is measured by weight, package count, or both.
- How returns and corrections affect stock.

Do not invent FIFO allocation, automatic lot selection, or valuation rules.

### Bills and Sales

Provide approved structures for:

- Buyer bill headers.
- Sale lines.
- Individual package weights.
- Farmer allocations.
- Farmer bill links or grouping, where confirmed.
- Historical pricing and calculation snapshots.
- Draft/finalized lifecycle information.
- Correction references.
- Record revisions for later concurrency checks.

Avoid storing the same sale as two independent financial transactions merely because it appears on both buyer and farmer bills.

### Commission Configuration

Provide versioned configuration and snapshot fields supported by phase 08.

Do not seed example commission bands as production defaults.

Detailed commission validation and calculation belong to phase 20.

### Payments and Financial Records

Create approved foundations for:

- Payments.
- Payment-to-bill allocations.
- Farmer/buyer financial postings.
- Commission postings.
- Opening-balance entries.
- Reversal references.

Preserve exact amounts and explicit posting meaning.

Do not implement a full general ledger, payroll, or tax system.

For farmer cheque payouts, use the approved handover/payment semantics. Do not create a cheque-clearance subsystem.

If financial posting or allocation semantics remain unresolved, defer the affected tables or constraints explicitly.

Do not use guessed defaults or loosely structured JSON to bypass the decision.

## 7. Preserve Exact Numeric Values

Use phase 08’s approved representation.

Requirements:

- Do not store authoritative money or weights as SQLite REAL.
- Use scaled INTEGER values or canonical decimal TEXT according to the accepted design.
- Record units and scale where the design requires them.
- Verify driver behavior for integer values outside JavaScript’s safe-number range.
- Never silently convert exact values through JavaScript Number.
- Validate values when writing and reading.
- Preserve exact values across domain, database, and JSON conversions.

If decimal TEXT is used, do not rely on lexical ordering or ordinary SQLite numeric coercion for exact financial calculations.

Document how later reports will aggregate values accurately.

## 8. Enforce Integrity and Tenant Consistency

Add applicable:

- Primary keys.
- Foreign keys.
- Unique constraints.
- NOT NULL constraints.
- CHECK constraints.
- Composite keys needed to prevent cross-tenant relationships.

Enforce that business records belong to the bound stall.

A `tenant_id` column alone does not establish this guarantee.

Document how the database binding and relationships prevent mixed-stall data.

Use restrictive deletion behavior for finalized financial history.

Avoid cascading deletion of bills, payments, postings, audit records, or their historical references.

Cross-row invariants that cannot be expressed safely as database constraints must be documented for phase 10’s transaction layer.

Do not claim that schema constraints provide authorization.

## 9. Add Bill Sequence Persistence

Create transactional sequence storage keyed by the approved scope, such as stall and bill type.

Keep separate sequences for farmer and trader bills.

Requirements:

- Do not use `MAX(number) + 1`.
- Store bill type explicitly.
- Enforce the approved uniqueness scope.
- Keep internal record IDs separate from printed numbers.
- Preserve sequence state across restarts and later restores.
- Do not reset sequences automatically each day or year.
- Do not promise gap-free numbering.

Do not initialize proposed starting numbers until the final numbering policy is confirmed.

The allocation operation will be implemented in the service transaction layer.

## 10. Add Audit and Idempotency Foundations

### Audit Records

Include approved metadata such as:

- Event identity.
- Tenant.
- Actor and device references where known.
- Action.
- Target record.
- Timestamp.
- Request/correlation reference.
- Reason and safe change details where applicable.

Do not store passwords, tokens, or entire unrestricted request bodies.

Document append-only expectations.

Audit tables are not automatically tamper-proof against someone with direct disk access.

### Command Idempotency

Provide persistence for:

- Scoped idempotency key.
- Command type.
- Canonical request fingerprint.
- Durable result reference or appropriately bounded result.
- Completion metadata.

Enforce uniqueness at the approved scope.

Record that reusing a key with a different payload must be rejected.

Do not implement command execution or retry logic in this phase.

## 11. Add Transactional Outbox Tables

Create an outbox schema compatible with the shared event-envelope foundations.

Include:

- Stable event ID.
- Tenant and originating device.
- Event type and schema version.
- Payload.
- Occurrence timestamp.
- Local ordering metadata.
- Delivery attempt metadata.
- Acknowledgement state.

Separate event content from mutable delivery bookkeeping where practical.

Requirements:

- Stable event IDs support cloud deduplication.
- Delivery ordering must not rely only on wall-clock timestamps.
- JSON payloads must be validated before insertion.
- Invalid or unknown event versions must not be silently accepted.
- Acknowledgement must not cascade-delete business records.
- Financial changes and their outbox records must later commit in the same transaction.

Do not implement a sync worker, HTTP delivery, or cloud acknowledgement processing.

Document any aggregate ordering or revision decisions still required before concrete event producers are added.

## 12. Add Purposeful Indexes

Create indexes for anticipated, confirmed access patterns:

- Farmer/buyer short-code lookup.
- Bill-number lookup.
- Bills by business date.
- Farmer and buyer history.
- Payment allocation references.
- Inventory movement references.
- Pending outbox delivery.
- Audit lookup.
- Foreign-key relationships used by joins or deletions.

Inspect query plans for representative synthetic queries.

Avoid indexing every column.

Do not claim performance targets based on a small fixture dataset.

## 13. Integrate Database Lifecycle with the Service

Add the local database package to the stall service using `workspace:*`.

Implement:

- Explicit connection opening.
- Schema compatibility verification.
- Dependency injection into the application.
- Connection closure on shutdown.
- Cleanup if startup fails after opening the database.

Keep application construction testable without implicit production database access.

Preserve `/health` as a process-health endpoint.

If a readiness endpoint is introduced, define exactly what it checks. Schema readiness does not mean provisioning or synchronization is complete.

Do not add business endpoints or expose database paths through public responses.

## 14. Add Real SQLite Integration Tests

Use isolated temporary file-backed databases for WAL and persistence tests.

Cover:

- Fresh initialization.
- Applying migrations in order.
- Re-running migrations without duplicate effects.
- Reopening a migrated database.
- Failed migration rollback.
- Migration checksum mismatch.
- Newer unsupported schema rejection.
- Foreign-key enforcement.
- Duplicate-code and bill-number constraints.
- Mixed-tenant relationship rejection.
- Exact numeric round trips and range boundaries.
- Restricted deletion of referenced financial records.
- Transaction rollback across representative business and outbox rows.
- Bounded handling of competing write connections.
- Correct connection closure and temporary-file cleanup.

Use synthetic test migrations for migration-failure scenarios.

Do not modify real historical migrations or use an operational database.

Update existing service integration tests to inject test dependencies explicitly.

Verify native-driver loading in CI, including Windows where available.

## Documentation

Create:

`docs/operations/local-database-and-migrations.md`

Document:

- Driver and runtime compatibility.
- Database ownership and path configuration.
- Initialization, migration, status, and startup commands.
- WAL, durability, busy-timeout, and checkpoint settings.
- Migration checksums and compatibility policy.
- Exact numeric storage.
- Schema relationships and important constraints.
- Backup limitations.
- Unresolved schema decisions.
- Windows verification requirements.

Update environment documentation with only settings actually implemented.

## Scope Limits

For this phase:

- Do not implement full repositories or business commands.
- Do not implement billing, inventory, or payment APIs.
- Do not implement authentication.
- Do not provision real devices or tenants.
- Do not connect to Supabase.
- Do not implement synchronization.
- Do not implement backup scheduling or restore workflows.
- Do not create production financial defaults.
- Do not reset or migrate an existing operational database without an explicit request.
- Do not commit or push automatically.

## Check When Done

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check`

Also verify:

- Compiled builds can locate and apply migration files.
- The compiled service loads the SQLite driver.
- Startup rejects missing, incompatible, or unreadable databases clearly.
- Initialization and migration commands work on isolated development data.
- No database, WAL, backup, or credential files are tracked.
- Web and desktop builds do not import the local database package.

Report Windows or filesystem checks that could not run.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Driver and connection decisions.
- Migrations and tables implemented.
- Constraints and indexes verified.
- Numeric storage decisions.
- Updated product requirements applied.
- Explicitly deferred schema areas.
- Test results and platform limitations.
- Readiness for phase 10, `10-fastify-local-data-access-and-transactions.md`.

Record that the original cheque-lifecycle roadmap entry requires revision to match the approved no-tracking requirement.

Do not silently retain obsolete approval or lorry-owner requirements.

## Completion Report

Provide:

1. Files, tables, and migrations created.
2. Database initialization and migration commands.
3. Integrity and numeric-storage decisions.
4. Test and build results.
5. Deferred decisions and their impact.
6. Whether phase 10 can begin fully or only in unaffected areas.