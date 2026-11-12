# 25 — Bill History, Corrections, and Reversals

## Objective

Implement searchable bill history and an auditable workflow for correcting or reversing finalized transactions.

This phase must deliver:

- Buyer and farmer bill history.
- Read-only original bill details.
- Linked correction and reversal history.
- Authorized correction previews.
- Exact reversal of original financial effects.
- Atomic correction posting.
- Safe handling of farmer bills linked to corrected sales.
- Concurrency and duplicate protection.
- Desktop review, confirmation, and recovery workflows.

Preserve the distinction between:

- Editing a draft before finalization.
- Correcting a finalized sale.
- Reversing a finalized sale.
- Correcting a farmer bill that groups existing obligations.

Original issued documents and posted financial entries must remain intact.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 08 financial decisions.
- Phase 20 commission snapshots.
- Phase 21 ledger posting and opening-balance corrections.
- Phase 22 sales and buyer-bill finalization.
- Phase 23 billing UI and uncertain-outcome recovery.
- Phase 24 farmer-bill generation and source-inclusion rules.
- Existing payment and allocation scaffolding.
- Audit, outbox, numbering, and permission conventions.

Inspect actual code to identify:

1. The source event responsible for each financial posting.
2. Original sale and line identities.
3. Buyer-bill relationships.
4. Farmer-bill inclusion relationships.
5. Existing reversal support.
6. Available document status and revision fields.
7. Current payment/allocation representations.
8. Existing bill-history routes and UI.

Reuse existing foundations.

Mark Phase 25 as `IN_PROGRESS`.

Keep pending operator checks from earlier phases accurately recorded.

---

## 2. Define the Correction Policy

Create a decision table from approved requirements.

Confirm:

| Decision | Required definition |
|---|---|
| Correction scope | Whole sale, selected lines, or supported alternatives |
| Editable fields | Price, weight, farmer, buyer, vegetable, and metadata |
| Financial method | Reversal and replacement or approved delta adjustment |
| Commission policy | Which policy applies to replacement calculations |
| Effective date | Date of reversal and replacement |
| Numbering | References for reversal and replacement documents |
| Farmer documents | Treatment of already-issued farmer bills |
| Allocated payments | Allowed behavior when obligations have allocations |
| Permissions | Who may preview, correct, and reverse |
| Reason | Required explanation and any reason codes |
| Closed periods | Restrictions where period controls exist |

Do not support both full reversal-and-replacement and delta adjustment unless required.

Use the approved approach consistently.

If no method has been approved, document the proposed reversal-and-replacement model and keep dependent production posting unavailable until the decision is recorded. Continue independent history, validation, and preview work.

Do not invent:

- Retroactive commission rules.
- Arbitrary backdating.
- Automatic refunds.
- Payment reallocation.
- Negative cash payments.
- Approval hierarchies not required by the project.

---

## 3. Separate Financial and Document Actions

Implement an explicit action matrix.

### Draft edit

Uses the existing draft workflow.

- No reversal.
- No financial posting.
- No issued bill number.

### Sale reversal

Cancels the financial effect of an eligible finalized sale or approved selection.

- References the original source.
- Posts exact opposite effects.
- Preserves the original record.
- Does not issue a replacement sale unless requested through the correction workflow.

### Sale correction

Changes an eligible finalized sale through the approved correction method.

- Preserves original values.
- Reverses or adjusts original effects.
- Records corrected values and resulting obligations.
- Links all related records.

### Farmer-document correction

Changes the document grouping or presentation of existing obligations under the approved rules.

- Does not reverse sales merely because a farmer bill is cancelled or superseded.
- Does not recreate farmer payables already recognized at sale finalization.

Use distinct service operations for financially different actions.

A generic “Cancel bill” endpoint must not decide its financial meaning from the screen that called it.

---

## 4. Establish Correction Invariants

Enforce:

1. Original posted amounts and issued snapshots are immutable.
2. Every correction references its source.
3. Every financial reversal references the original posting.
4. Original financial effects can be reversed only once.
5. Replacement financial effects are posted only once.
6. A corrected record has an unambiguous current successor.
7. Concurrent corrections cannot create competing successors.
8. Buyer and farmer effects are handled together.
9. Farmer-bill inclusion history is preserved.
10. A correction never silently deletes payment allocations.
11. Failed operations leave no partial correction.
12. Every committed correction includes a reason, actor, and timestamp.
13. Ordinary bill retrieval and reprinting never post financial effects.
14. Historical numbers are never reused.

If partial reversals are approved, additionally enforce cumulative quantity and amount limits. Otherwise, reject partial-reversal inputs explicitly.

Do not present unsupported partial reversal as available in the UI.

---

## 5. Implement Unified Bill History

Extend existing read APIs and desktop views.

Support filters for:

- Buyer or farmer bill type.
- Bill number.
- Party code or name.
- Business-date range.
- Issue-date range where useful.
- Current document status.
- Correction or reversal presence.

Use pagination and deterministic sorting.

Return:

- Bill identity and type.
- Original issued number.
- Party snapshot.
- Original amount.
- Issue and business dates.
- Current status.
- Linked correction and reversal references.
- Replacement document reference where applicable.

Keep original totals visible.

If showing an effective amount after adjustments, label it separately and derive it from authoritative relationships.

Do not overwrite the displayed original total with a replacement total.

Keep financial status separate from document status and payment status.

Do not implement paid/unpaid filters until supported by authoritative payment allocation.

---

## 6. Add Read-Only History Details

Provide a detail view containing:

- Original bill snapshot.
- Original source-sale references.
- Original commission calculation.
- Related farmer or buyer documents.
- Reversal and replacement links.
- Correction reason.
- Actor and recording time.
- Effective dates.
- Authorized ledger references.

Present a chronological activity list.

Allow navigation between:

- Original sale.
- Buyer bill.
- Farmer bill.
- Reversal.
- Replacement sale or adjustment.
- Current effective document.

Do not expose credentials, unrestricted audit payloads, or unnecessary personal information.

A renamed master record must not change the original bill snapshot.

---

## 7. Build a Dependency and Eligibility Resolver

Before previewing a correction, resolve its dependencies.

Check:

- Tenant and stall scope.
- Original financial status.
- Existing corrections and reversals.
- Current successor.
- Farmer-bill inclusion.
- Payment allocations or settlement links.
- Account readiness for replacement parties.
- Source revisions.
- Closed-period restrictions, if implemented.
- Inventory or reporting projections already connected to the sale.

Return structured eligibility information.

Differentiate:

- Allowed.
- Allowed with explicitly described linked-document effects.
- Blocked by an existing correction.
- Blocked by payment allocations.
- Blocked by unsupported dependencies.
- Blocked by unresolved policy.

Do not infer “unpaid” from a zero account balance or absence of a UI payment badge.

Inspect authoritative allocation records.

Provide an integration contract requiring later payment posting and correction posting to serialize against the same obligation state.

---

## 8. Handle Payment Dependencies Conservatively

Payment collection and allocation are implemented in later phases.

For this phase:

- Detect existing payment or allocation references where present.
- Block corrections whose settlement consequences are unsupported.
- Explain the blocking dependency.
- Preserve every payment record and allocation.
- Do not automatically refund, unallocate, or transfer payments.

Define a shared obligation eligibility check that Phase 26 must honor.

The correction eligibility check must run again inside the write transaction.

A future allocation must not attach to a reversed obligation after the correction transaction commits.

Record the later work required for correcting partially or fully settled obligations.

Do not label this phase as supporting settled-bill correction if it does not.

---

## 9. Implement Exact Reversal Calculations

Use the Phase 21 posting interface.

Construct reversals from stored original posting amounts.

Do not recalculate the original transaction with current commission bands, catalog values, or rounding settings.

For each original effect:

- Identify its account.
- Identify its currency.
- Identify its exact amount and direction.
- Construct the exact opposite entry.
- Link it to the original posting.

For a sale that originally created:

- A buyer obligation.
- A farmer entitlement.
- Commission recognition under the approved accounting model.

Reverse all applicable effects consistently.

Do not reverse a farmer bill as though it created a second entitlement when it only grouped existing obligations.

Test exact cancellation:

`Original effect + reversal effect = zero`

Use exact numeric representations and overflow checks.

---

## 10. Implement Replacement Calculations

For a correction using reversal and replacement:

1. Load original immutable values.
2. Apply only explicitly allowed changes.
3. Validate replacement references and account readiness.
4. Recalculate weights and sale amounts through existing domain functions.
5. Apply the approved replacement commission policy.
6. Produce an immutable proposed replacement snapshot.
7. Show the financial difference from the original.

Make commission policy selection explicit in the preview.

Do not automatically choose the newest policy simply because it is active.

Do not automatically reuse the original policy when the approved correction rule requires another policy.

If parties change:

- Reverse the original obligations on the original accounts.
- Post replacement obligations to the correct new accounts.
- Show both account effects clearly.
- Never net across unrelated accounts to hide the transfer.

Do not accept arbitrary client-supplied ledger lines.

---

## 11. Implement Correction Preview

Provide an authenticated service-side preview.

Input should include:

- Target source identity.
- Expected source revision or correction version.
- Requested action.
- Allowed replacement fields, if applicable.
- Required reason.
- Approved effective-date input.

Return:

- Original values.
- Proposed replacement values.
- Reversal effects.
- Replacement effects.
- Net effect per account and currency.
- Affected buyer and farmer documents.
- Commission policy details.
- Eligibility warnings or blockers.
- A verifiable preview fingerprint.

Preview must create no financial postings or issued numbers.

An operator must review the full impact before commit.

If relevant source state, allocation state, policy, or linked-document state changes, invalidate the preview.

Do not silently commit a changed correction.

---

## 12. Preserve Farmer-Bill History

Handle both cases explicitly.

### Original sale has not been farmer-billed

After reversal:

- Original source becomes ineligible for new farmer billing.
- Historical source remains visible.
- A replacement source becomes eligible only according to approved rules.

### Original sale is included in an issued farmer bill

Preserve:

- Original farmer-bill snapshot.
- Original source-inclusion links.
- Original number.

Use the approved adjustment or supersession model to show the correction’s effect.

For a farmer bill containing several sales, correcting one sale must not reverse the unrelated sales.

Do not mark an entire grouped farmer bill fully reversed when only part of its represented entitlement changed.

Do not delete an inclusion link to make the original sale billable again.

If replacement sources will be billed later, retain explicit lineage to the corrected source and original farmer document.

If the linked-document policy is unresolved, block this specific correction case and document it. Do not silently corrupt the grouping history.

---

## 13. Add Forward-Only Schema Changes

Inspect existing reversal and bill structures first.

Add only what is required for:

- Correction operation records.
- Source-to-reversal links.
- Replacement or adjustment relationships.
- Correction chain/version control.
- Reasons and actor metadata.
- Document status events or projections.
- Stable idempotency outcomes.
- Necessary uniqueness constraints and indexes.

Preserve original issued snapshots and posted entries.

A mutable status projection is acceptable when derived from immutable events and updated transactionally.

Use the next available migration number.

Do not edit applied migrations or reset existing data.

Enforce:

- Scoped foreign-key relationships.
- No self-referencing corrections.
- No competing successors.
- No duplicate reversal of the same eligible source.
- Unique operation identity.
- Valid action and status combinations.

Prevent correction cycles in the service and through suitable database safeguards.

Test upgrades containing buyer bills, farmer bills, and opening balances.

Do not migrate existing transactions into fabricated correction records.

---

## 14. Commit Corrections Atomically

Use one authoritative SQLite transaction.

The operation must:

1. Validate session, device, and permission.
2. Resolve tenant and stall.
3. Check idempotency.
4. Reload the target and its dependencies.
5. Verify the expected correction version.
6. Recheck allocations and eligibility.
7. Revalidate the reviewed preview.
8. Allocate required document references.
9. Persist the correction operation.
10. Post exact reversals.
11. Create and post the replacement when applicable.
12. Link affected documents and source lineage.
13. Update rebuildable status and eligibility projections.
14. Update existing dependent projections as required.
15. Write audit records.
16. Append outbox events.
17. Persist the operation result.
18. Commit.

Any failure must roll back the entire correction.

Do not reverse first and create the replacement through a separate network request.

Do not use public API calls from inside the transaction to perform internal steps.

Reuse transaction-aware services.

Keep printing and synchronization outside the transaction.

---

## 15. Make Numbering, Retries, and Concurrency Safe

Preserve original buyer and farmer numbers.

Use the approved numbering policy for replacement bills and adjustment documents.

Never reuse the original number for a newly issued replacement.

Do not invent a legal credit-note numbering scheme without approved requirements.

Use Phase 22’s sequence infrastructure.

Require:

- A stable idempotency key.
- A request fingerprint.
- Business-source uniqueness.
- Expected correction version.
- A scoped outcome-lookup path.

Guarantee:

- Same key and payload returns the original result.
- Same key with a different payload conflicts.
- Two different keys cannot reverse the same source twice.
- Competing corrections cannot both become the current successor.
- An uncertain response can be resolved after reconnection.
- Authorization is rechecked before exposing a stored result.

After a confirmed correction, subsequent corrections must target the current eligible record under the approved chain rules.

Do not reverse a superseded original again.

---

## 16. Add Permissions and Service Routes

Use existing Fastify and contract conventions.

Expose:

- Bill-history queries.
- Correction-chain detail.
- Eligibility lookup.
- Correction preview.
- Reversal preview.
- Correction commit.
- Reversal commit.
- Operation outcome lookup.

Use dedicated correction and reversal capabilities where the existing permission catalog requires them.

Do not assume `bills.edit_draft` permits finalized financial changes.

Do not automatically grant correction privileges to every user with `bills.finalize`.

Follow approved role defaults and trusted permission-refresh mechanisms.

Require a meaningful bounded reason.

Validate all inputs and reject unsupported actions explicitly.

Keep normal draft editing available through existing routes.

Return stable errors for:

- Already reversed.
- Superseded source.
- Stale preview.
- Concurrent correction.
- Allocated payment dependency.
- Unsupported linked-document case.
- Invalid replacement.
- Permission denial.
- Unknown operation outcome.

Preserve production fail-closed authentication.

---

## 17. Build the Desktop History and Correction Workflow

Use the existing app shell.

Provide:

### History list

- Search and filters.
- Clear buyer/farmer bill types.
- Original amounts.
- Correction status.
- Links to detail.

### Original bill detail

- Read-only original snapshot.
- Correction timeline.
- Current replacement link.
- Permission-aware correction and reversal actions.

### Correction workspace

- Original values alongside editable proposed values.
- Inline editing of supported fields.
- Required reason.
- Service-calculated financial impact.
- Linked-document consequences.
- Review and explicit commit action.

### Reversal review

Clearly show:

- Target bill or sale.
- Accounts affected.
- Amounts being reversed.
- Linked farmer-document effects.
- Reason.
- Whether any replacement is being created.

An ordinary Enter keypress in a form must not commit a reversal.

Protect repeated clicks and keyboard activation.

When the outcome is uncertain, preserve the operation identity and recover using the existing service pattern.

Clear protected state on logout and ignore late responses.

Do not add payment, refund, or print controls that are not implemented.

---

## 18. Preserve Reporting and Sync Semantics

Correction events must allow later consumers to distinguish:

- Original sale.
- Reversal.
- Replacement sale.
- Document-only correction.
- Farmer-bill adjustment.

Avoid double counting.

If local sales or price projections already exist:

- Remove or compensate the original sale’s contribution.
- Apply the replacement contribution where appropriate.
- Recompute affected minimum/maximum values when a removed sale established an extreme.
- Follow approved average-price semantics.
- Preserve rebuildability from authoritative records.

If these projections are deferred, publish sufficient source lineage and document the integration requirement.

Do not invent inventory returns from a financial reversal. Financial correction and physical stock movement require their approved relationship.

Audit and outbox records must commit with the correction.

Include operation, source, reversal, replacement, affected-document, and posting identifiers.

---

## 19. Add Automated Tests

### Financial tests

Cover:

- Exact full reversal.
- Price correction.
- Weight correction.
- Commission-policy behavior.
- Farmer change.
- Buyer change where supported.
- Repeated correction of the current replacement.
- Rejection of correction against a superseded original.
- No double reversal.
- Exact per-account net effects.

For reversal and replacement, verify:

`Original + reversal + replacement = replacement effect`

### Dependency tests

Cover:

- Unbilled farmer source.
- Source included in a farmer bill.
- Farmer bill containing multiple sales.
- Multiple farmers on a buyer bill.
- Document-only action with no ledger changes.
- Existing allocations blocking unsupported corrections.
- Concurrent farmer-bill issuance and sale correction.
- Concurrent allocation eligibility changes.
- Inactive historical references.

### Transaction tests

Cover:

- Idempotent retries.
- Payload mismatch.
- Competing corrections.
- Lost response after commit.
- Failure after reversal insertion.
- Failure before replacement posting.
- Failure during audit or outbox persistence.
- No partial changes after rollback.
- Sequence uniqueness and preservation.
- Tenant and stall isolation.
- Permission and session failures.

### History and UI tests

Cover:

- Filtering and pagination.
- Original snapshots unchanged.
- Correction-chain navigation.
- Inline proposed edits.
- Preview invalidation.
- Explicit confirmation.
- Duplicate-action prevention.
- Uncertain-outcome recovery.
- Logout and stale responses.
- Clear distinction between document and payment status.

Use isolated synthetic fixtures with independently calculated expectations.

---

## 20. Prepare Operator Acceptance and Documentation

Create or update:

`docs/operations/bill-history-corrections-and-reversals.md`

Document a development/staging checklist:

1. Back up the local database.
2. Apply pending migrations without reset.
3. Restart the service and desktop.
4. Refresh the authorized staff session.
5. Finalize a test buyer sale.
6. Record buyer and farmer balances.
7. Find the bill in history.
8. Preview a supported price or weight correction.
9. Verify the original remains unchanged before commit.
10. Review exact account effects.
11. Commit the correction.
12. Verify the original, reversal, and replacement links.
13. Verify balances reflect the replacement once.
14. Retry and confirm no duplicate effects.
15. Reverse a separate eligible test sale.
16. Confirm its original contribution is cancelled exactly.
17. Generate a farmer bill containing several test sales.
18. Correct one included sale using the approved linked-document workflow.
19. Verify unrelated sales remain intact.
20. Verify unsupported allocated-payment cases are blocked.
21. Verify staff without correction permission are denied.
22. Restart and confirm history remains available.
23. Test competing requests from another terminal when available.

Use:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset an existing database.

Record pending manual checks.

Update context files and the progress tracker.

Run applicable formatting, lint, type, domain, database, service, UI, end-to-end, and build checks.

Report:

1. Files and migrations changed.
2. Supported correction and reversal cases.
3. Explicitly blocked cases and reasons.
4. Financial posting and document-link behavior.
5. Permissions and routes.
6. Tests executed and results.
7. Manual checks completed or pending.
8. Remaining business decisions.
9. Integration requirements for Phase 26.

## Acceptance Criteria

- Buyer and farmer bill history is searchable and scoped.
- Original issued snapshots and ledger entries remain immutable.
- Draft editing and finalized correction use separate workflows.
- Reversals use exact original financial amounts.
- Corrections update all affected accounts atomically.
- Farmer-bill grouping never causes duplicate financial reversal.
- Existing source-inclusion history is preserved.
- Unsupported settlement consequences are blocked explicitly.
- Concurrent requests and retries cannot duplicate corrections.
- Original and replacement documents remain traceable.
- Audit, outbox, and financial changes commit together.
- Desktop review and recovery are safe and keyboard-accessible.
- Tests pass and remaining acceptance work is documented.