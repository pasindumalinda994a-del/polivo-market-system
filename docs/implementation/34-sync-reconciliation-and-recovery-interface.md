# 34 — Sync Reconciliation and Recovery Interface

## Objective

Implement an operational interface for understanding sync progress, verifying local/cloud consistency, and performing bounded recovery actions.

This phase must deliver:

- A consolidated desktop sync workspace.
- Separate operational-upload and configuration-delivery status.
- Reconciliation at an explicitly shared cutoff.
- Actionable diagnostics for blocked events and configuration.
- Safe retry and replay through existing workers.
- Audited recovery operations.
- Redacted diagnostic export.
- End-to-end verification of Phases 31–33.

Local financial records remain authoritative.

Reconciliation must not overwrite local transactions, create balancing entries, skip failed events, or silently reset synchronization history.

Host replacement, database restore, and full backup recovery remain in their scheduled later phases.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 31 ingestion receipts, streams, and acknowledgements.
- Phase 32 outbox worker, signing, retries, and ownership.
- Phase 33 configuration publication, application, and acknowledgement.
- Phase 28 snapshot and reconciliation semantics.
- Phase 30 financial report definitions.
- Existing security, audit, and diagnostic-export patterns.

Inspect:

1. Actual stream and generation identities.
2. Local and cloud cursor semantics.
3. Available cloud receipt lookup.
4. Immutable source-event representations.
5. Any event adapters or enrichers used during upload.
6. Configuration revision and payload identity.
7. Existing worker status and controls.
8. Pending live enrolled-host acceptance.

Mark Phase 34 as `IN_PROGRESS`.

Do not treat mocked signing or simulated storage as live host verification.

---

## 2. Define What Reconciliation Proves

Separate three checks:

### Delivery reconciliation

Verifies that expected local event groups have matching cloud application receipts.

### Data reconciliation

Verifies that replicated facts and relationships match the authoritative source at a common cutoff.

### Reporting reconciliation

Verifies selected derived totals using equivalent definitions and the same included facts.

Matching cursors alone does not prove that reporting projections are correct.

Matching financial totals alone does not prove that all records are present.

Each result must state:

- Scope.
- Stream and generation.
- Compared cutoff.
- Compared domains.
- Definition/schema version.
- Completion time.
- Whether the comparison was complete or limited.

Use “Matched through cutoff X” instead of an unqualified “All data is correct.”

---

## 3. Preserve Authority and Recovery Boundaries

Implement recovery according to data ownership.

| Condition | Safe action |
|---|---|
| Pending upload after transient failure | Retry existing worker |
| Cloud committed, local acknowledgement missing | Replay original events or verify exact receipts |
| Configuration downloaded but not applied | Retry validated application |
| Configuration applied but acknowledgement missing | Retry acknowledgement |
| Unsupported event/schema | Show compatibility blocker |
| Same event identity with different content | Stop and escalate integrity conflict |
| Cloud projection differs from accepted facts | Diagnose and use a dedicated projection repair path |
| Local source history is missing | Stop and require explicit recovery/bootstrap |
| Host or stream generation mismatch | Follow host/restore recovery procedures |

Do not add generic controls named:

- Force synced.
- Skip event.
- Reset cursor.
- Delete failed event.
- Trust cloud balance.
- Recreate host identity.

Do not offer a general “Fix all” action.

---

## 4. Build a Consolidated Status Contract

Extend shared contracts with a service-generated status response.

Include:

### Operational upload

- Worker state.
- Host/source readiness.
- Local committed tail.
- Locally acknowledged cursor.
- Latest verified cloud cursor.
- Pending event/group count.
- Oldest pending recording time.
- Last attempt and successful progress.
- Retry deadline.
- First blocking group and safe error code.

### Configuration and access

- Published revision when known.
- Downloaded revision.
- Locally applied revision.
- Cloud-acknowledged applied revision.
- Snapshot validity.
- Pending application acknowledgement.
- Last refresh and blocking error.

### Reconciliation

- Latest run state.
- Scope and cutoff.
- Match/mismatch summary.
- Incomplete-domain warnings.
- Safe next action.

Attach observation times to remote values.

Do not present cached remote status as a live observation.

---

## 5. Implement a Common Reconciliation Cutoff

Use complete transaction-group boundaries.

Capture:

1. Local stream identity.
2. Local committed tail at the start of the run.
3. Verified cloud application progress.
4. A common comparable boundary.
5. The versions of the comparison definitions.

Do not compare the current local database with an older cloud snapshot and call the difference corruption.

Distinguish:

- Expected unsent backlog.
- Cloud-acknowledged events awaiting local acknowledgement.
- Actual mismatch within the compared prefix.

For mutable records, reconstruct state at the cutoff through immutable event history, a versioned projection, or another verified snapshot mechanism.

Do not compare today’s master-data revision against an older cloud revision as though both represent the same point.

If consistent historical reconstruction is unavailable, mark that domain inconclusive and explain why.

Do not hold a SQLite transaction open while waiting for network calls.

---

## 6. Add Scoped Cloud Reconciliation Endpoints

Extend the Phase 31 cloud API with bounded read operations where necessary.

Support:

- Stream progress lookup.
- Applied receipt lookup by bounded event/group IDs or ranges.
- Versioned manifest retrieval.
- Scoped comparison summaries.

Authenticate through the existing enrolled-host mechanism.

Enforce:

- Tenant and stall assignment.
- Current host authority.
- Stream/generation scope.
- Request limits.
- Pagination.
- Safe diagnostic fields.

A tenant owner’s web view must use normal cloud membership authorization.

Do not expose a privileged generic SQL or table-dump endpoint.

Receipt responses must identify exact event/group content according to the existing hashing contract.

Do not accept a cloud cursor alone as proof that particular local payloads match.

---

## 7. Implement Event and Record Manifests

Use deterministic canonicalization and hashing.

Define explicitly:

- Included fields.
- Field ordering.
- Numeric serialization.
- Timestamp representation.
- Null versus omitted values.
- Record ordering.
- Hash algorithm and manifest version.

Separate:

- Source event payload identity.
- Actual transmitted representation.
- Replicated record content.
- Reporting projection content.

Inspect any Phase 32 enrichers.

An event transformed for transport must have a deterministic, versioned representation. Replaying it after later local changes must not generate different content under the same event identity.

Do not hide inconsistent enrichments by changing stored hashes.

Use chunked manifests for larger datasets.

Compare counts and hashes, then retrieve bounded mismatch details.

Exclude irrelevant cloud receipt timestamps from business-content comparison.

Include enough relationships to detect missing allocations, bill links, reversals, and correction lineage.

---

## 8. Reconcile Financial Domains Without Double Counting

Compare the authoritative replicated facts for:

- Opening balances.
- Sales and sale lines.
- Commission snapshots.
- Buyer and farmer bill relationships.
- Ledger entries.
- Payments.
- Allocations and releases.
- Corrections and reversals.

Use Phase 28–30 definitions for derived checks.

Verify:

- Exact ledger balances by account and currency.
- Remaining obligations.
- Active allocated amounts.
- Supported unapplied amounts.
- Recorded commission.
- Gross sale and farmer-entitlement totals.

Preserve these rules:

- Farmer-bill issuance creates no second sale or payable.
- Allocation creates no second payment.
- Cheque payout settles at recorded handover.
- Reversal and replacement records remain separately traceable.
- Different currencies and party roles remain separate.

Return exact differences.

Do not use rounding tolerances to conceal discrepancies.

---

## 9. Classify Mismatches and Their Causes

Provide stable diagnostic categories, including:

- Expected upload backlog.
- Missing cloud receipt.
- Missing local acknowledgement.
- Missing cloud fact.
- Different immutable payload.
- Missing relationship.
- Stale projection.
- Unsupported comparison version.
- Incomplete source history.
- Stream/generation conflict.
- Configuration application pending.
- Configuration acknowledgement pending.
- Access snapshot expired.
- Remote state unavailable.

For each category, show:

- What was observed.
- Compared scope and cutoff.
- Whether local operation is affected.
- Whether automatic retry is appropriate.
- Available authorized action.
- Required support or later recovery workflow.

Do not call every network failure a data mismatch.

Do not infer host revocation from an arbitrary error string.

---

## 10. Implement Bounded Recovery Plans

Before a recovery action, generate a concrete plan.

Include:

- Action type.
- Target stream or configuration domain.
- Exact event/group range or revision.
- Expected current state.
- Number of affected items.
- Why the action is safe.
- Potential outcome.
- Required capability.

Persist a plan identity or validate an equivalent signed/versioned request.

Recheck eligibility immediately before execution.

Reject stale plans if relevant state changed.

Use idempotency for recovery execution.

Do not let the renderer submit arbitrary cursor values, payload replacements, or database commands.

---

## 11. Support Safe Upload Retry and Replay

Reuse the Phase 32 worker.

### Retry now

- Wake the existing worker.
- Respect ownership and server throttling.
- Do not start a second loop.
- Do not bypass blocking compatibility or integrity checks.

### Replay original events

Where the protocol supports it:

- Use the original immutable identities and content.
- Preserve complete transaction groups.
- Use bounded ranges.
- Authenticate normally.
- Let Phase 31 verify matching duplicates.
- Apply only valid acknowledgements locally.

Do not create new event IDs to force acceptance.

Do not rewind acknowledged progress merely to request replay.

A missing local acknowledgement can be repaired only from verified matching cloud evidence or replay through normal ingestion.

Record this as acknowledgement recovery, not a new financial operation.

---

## 12. Handle Missing Cloud Facts and Projection Drift

Distinguish two cases.

### Event never applied

Normal upload or replay may apply the missing event.

### Event receipt exists, but its facts or projections are wrong

Duplicate ingestion may correctly return “already applied” without rebuilding anything.

Do not assume replay repairs this condition.

Provide a diagnostic outcome and a dedicated repair path only if it can rebuild from retained authoritative accepted facts.

Any implemented cloud projection repair must:

- Be narrowly scoped.
- Require an appropriate elevated capability.
- Preserve original receipts and financial identities.
- Use a reviewed plan.
- Rebuild only derived data.
- Verify the result afterward.
- Produce an audit record.

Do not delete receipts to force re-ingestion.

If durable source facts are insufficient, block repair and document the required support workflow.

Do not download cloud reporting data to overwrite local operational records.

---

## 13. Support Configuration Recovery

Reuse Phase 33 mechanisms.

Allow authorized actions to:

- Refresh published configuration.
- Retry application of the same validated revision.
- Retry an application acknowledgement.
- Inspect compatibility or mapping blockers.

Preserve:

- Monotonic revisions.
- Payload identity checks.
- Atomic application.
- Active-session invalidation.
- Approved expiry policy.

Do not extend expiry while retrying.

Do not treat a repeated acknowledgement as another application.

Do not roll back permissions to an older revision through recovery controls.

A blocked operational upload must not unnecessarily prevent configuration refresh.

Keep published, applied, and acknowledged states separate.

---

## 14. Implement Recovery Job Lifecycle

Use durable operational job records where needed.

Track:

- Requested.
- Running.
- Completed.
- Failed.
- Cancelled.
- Outcome uncertain.

Include actor, device, scope, plan identity, progress, and safe result details.

Bound work per job.

Prevent concurrent conflicting recovery actions on the same stream/domain through existing worker ownership or appropriate locks.

Cancellation stops future work. It must not undo already committed cloud groups.

After restart, recover using durable receipts and job progress.

Do not blindly repeat a completed repair because the desktop missed its response.

Keep billing database transactions short.

---

## 15. Build the Desktop Sync Workspace

Extend the existing Cloud sync view.

Provide:

### Overview

- Upload progress.
- Configuration/access status.
- Last verified comparison.
- Local and cloud observation times.
- Clear pending or blocked indicators.

### Pending and blocked items

- Event/group type.
- Safe source reference.
- Recording time.
- Attempt count.
- Error category.
- Next eligible retry.
- Recommended action.

Do not expose raw financial payloads by default.

### Reconciliation

- Run comparison.
- Scope and cutoff.
- Progress.
- Matched domains.
- Mismatch details.
- Inconclusive results.
- Authorized source drill-down.

### Recovery

- Available bounded actions.
- Reviewed plan.
- Explicit confirmation for state-changing repair.
- Execution history.
- Outcome and verification result.

Use keyboard-accessible controls and clear nontechnical descriptions.

Do not show a green “Healthy” state while hiding an expired access snapshot or unresolved integrity conflict.

---

## 16. Add Web Visibility Without Overclaiming

Extend existing owner-facing sync/configuration status where appropriate.

Show cloud-observable facts:

- Last host contact.
- Last applied upload group.
- Reported local tail and its observation time, if available.
- Last application acknowledgement.
- Pending published configuration.
- Reconciliation results available to the cloud.

The cloud cannot independently know the latest offline local tail.

Label host-reported values accordingly.

Do not claim remote actions completed locally until acknowledged.

Do not add an unrestricted remote-control channel or remote database repair tool.

Full cloud financial dashboards remain Phase 35.

---

## 17. Add Permissions, Audit, and Diagnostic Export

Separate permissions for:

- Viewing sync status.
- Running read-only reconciliation.
- Requesting retry.
- Executing bounded replay/recovery.
- Exporting diagnostics.
- Repairing cloud projections, if implemented.

Inspect existing capability names and owner-management rules.

Do not give every reporting user recovery authority.

Audit recovery plans, executions, cancellations, and outcomes.

Provide a redacted diagnostic bundle containing:

- Application/schema versions.
- Stream/generation identifiers.
- Cursor observations.
- Safe error codes.
- Comparison metadata.
- Job history.
- Relevant configuration revision metadata.

Exclude:

- Private keys.
- Session secrets.
- Authorization headers.
- Password hashes.
- Full financial payloads.
- Unnecessary party details.
- Unrestricted environment dumps.

Reuse the secure Phase 30 save/export boundary.

Do not send diagnostics externally automatically.

---

## 18. Add Automated Tests

### Reconciliation tests

Cover:

- Fully matched data.
- Expected local backlog.
- Cloud committed but local acknowledgement missing.
- Missing cloud record with receipt present.
- Missing allocation relationship.
- Equal totals with different source records.
- Mutable records changed after the cutoff.
- Concurrent posting during comparison.
- Different manifest versions.
- Deterministic event enrichment.
- Cross-stream and cross-tenant attempts.
- Expired or unavailable snapshots.

### Recovery tests

Cover:

- Retry through the existing worker.
- Bounded replay with unchanged identities.
- Stale recovery plan rejection.
- Lost recovery response.
- Restart during recovery.
- Concurrent conflicting jobs.
- Cancellation after partial committed progress.
- No cursor reset or skipped events.
- Configuration acknowledgement retry.
- Permission removal during a recovery job.
- Projection repair verification, if implemented.

### Financial assertions

Verify recovery creates no new:

- Sales.
- Bills.
- Ledger postings.
- Payments.
- Allocations.
- Commission charges.

Cloud application of previously unapplied original events is allowed; duplication is not.

Verify local authoritative records remain unchanged.

---

## 19. Complete the Integrated Phase 31–34 Acceptance Flow

Prepare a development/staging checklist using the real enrolled host and synthetic business data.

1. Verify secure host-key loading under the correct Windows account.
2. Confirm ingestion, configuration pull, and acknowledgement endpoints.
3. Apply required reviewed local and cloud migrations.
4. Commit a test local sale.
5. Verify signed upload and matching cloud application.
6. Verify local acknowledgement advances.
7. Run reconciliation and confirm the matched cutoff.
8. Disconnect internet while retaining LAN connectivity.
9. Create another permitted local transaction.
10. Verify pending status and continued local operation.
11. Publish a test cloud permission change.
12. Verify it remains pending while the host is unreachable.
13. Restore internet.
14. Verify upload catch-up and configuration application.
15. Verify application acknowledgement and permission enforcement.
16. Simulate a lost ingestion response after cloud commit.
17. Recover through replay without duplicates.
18. Simulate a lost configuration acknowledgement.
19. Recover without repeated application side effects.
20. Restart during retry/backoff and verify durable progress.
21. Inject a controlled mismatch in an isolated test fixture.
22. Verify it is classified correctly and unsafe actions remain unavailable.
23. Export diagnostics and inspect redaction.
24. Reconcile financial totals at the same cutoff.
25. Confirm original local records remain intact.

Do not corrupt a live stall database to test recovery.

Record real signed-host, DPAPI, LAN, and cloud checks separately from automated fixtures.

Unresolved production offline-access policy must remain explicitly recorded.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/sync-reconciliation-and-recovery.md`

Document:

- Meaning of each status.
- Comparison guarantees and limits.
- Common-cutoff rules.
- Manifest versions.
- Error categories.
- Safe recovery actions.
- Actions intentionally unavailable.
- Diagnostic export.
- Restore/host-replacement escalation.
- Integrated acceptance procedure.

Use forward-only migrations where needed:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset an existing database.

Update context files and the progress tracker.

Run applicable formatting, lint, type, database, security, worker, reconciliation, recovery, UI, integration, and build checks.

Report:

1. Files and migrations changed.
2. Comparison domains and guarantees.
3. Supported recovery actions.
4. Explicitly unsupported repairs.
5. Authorization and diagnostic redaction.
6. Automated test results.
7. Integrated live acceptance results.
8. Remaining integrity, bootstrap, or policy blockers.
9. Readiness for Phase 35.

## Acceptance Criteria

- Upload and configuration states are visible separately.
- Reconciliation compares equivalent data at a shared cutoff.
- Cursors and aggregate totals are not treated as complete proof.
- Expected backlog is distinguished from integrity mismatch.
- Recovery reuses original identities and established workers.
- No action silently skips events or resets synchronization history.
- Projection drift is distinguished from missing event delivery.
- Configuration recovery preserves revision and expiry protections.
- Recovery jobs are scoped, authorized, idempotent, and audited.
- Diagnostics are useful without exposing secrets or unnecessary personal data.
- Local financial records remain authoritative and unchanged.
- Phases 31–34 have a documented integrated live acceptance result.