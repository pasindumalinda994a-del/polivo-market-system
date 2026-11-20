# 31 — Cloud Sync Ingestion API

## Objective

Implement the cloud API that accepts committed operational events from an authorized stall host and applies them to the Supabase reporting copy.

This phase must deliver:

- Authenticated host-to-cloud ingestion.
- Versioned, validated event contracts.
- Strict tenant and stall isolation.
- Durable duplicate detection.
- Ordered, transactional cloud application.
- Explicit acknowledgements and recoverable errors.
- Cloud reporting projections consistent with local financial records.
- Security, concurrency, and failure tests.

The local stall database remains authoritative for operational transactions.

The cloud must not create another sale, payment, commission charge, or obligation when receiving an existing local event.

The local outbox sender is Phase 32. Cloud-to-stall configuration delivery is Phase 33. Reconciliation and recovery UI is Phase 34.

---

## 1. Review the Existing Architecture

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 11 Supabase schema and tenant isolation.
- Phase 12 Clerk integration.
- Phases 13–14 tenant membership and device enrollment.
- Existing host credential and revocation mechanisms.
- Local outbox implementation from Phases 09–30.
- Financial source identities and correction rules.
- Phase 28 reporting snapshots.
- Phase 30 report definitions.

Inspect:

1. Where the cloud API belongs in the existing deployment architecture.
2. How activated hosts authenticate to cloud services.
3. How the current authorized host is identified for a stall.
4. Actual outbox envelopes and payload versions.
5. Whether related events identify their originating local transaction.
6. Cloud tables already intended as operational replicas.
7. Existing migration and integration-test tooling.

Use the existing web/server architecture. Do not add a separate microservice without a demonstrated requirement.

Mark Phase 31 as `IN_PROGRESS`.

---

## 2. Establish Authority Boundaries

Document the authority map.

### Local host authority

- Operational party and catalog changes within the approved scope.
- Finalized sales and bills.
- Commission snapshots.
- Ledger postings.
- Payments and allocations.
- Corrections and reversals.
- Other explicitly approved local operational records.

### Cloud authority

- Tenant and membership administration.
- Device enrollment and revocation.
- Cloud-managed configuration under existing decisions.
- Access policy delivery in the later configuration-sync phase.

### Cloud reporting copy

Stores accepted local facts and derives read-only reporting views.

Ingestion must not overwrite cloud-authoritative access settings from a local payload.

Do not enable web clients to edit replicated financial records directly.

Do not implement bidirectional financial conflict resolution or last-write-wins merging.

---

## 3. Inventory Every Outbox Event

Create an explicit event compatibility matrix.

For each event, document:

- Event name.
- Schema version.
- Producing operation.
- Aggregate identity and revision.
- Tenant and stall scope.
- Source transaction/group identity.
- Required dependencies.
- Cloud destination.
- Whether it carries facts, document relationships, or operational metadata.
- Whether it affects reporting totals.

Include implemented events for:

- Farmers and buyers.
- Vegetables and package types.
- Commission policies.
- Openings and ledger postings.
- Sales and buyer bills.
- Farmer bills.
- Corrections and reversals.
- Payments and allocations.
- Cheque metadata.
- Print and export audit events where cloud retention is approved.

Do not assume all historical outbox rows use the latest contract.

For each unsupported legacy version, define a deterministic adapter or an explicit blocking error.

Never acknowledge an unknown event as successfully applied merely to advance sync.

---

## 4. Define Stable Source and Stream Identity

Reuse existing source identities where sound.

Distinguish:

- Tenant.
- Stall.
- Authorized host device.
- Source database/stream identity.
- Stream generation or epoch, if required.
- Event ID.
- Event sequence.
- Local transaction/group ID.
- Aggregate ID and revision.

A replacement host must not collide with an older host’s event stream.

A restored database must not silently reuse sequence positions for different events.

Document how existing enrollment and restore plans will authorize stream continuation or a new generation.

Do not mint a new generation automatically whenever the service restarts or encounters a conflict.

Preserve stable business IDs across replication.

Bill numbers are display/business references, not globally unique replication keys.

---

## 5. Define the Versioned Ingestion Contract

Extend the shared contracts package.

A bounded request should identify:

- Protocol version.
- Request/batch ID.
- Source stream.
- Ordered event groups.
- Relevant client/schema compatibility information.

Each event must carry the approved fields, including:

- Stable event ID.
- Event type and schema version.
- Sequence.
- Aggregate identity and revision where applicable.
- Source transaction/group reference.
- Occurrence/business timestamps.
- Payload.

Derive authorized tenant and stall from the authenticated host context.

If the envelope includes scope, verify an exact match.

Define limits for:

- Encoded request bytes.
- Event count.
- Transaction-group size.
- String lengths.
- Nested payload depth.
- Numeric ranges.
- Response size.

Serialize money, weight, and large sequence values without JavaScript precision loss.

Reject unknown event types, unsupported versions, duplicate JSON keys where the chosen parser permits detection, and malformed payloads according to a documented policy.

Never deserialize incoming content into executable code or SQL identifiers.

---

## 6. Authenticate the Enrolled Host

Use the established host/device authentication mechanism.

The caller must prove it is:

- Activated.
- Authorized for the target stall.
- Permitted to upload operational events.
- Not revoked or replaced under the current host-authority rules.

A Clerk browser session alone is insufficient for host ingestion.

A terminal credential must not impersonate the stall host.

Do not distribute Supabase privileged credentials to the host or desktop.

If the enrollment mechanism needs an upload authorization extension, implement it through the existing credential model and document it.

Use proven cryptographic libraries and protocols.

Where request signing is used, bind the proof to the intended request and verify it according to the approved protocol.

Transport replay protection must still allow legitimate retries with fresh request authentication and the same immutable event IDs.

Keep host-supplied local staff identities as provenance. Do not pretend cloud membership checks authenticate the historical offline staff action.

---

## 7. Enforce Authorization at the Write Boundary

Do not rely solely on checking the host before opening a database transaction.

At the authoritative cloud write boundary, recheck the relevant:

- Device status.
- Stall assignment.
- Host authority.
- Stream generation.
- Revocation/version state.

Prevent a request authenticated before revocation from writing indefinitely after authority changes.

Serialize authority changes and ingestion where required by the established model.

Use a dedicated, narrowly scoped database function or equivalent transaction boundary.

If using a privileged server client:

- Keep it server-only.
- Pass validated identity context internally.
- Never expose a generic privileged database proxy.
- Validate every event’s scope again.

Cross-stall references in nested records must be rejected.

---

## 8. Add Durable Inbox and Stream State

Create forward-only Supabase migrations as needed.

Reuse existing structures where appropriate.

Support:

- Source stream registration.
- Expected sequence or committed cursor.
- Durable event receipts.
- Canonical payload hashes.
- Source transaction/group receipts.
- Applied status and timestamps.
- Compatibility metadata.
- Safe failure diagnostics.

Enforce unique identities for:

- Event ID within its approved scope.
- Sequence position within a source stream.
- Transaction/group identity where applicable.
- Immutable business source records.

An event received twice with identical immutable content is a duplicate.

An event ID or sequence reused with different content is an integrity conflict.

Do not overwrite the original receipt.

Compute a documented canonical representation and hash server-side. Do not trust a sender-provided hash as the only integrity check.

Retain deduplication identities long enough to support replay and restore. Do not delete them under a short cleanup policy that permits financial duplication.

---

## 9. Preserve Transaction Groups and Ordering

Inspect how one local financial operation produces its outbox events.

A sale may include:

- Sale facts.
- Bill relationships.
- Ledger entries.
- Audit or related operational events.

A payment may include:

- Payment facts.
- Ledger effects.
- Allocations.

The cloud must not expose half of a committed financial operation as a complete reporting state.

Use the existing operation envelope if it already contains all required facts.

Otherwise, define complete source transaction groups with a verifiable boundary.

Do not infer group completeness from adjacent timestamps.

Choose and document one bounded application contract, preferably:

- Process groups in source order.
- Apply each complete group atomically.
- Stop at the first failed group.
- Return the committed contiguous prefix.

Reject incomplete groups without acknowledging them.

If sequence values are not contiguous by construction, define the expected-next rule explicitly rather than assuming every integer must exist.

---

## 10. Implement Transactional Event Application

For each accepted group, use one Postgres transaction to:

1. Recheck source authority.
2. Lock or serialize the source stream state.
3. Validate sequence and duplicate identities.
4. Validate all event schemas and references.
5. Apply the complete group’s facts and relationships.
6. Update relevant reporting projections.
7. Insert durable applied receipts.
8. Advance the committed cursor.
9. Commit.

Only acknowledge successful application after commit.

Do not use several independent database REST requests as if they formed one transaction.

Use an appropriate transactional SQL function or supported server-side database transaction mechanism.

Concurrent uploads from the same stream must not advance the cursor inconsistently.

Different stalls should not require a global serialization lock.

Keep request execution bounded for the actual hosting environment.

---

## 11. Apply Financial Facts Exactly Once

Replicate original source identities and exact amounts.

Do not call local sale-finalization or payment-posting workflows in the cloud.

Define one canonical source for every reporting effect.

In particular:

- Buyer-bill issuance must not add another sale.
- Farmer-bill issuance must not add another payable.
- Allocation must not add another receipt or payout.
- Cheque handover is the recorded payment event; no later clearance event is needed.
- A correction must retain its original, reversal, and replacement relationships.
- Print and export events must not change financial totals.

If both domain events and ledger events describe the same operation, store their relationship without summing both as independent money movement.

Preserve original commission snapshots.

Do not recalculate historical amounts using current cloud configuration.

Validate internal arithmetic and required relationships using exact representations and the documented event version.

---

## 12. Handle Revisions and Dependencies Explicitly

For mutable master-data projections:

- Require the expected revision transition.
- Apply changes in the authorized source order.
- Preserve inactive/deactivated state.
- Reject stale or conflicting changes according to the contract.

For immutable financial records:

- Insert once.
- Compare identical replays.
- Reject conflicting rewrites.
- Apply corrections through separate linked records.

If a dependency is missing:

- Return a structured dependency or sequence error.
- Leave the group unapplied.
- Do not create guessed financial parent records.
- Do not drop foreign-key checks to force acceptance.

Support dependencies within the same complete transaction group.

Do not use device timestamps as the primary conflict-resolution mechanism.

---

## 13. Define Precise Acknowledgements

Return explicit per-group or per-event outcomes consistent with the chosen transaction model:

- Applied.
- Already applied with matching content.
- Retryable failure.
- Sequence/dependency conflict.
- Unsupported version.
- Integrity conflict.
- Authorization failure.

Include:

- Correlation ID.
- Source stream/generation.
- Committed contiguous cursor.
- Acknowledged identities.
- Next expected position where meaningful.
- Stable error code.
- Retry guidance.

A generic HTTP 200 response must not imply every submitted event was applied.

Do not acknowledge an event merely because its raw payload was logged.

If asynchronous durable intake is ever introduced, distinguish “received” from “applied” and define separate cursors. Do not add that complexity unless required.

Phase 32 must mark only explicitly acknowledged events as delivered.

Local operational data must remain stored after acknowledgement.

---

## 14. Handle Failures Without Data Loss

Cover:

### Response lost after commit

A retry returns matching duplicate receipts and the committed cursor.

### Failure before commit

No applied receipt, partial projection, or cursor advance survives.

### Failure after earlier groups committed

Return or allow lookup of the committed prefix. Retrying the full bounded batch remains safe.

### Unsupported or invalid event

Return a stable actionable error. Do not skip it automatically.

### Sequence collision after restore

Stop the conflicting stream and expose diagnostics. Do not reset cloud state or accept a new generation automatically.

### Temporary infrastructure failure

Return a retryable response without falsely acknowledging application.

Do not spawn unawaited background work after the request returns and assume the hosting platform will complete it.

---

## 15. Preserve RLS and Database Privilege Boundaries

Maintain tenant isolation on all replicated tables and reporting views.

Test access using realistic authenticated roles.

Ensure:

- Tenant members see only authorized stall data.
- Browser users cannot insert replicated financial rows.
- Anonymous users cannot inspect inbox payloads or diagnostics.
- Host credentials cannot act as general reporting credentials.
- Ingestion functions are not executable by unintended roles.

For privileged SQL functions:

- Use explicit object qualification and a safe search path.
- Restrict execution grants.
- Validate trusted caller context.
- Avoid dynamic SQL driven by payload fields.

RLS alone does not protect against incorrectly scoped privileged writes. Keep explicit scope validation inside ingestion.

Do not alter existing Clerk integration to make host uploads work.

---

## 16. Add Compatibility and Initial-Upload Rules

Document the supported protocol and event-schema versions.

Support retained historical outbox versions through explicit adapters where feasible.

Do not silently change payloads of existing committed events to fit a new schema.

If a required event field was never recorded:

- Identify whether it can be recovered from an immutable local source.
- Define an explicit repair/bootstrap mechanism.
- Keep affected uploads blocked until that mechanism is available.
- Never invent historical facts.

Do not automatically mark old local records synced.

Define prerequisites for the first upload:

- Authorized stream.
- Known initial sequence boundary.
- Required master/configuration records.
- Compatible event versions.

Do not implement a bulk database upload disguised as ordinary events without an approved bootstrap contract.

Record larger recovery/bootstrap work for the relevant later phase.

---

## 17. Add Limits and Operational Diagnostics

Implement bounded request handling and appropriate rate limits.

Use shared or durable enforcement where required by the hosting model; do not rely solely on per-process memory for cross-instance protection.

Return retry guidance for throttling.

Record safe metrics such as:

- Requests and groups accepted.
- Events applied and deduplicated.
- Apply latency.
- Sequence conflicts.
- Unsupported versions.
- Authorization failures.
- Retryable failures.

Log correlation IDs and source identities without credentials or full financial payloads.

Retain occurrence time and server-received time separately.

A source timestamp alone is not reliable proof of sync lag.

Do not report a stall as fully synchronized merely because one request succeeded. The cloud may not yet know the host’s current outbox tail.

---

## 18. Add Automated Integration Tests

Use an isolated Postgres/Supabase-compatible test environment.

### Authentication and isolation

Cover:

- Activated host succeeds.
- Terminal credential denied.
- Revoked or replaced host denied.
- Wrong stall and tenant denied.
- Nested cross-stall references denied.
- Authority change racing with ingestion.
- Browser and anonymous direct writes denied.
- Unauthorized function execution denied.

### Idempotency and ordering

Cover:

- Identical event replay.
- Same event ID with changed payload.
- Same sequence with a different event.
- Concurrent identical requests.
- Out-of-order groups.
- Missing dependencies.
- Incomplete transaction group.
- Response lost after commit.
- Retry of a partially committed batch.
- Stream-generation collision.

### Financial replication

Cover complete source flows:

1. Party and catalog setup.
2. Commission configuration.
3. Opening balances.
4. Buyer sale and bill.
5. Farmer bill.
6. Cash and bank payments.
7. Cheque handover.
8. Allocations and releases where supported.
9. Payment reversal.
10. Sale correction and replacement.

Compare cloud facts and totals with local expected results at the same acknowledged cutoff.

Verify bill grouping, allocation, print, and export events never double-count financial activity.

### Failure injection

Fail during:

- Fact insertion.
- Ledger replication.
- Allocation insertion.
- Receipt persistence.
- Cursor update.

Verify complete group rollback.

Test maximum request sizes, exact large-number serialization, unsupported versions, and malformed payloads.

---

## 19. Provide a Development Verification Harness

Create a documented, bounded ingestion test client or harness.

It must:

- Use the real development authentication path.
- Read credentials through approved secure mechanisms.
- Target an explicitly configured development endpoint.
- Send known synthetic event fixtures.
- Display acknowledgements and safe diagnostics.
- Support replay and failure scenarios.

Do not place credentials in command-line arguments, logs, committed fixtures, or browser storage.

Do not build the production polling/retry worker here.

Use fixtures or a controlled adapter to real committed test outbox events without marking local events delivered outside the eventual Phase 32 contract.

---

## 20. Document Deployment and Acceptance

Create or update:

`docs/operations/cloud-sync-ingestion.md`

Document:

- Endpoint and protocol.
- Host authentication.
- Authority boundaries.
- Event compatibility matrix.
- Stream and generation identity.
- Transaction grouping.
- Ordering and acknowledgement rules.
- Error classification.
- Limits.
- RLS and database grants.
- Development verification.
- Initial-upload prerequisites.
- Phase 32 sender requirements.

Prepare a development/staging checklist:

1. Confirm the target Supabase project and environment.
2. Apply the reviewed cloud migrations.
3. Configure server-only credentials.
4. Start or deploy the development ingestion endpoint.
5. Use an activated test host.
6. Upload a complete synthetic transaction group.
7. Verify cloud facts and committed acknowledgement.
8. Replay it and confirm no duplication.
9. Submit altered content with the same identity and verify rejection.
10. Test an incorrect stall scope.
11. Test a revoked host.
12. Test a sequence gap.
13. Test a financial group failure and verify rollback.
14. Upload a complete sale/payment/correction flow.
15. Compare cloud totals with local totals at the same cutoff.
16. Verify browser reporting access respects tenant membership.
17. Confirm secrets and full payloads are absent from logs.

Do not apply migrations to production while following the development checklist.

Record unavailable remote checks as pending.

Run applicable formatting, lint, type, contract, database, authentication, ingestion, RLS, and build checks.

Report:

1. Files and migrations changed.
2. Supported event types and versions.
3. Authentication and isolation behavior.
4. Transaction and acknowledgement guarantees.
5. Tests executed and results.
6. Manual cloud checks completed or pending.
7. Legacy-event or bootstrap limitations.
8. Readiness for Phase 32.

## Acceptance Criteria

- Only an authorized active host can upload its stall’s events.
- Event identities, stream positions, and payload integrity are durable.
- Replays cannot duplicate cloud financial effects.
- Conflicting identities are rejected.
- Complete source transaction groups apply atomically.
- Cursor advancement reflects committed application only.
- Cloud reporting preserves local financial facts and correction lineage.
- RLS and privileged write boundaries prevent cross-tenant access.
- Unsupported events are never silently acknowledged.
- Failures produce actionable, safe retry semantics.
- The ingestion contract is ready for the Phase 32 outbox worker.
- Tests pass and remaining remote acceptance work is documented.