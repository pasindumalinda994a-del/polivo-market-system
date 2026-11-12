# 24 — Farmer Sales and Bill Generation

## Objective

Implement the farmer sales workspace and farmer-bill generation workflow using the finalized sales recorded in Phases 22–23.

This phase must deliver:

- A farmer-specific view of finalized sales.
- Clear identification of sales available for farmer billing.
- Selection and review of eligible sale lines.
- Exact aggregation of recorded gross amounts, commission, and farmer entitlement.
- Atomic, duplicate-safe farmer-bill issuance.
- A separate farmer-bill number sequence starting at `111111`.
- Immutable issued bill details.
- Desktop views for preparing, issuing, and retrieving farmer bills.
- Audit and transactional outbox integration.

Farmer bills must reference existing sales. Generating a farmer bill must not create another sale or duplicate a financial obligation already posted during sale finalization.

Payment recording, cheque handover, printing, and finalized corrections remain in their later phases.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 08 business and financial decisions.
- Phase 17 farmer management.
- Phase 20 commission snapshots.
- Phase 21 financial ledgers and opening balances.
- Phase 22 sale finalization and buyer-bill issuance.
- Phase 23 billing UI and operation-recovery patterns.
- Existing bill tables, sequences, permissions, and source references.

Inspect actual code to confirm:

1. How sale lines identify their farmer.
2. When farmer entitlement is posted.
3. How commission and net entitlement are stored.
4. Whether farmer bills or bill-line relationships already exist.
5. How issued bills remain immutable.
6. How source uniqueness is enforced.
7. Which shared bill services can be reused safely.
8. Which desktop shell was adopted in Phase 23.

Preserve the existing desktop shell. Do not reopen the layout decision or redesign the billing application.

Mark Phase 24 as `IN_PROGRESS`.

Keep earlier pending operator checks visible. Do not automatically treat them as blockers to independent implementation.

---

## 2. Confirm Farmer-Bill Rules

Use approved requirements and the implemented financial model.

Document:

| Decision | Required definition |
|---|---|
| Bill owner | One farmer account within one stall |
| Eligible sources | Which finalized sale lines may be included |
| Grouping | Allowed dates, buyers, vegetables, and currencies |
| Selection unit | Whole sale line or approved smaller unit |
| Recognition | Whether entitlement was already posted at sale finalization |
| Gross amount | Source field used for aggregation |
| Commission | Recorded source commission |
| Net entitlement | Recorded amount owed to the farmer |
| Bill date | Date semantics and permitted range |
| Numbering | Scope, formatting, and reset policy |
| Corrections | Treatment of reversed or adjusted source sales |
| Inactive farmers | Whether existing historical sales may still be billed |

Preserve the established calculation relationship:

`Farmer entitlement = sale amount − commission`

Use the exact amounts already finalized by the authoritative service.

Do not introduce:

- New commission calculations.
- Additional deductions.
- Automatic advance recovery.
- Automatic payment allocation.
- Netting against buyer accounts.
- Opening balances as sale lines.

If partial sale-line billing is not explicitly approved, use whole finalized sale lines.

Do not add quantity splitting merely for future flexibility.

If a required rule is unresolved, document it and block only the dependent issuance behavior.

---

## 3. Define the Farmer-Bill Invariants

Enforce:

1. Every source line belongs to the authenticated stall.
2. Every source line belongs to the selected farmer account.
3. Only eligible finalized sales may be billed.
4. Draft sales never appear as billable farmer sales.
5. Each source entitlement is included in at most one original issued farmer bill.
6. Bill totals equal the exact sum of their source amounts.
7. Current commission settings cannot change historical source amounts.
8. Issuing a bill does not duplicate existing ledger postings.
9. Issuing a bill does not mark the farmer paid.
10. Issued bill financial details are immutable.
11. Failed issuance leaves no partial bill or source assignment.
12. Retries return the same committed bill.

If later correction documents must reference the same source, distinguish those relationships from original bill inclusion. Do not remove original links to make a corrected sale appear newly unbilled.

---

## 4. Implement Farmer Sales Queries

Add scoped service queries for:

- Farmer sales summary.
- Eligible unbilled sale lines.
- Already-billed sale lines.
- Farmer-bill list.
- Farmer-bill detail.
- Source-sale detail or navigation references.

Support appropriate filters:

- Farmer.
- Business-date range.
- Vegetable.
- Buyer, where authorized.
- Bill inclusion status.
- Bill number.

Use stable pagination and deterministic ordering.

Display or return:

- Source sale and line reference.
- Buyer-bill reference.
- Sale business date.
- Vegetable snapshot.
- Package count and weight.
- Unit price.
- Gross amount.
- Recorded commission.
- Net farmer entitlement.
- Farmer-bill reference when issued.

Distinguish these concepts explicitly:

- Unbilled sales.
- Billed sales.
- Unpaid obligations.
- Overall account balance.

“Unbilled” does not mean “unpaid.”

Do not infer payment status from bill inclusion or account balance.

Ensure summaries and listed rows use the same filters and eligibility rules.

If totals span all matching rows, label them accordingly rather than presenting the current page total as the complete result.

---

## 5. Build Exact Aggregation from Source Snapshots

Implement pure domain aggregation using the project’s exact money and weight types.

For selected eligible lines, calculate:

- Total package count where units are compatible.
- Total weight.
- Total gross sale amount.
- Total recorded commission.
- Total recorded farmer entitlement.

Sum the committed line amounts.

Do not recompute commission using the current policy.

Do not recalculate rounded line amounts from display-formatted values.

For example, lines finalized under different commission versions may retain different rates on one bill if the approved grouping rules allow that.

Preserve each line’s source commission version and breakdown.

If presenting grouped vegetable summaries:

- Keep the underlying source links.
- Do not imply that all grouped lines had the same unit price.
- Show separate price groups or an approved display summary.
- Do not replace source financial amounts with recalculated averages.

Reject mixed currencies unless the approved system explicitly supports separate currency totals. Never add currencies together.

---

## 6. Define Shared Contracts

Extend the existing contracts package for:

- Farmer sales queries.
- Eligible-line selection.
- Farmer-bill preview.
- Farmer-bill issuance.
- Issuance outcome lookup.
- Farmer-bill retrieval.
- Paginated farmer-bill listing.

Use project naming conventions.

Issuance input should identify:

- Farmer account.
- Explicit selected source-line IDs.
- Approved bill metadata.
- Reviewed selection fingerprint or equivalent.
- Stable idempotency key.

Derive tenant, stall, actor, and monetary amounts from trusted service context and stored records.

Validate:

- Nonempty selection.
- Unique source IDs.
- Maximum lines per bill.
- Date formats.
- Metadata length.
- Request size.
- Pagination limits.

Reject duplicated IDs rather than counting a line twice.

Do not accept client-provided commission, entitlement, paid status, or bill number as authoritative.

---

## 7. Add Forward-Only Schema Changes

Inspect and reuse existing bill structures.

Add only what is needed for:

- Farmer bill headers.
- Immutable bill-line snapshots or immutable source references.
- Original source-inclusion relationships.
- Farmer numbering sequence.
- Issuance operation results.
- Audit and lookup indexes.

Use the next available migration number.

Do not modify applied migrations.

Enforce:

- Scoped farmer and source relationships.
- Unique farmer-bill numbers within their numbering scope.
- Unique original inclusion of each source entitlement.
- Required issuance metadata.
- Valid bill type.
- Immutable issued financial data.

Use database constraints as well as application checks.

A mutable `is_billed` flag alone is insufficient to prevent duplicate inclusion.

Preserve existing sales, buyer bills, ledger records, and sequences.

Do not automatically generate farmer bills during migration.

Test upgrades containing finalized sales.

---

## 8. Implement Selection and Preview

Allow authorized staff to select eligible lines for one farmer.

Preview must:

1. Resolve the authenticated scope.
2. Load the explicit source selection.
3. Verify farmer ownership.
4. Verify finalized status.
5. Verify current billing eligibility.
6. Load immutable financial snapshots.
7. Aggregate exact totals.
8. Return the reviewed source set and a verifiable fingerprint or equivalent.

Preview has no financial or issuance effect.

Selecting a date range must not create an open-ended instruction to include whatever matches later.

Freeze the explicit selected source IDs for review.

If the UI offers “Select all matching,” resolve a bounded explicit selection through the service and clearly show its count and totals.

New sales arriving after review must not be silently added.

Do not reserve lines merely because someone opened a preview unless an existing approved reservation workflow requires it.

Concurrent previews may overlap; issuance must resolve conflicts atomically.

---

## 9. Implement Atomic Farmer-Bill Issuance

Use one authoritative SQLite transaction.

The issuance operation must:

1. Validate the local session and device.
2. Check the required capability.
3. Resolve tenant and stall.
4. Check idempotency.
5. Reload the selected source lines.
6. Revalidate ownership and eligibility.
7. Verify the reviewed selection.
8. Recompute aggregation from stored snapshots.
9. Allocate a farmer-bill number.
10. Create the immutable bill.
11. Create its source-inclusion relationships.
12. Persist required bill snapshots.
13. Apply financial posting only if the approved recognition model requires it here.
14. Write audit records.
15. Append outbox events.
16. Store the stable operation result.
17. Commit.

Return success only after commit.

If any selected line is no longer eligible, reject the complete issuance and require review.

Do not silently issue a smaller bill with the remaining lines.

Do not perform printing or network synchronization inside the transaction.

---

## 10. Prevent Duplicate Financial Posting

Inspect the Phase 22 posting implementation.

For the established path where farmer entitlement is posted during sale finalization:

- Farmer-bill issuance groups and documents existing obligations.
- It creates no additional farmer payable.
- It creates no additional commission recognition.
- It leaves farmer and buyer account balances unchanged.

Link the bill to the original sale and posting references.

Do not call the ledger posting interface merely because a new bill document exists.

If the repository instead records an explicitly approved later recognition point, implement that rule using Phase 21’s transaction-aware interface and source-event uniqueness.

Do not silently switch between recognition models.

Keep future payment allocation linked to the original obligation identity. A farmer bill must not create a second payable item for the same entitlement.

Opening balances remain separately identifiable obligations.

---

## 11. Allocate Farmer-Bill Numbers Safely

Use a separate farmer-bill sequence starting at `111111`.

Preserve the buyer/trader sequence starting at `444444`.

Reuse the Phase 22 numbering infrastructure where possible.

Ensure:

- Explicit farmer bill type.
- Separate sequence identity.
- Correct tenant/stall scope.
- Atomic allocation within issuance.
- Unique numbers under concurrent terminals.
- Original number returned on retry.
- No number allocation during preview.
- No sequence reset on restart or migration.
- No reuse of previously issued numbers.

Do not use `MAX(number) + 1`.

Do not identify bill type solely by the number’s first digits.

Document formatting and sequence behavior using the existing numbering decision.

---

## 12. Handle Concurrency and Uncertain Outcomes

Use both idempotency and database source-inclusion constraints.

Cover:

- Two terminals issuing the same selection.
- Two terminals issuing partially overlapping selections.
- The same request submitted twice.
- A different key submitted for an already-issued selection.
- A response lost after successful commit.

For overlapping selections:

- At most one operation may claim a given source entitlement.
- Reject the conflicting transaction as a whole.
- Return safe conflict details so the operator can refresh.

Do not automatically issue the nonoverlapping remainder.

For a timeout:

- Preserve the original operation identity.
- Look up its committed result.
- Retry with the same key and payload when appropriate.
- Do not create a replacement bill automatically.

Revalidate authorization before returning a previous operation result.

If the same selection was already issued under another operation, return an authorized reference to the existing bill where appropriate. Do not report a new issuance.

---

## 13. Add Authenticated Routes and Permissions

Follow existing Fastify and shared-schema conventions.

Expose the required farmer sales, preview, issuance, lookup, and bill-read operations.

Inspect the existing bill capability model before adding permissions.

Use existing capabilities if they intentionally cover both buyer and farmer bills. Otherwise, add scoped farmer-bill capabilities through the established registry.

Document the mapping.

Do not reuse `parties.register_edit` or `accounts.opening_post` as issuance permissions.

Enforce:

- Valid device authorization.
- Valid staff session.
- Required capabilities.
- Tenant and stall scope.
- Existing offline-access policy.
- Bounded queries and request bodies.

Separate issuance permissions from financial detail visibility where the approved model requires it.

Prevent buyer information or account details from leaking through unrestricted joins or error responses.

Do not weaken authentication for acceptance testing.

---

## 14. Build the Desktop Farmer Sales Workspace

Use the existing app shell and shared components.

Provide:

### Farmer selection

- Search by code or name.
- Keyboard selection.
- Clear selected farmer identity.
- Authorized account-summary link.

### Sales table

- Business date.
- Source reference.
- Vegetable.
- Package count.
- Weight.
- Unit price.
- Gross amount.
- Commission.
- Net entitlement.
- Farmer-bill inclusion status.

### Selection summary

- Selected line count.
- Total weight.
- Gross amount.
- Commission.
- Net entitlement.
- Review action.

### Bill history

- Farmer-bill number.
- Issue date.
- Covered sales dates.
- Gross, commission, and net totals.
- Read-only detail action.

Use “Unbilled” and “Billed” for document inclusion.

Do not introduce paid/unpaid lists before payment allocation is implemented.

If showing an account balance, label it separately from the selected bill total.

---

## 15. Implement Keyboard Review and Issuance

Support:

- Farmer search.
- Filter navigation.
- Row selection using the keyboard.
- Explicit select-page or select-matching behavior.
- Review.
- Issue.
- Return to sales.

Use labeled buttons and visible focus states.

Do not issue a bill through an ordinary Enter keypress in a search or filter input.

The review must show the exact selected sources and totals.

Changing farmer, selection, or relevant metadata invalidates the review.

On successful issuance:

- Display the committed farmer-bill number.
- Open the immutable bill detail.
- Refresh eligible sales and bill history.
- Preserve a clear path back to the farmer workspace.

On conflict:

- Explain which eligibility condition changed.
- Refresh affected rows.
- Require renewed review.

On unknown outcome:

- Show recovery status.
- Reuse the original operation identity.
- Prevent duplicate issuance actions.

Apply Phase 23’s protections against stale responses, logout races, and lost operation results.

---

## 16. Render Immutable Farmer-Bill Details

Show:

- Explicit farmer bill type.
- Bill number.
- Stall identity.
- Farmer snapshot.
- Issue date.
- Covered sale dates.
- Source sale references.
- Vegetable, weight, and price details.
- Gross total.
- Commission total.
- Net entitlement represented by this bill.

Use issued snapshots for historical display.

Do not label net entitlement as “cash paid.”

Do not show the farmer as paid because a bill was generated.

Do not include unrelated account balances in the bill’s net total.

Keep internal source references available for authorized drill-down without exposing unnecessary buyer information on the farmer-facing document.

Printing and reprinting will use this immutable representation in Phase 29.

Do not implement printer integration now.

---

## 17. Preserve Correction and Payment Integration

Prepare clear integration boundaries for later phases.

### Corrections

Phase 25 must be able to discover:

- Which buyer sale created the entitlement.
- Which farmer bill includes it.
- Which ledger posting recognized it.
- Whether payments were later allocated.

Issued farmer bills must not be silently rewritten when a source sale is corrected.

Preserve original inclusion links and represent later corrections through the approved adjustment workflow.

Do not make reversed historical sources eligible for rebilling by deleting their original links.

### Payments

Phase 26 must allocate against the existing obligation identity.

Keep separate:

- Bill issuance.
- Amount owed.
- Payment recording.
- Payment allocation.

The established farmer-cheque rule treats physical handover as payment. That belongs to the payment workflow and must not be triggered by farmer-bill issuance.

Do not create a cheque-clearance lifecycle in this phase.

---

## 18. Integrate Audit and Outbox Events

Record farmer-bill issuance with:

- Tenant and stall.
- Farmer account.
- Bill ID and number.
- Included source-line IDs.
- Exact gross, commission, and net amounts.
- Currency.
- Issue date and recording timestamp.
- Actor and device.
- Original financial posting references.
- Event schema version.

Commit audit and outbox records with issuance.

Document that farmer-bill issuance is a document-grouping event when obligations were already recognized.

Cloud consumers must not count it as another sale, another commission, or another payable.

Preview and ordinary reads must not produce financial outbox events.

Do not implement the sync worker in this phase.

---

## 19. Add Automated Tests

### Domain tests

Cover:

- Exact aggregation of multiple source lines.
- Different prices for the same vegetable.
- Different stored commission versions.
- Recorded rounding preservation.
- Duplicate selected IDs.
- Mixed farmer accounts.
- Currency mismatch.
- Empty and oversized selections.

### Service and database tests

Cover:

- Only eligible finalized sales appear.
- Drafts are excluded.
- Issuance from one buyer bill.
- Issuance across multiple buyer bills where grouping allows it.
- A buyer bill containing multiple farmers is separated correctly.
- Already-billed sources are rejected.
- Concurrent identical selections.
- Concurrent partially overlapping selections.
- Same-key retries.
- Key reuse with a changed payload.
- Lost response after commit.
- Atomic rollback at injected failure points.
- Unique farmer-bill numbers.
- Buyer sequence remains unchanged.
- Farmer and buyer balances remain unchanged when entitlement was already posted.
- No duplicate commission or sales effects.
- Historical details survive master-data and policy changes.
- Tenant and stall isolation.
- Permission and session failures.
- Fresh and upgrade migrations.

### UI tests

Cover:

- Keyboard farmer selection.
- Filters and pagination.
- Selection across pages.
- Clear page-versus-all selection behavior.
- Review invalidation.
- Eligibility conflicts.
- Duplicate-click prevention.
- Unknown-outcome recovery.
- Logout and stale-response handling.
- Read-only issued bill.

### End-to-end test

1. Create approved test openings and catalog records.
2. Finalize buyer sales for two farmers.
3. Record the resulting ledger balances.
4. Generate a bill for one farmer.
5. Verify only that farmer’s sources are included.
6. Verify exact bill totals.
7. Verify balances are unchanged by issuance.
8. Retry and verify one bill only.
9. Generate the other farmer’s bill.
10. Verify source separation and unique numbering.

Use isolated test data and synthetic commission fixtures.

---

## 20. Prepare Operator Acceptance and Documentation

Create or update:

`docs/operations/farmer-sales-and-bill-generation.md`

Include this development/staging checklist:

1. Back up the local database.
2. Apply pending migrations without initialization or reset.
3. Restart the stall service.
4. Refresh the authorized staff session if permissions changed.
5. Finalize test buyer sales using Phase 23.
6. Record farmer and buyer balances.
7. Open the farmer sales workspace.
8. Verify source sales, weights, commission, and entitlement.
9. Select eligible lines.
10. Review independently calculated totals.
11. Issue a farmer bill.
12. Verify the number uses the farmer sequence.
13. Verify selected lines now show the issued bill reference.
14. Verify balances have not increased again.
15. Retry issuance and confirm no duplicate.
16. Change current commission settings and verify historical bill amounts remain unchanged.
17. Restart the desktop and retrieve the bill.
18. Test overlapping issuance from another terminal when available.
19. Verify unauthorized staff cannot issue bills.
20. Confirm bill generation does not mark the farmer paid.

Use the existing migration command:

`pnpm --filter @polivo/db-local db:migrate`

Record unavailable physical-terminal checks as pending.

Document:

- Source eligibility.
- Grouping and selection rules.
- Numbering.
- Financial recognition.
- Duplicate prevention.
- Recovery behavior.
- Correction and payment integration.
- Pending acceptance checks.

Update context files and the progress tracker.

Run applicable formatting, lint, type, domain, integration, UI, end-to-end, and build checks.

Report:

1. Files and migrations changed.
2. Source selection and grouping behavior.
3. Financial recognition and duplicate-prevention guarantees.
4. Routes and permissions.
5. Desktop workflow.
6. Tests and results.
7. Manual checks completed or pending.
8. Unresolved decisions.
9. Readiness for Phase 25.

## Acceptance Criteria

- Farmer sales come from existing finalized source records.
- Each original source entitlement is billed at most once.
- Bill totals preserve recorded amounts and commission.
- Farmer numbering is separate, atomic, and retry-safe.
- Issuance cannot duplicate sales or existing ledger obligations.
- Concurrent overlapping selections cannot partially issue or double-bill.
- Issued details remain immutable.
- Bill issuance and payment status remain separate.
- Keyboard workflows, authorization, and uncertain-outcome recovery work correctly.
- Audit and outbox records commit with issuance.
- Tests pass and pending operator verification is documented.