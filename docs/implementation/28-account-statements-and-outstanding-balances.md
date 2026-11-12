# 28 — Account Statements and Outstanding Balances

## Objective

Implement accurate farmer and buyer/trader account statements and outstanding-balance views using the financial records established in Phases 21–27.

This phase must deliver:

- Date-range account statements.
- Opening, movement, and closing balances.
- Deterministic running balances.
- Outstanding obligations and bill settlement summaries.
- Separate visibility of unapplied payments where supported.
- Historical outstanding calculations.
- Traceable corrections, reversals, and payment allocations.
- Authorized desktop views and service queries.
- Reconciliation tests against the authoritative ledger.

Statements are read-only financial views.

Generating or viewing a statement must not post entries, allocate payments, change settlement, or create another bill.

Printing and exports remain in their scheduled later phases.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 21 account signs, ledger queries, and openings.
- Phase 22 sale obligations and buyer bills.
- Phase 24 farmer-bill grouping.
- Phase 25 correction and reversal history.
- Phase 26 payments, allocations, and settlement summaries.
- Phase 27 cheque settlement on physical handover.
- Existing date, money, pagination, and authorization utilities.

Inspect:

1. Canonical party-account identities.
2. Ledger ordering and posting sequences.
3. Business-effective and recording timestamps.
4. Allocation and allocation-reversal history.
5. Correction lineage.
6. Existing balance and outstanding queries.
7. Supported credits, advances, and opposite-direction balances.
8. Current account-view capabilities.

Reuse existing financial queries and domain functions where correct.

Mark Phase 28 as `IN_PROGRESS`.

Do not infer that earlier operator acceptance passed merely because implementation tests passed.

---

## 2. Define Statement Semantics

Document the statement contract before implementation.

A statement must identify:

- Tenant and stall.
- Party and account role.
- Currency.
- Selected period.
- Date basis.
- Data snapshot or recording cutoff.
- Opening balance.
- Period increases and decreases.
- Closing balance.

Keep farmer and buyer accounts separate, even when one person holds both roles.

Use the established sign convention internally.

Display clear balance directions:

- Buyer owes stall.
- Stall owes buyer.
- Stall owes farmer.
- Farmer owes stall.
- Settled.

Do not automatically net farmer and buyer accounts.

Do not combine currencies.

Confirm the stall business timezone from existing configuration. Do not derive financial date boundaries from the terminal’s operating-system timezone.

---

## 3. Distinguish Statement Opening from Imported Opening

These are different concepts:

### Imported opening balance

A posted Phase 21 financial event representing pre-system obligations at an approved cutoff.

### Statement opening balance

The sum of all qualifying posted account movements before the selected statement period.

The statement opening may include:

- An imported opening.
- Earlier sales.
- Earlier payments.
- Earlier corrections and reversals.

Do not add the imported opening again after summing ledger movements.

If an imported opening falls inside the selected period, show it as a period movement.

If it falls before the period, include it in the statement opening.

An `opened_zero` account may have no monetary opening entry. Respect its setup metadata without inventing a zero financial movement.

---

## 4. Implement Exact Statement Calculations

Use posted ledger entries as the monetary source of truth.

For a selected period:

`Closing balance = opening balance + signed period movements`

For each row:

`Running balance = preceding balance + signed row amount`

Use the existing exact-money representation.

Do not reconstruct financial amounts by multiplying historical displayed weight and price.

Include relevant posted events:

- Opening balances.
- Sale obligations.
- Buyer receipts.
- Farmer payouts.
- Sale reversals.
- Replacement-sale postings.
- Payment reversals.
- Approved financial adjustments.

Do not count these as additional monetary movements:

- Buyer-bill issuance when the sale already posted.
- Farmer-bill grouping.
- Payment allocation.
- Allocation release.
- Preview generation.
- Printing or reprinting.

Allocation activity may appear in a separate settlement detail view, but it must not change the statement running balance.

---

## 5. Define Historical Date and Snapshot Behavior

Use two explicit dimensions:

1. Business-effective date: when an event affects the account.
2. Recording cutoff: which committed events were known to the system.

The default statement may show events effective in the selected period using information recorded up to the current captured cutoff.

Explain that a later backdated entry can change a newly generated historical statement.

For reproducible pagination and totals, capture a stable cutoff that covers:

- Ledger postings.
- Allocation events and releases.
- Corrections.
- Relevant document relationships.

Use an existing committed sequence or reporting-snapshot mechanism.

Do not assume a ledger-only sequence covers allocation changes that create no ledger entry.

Within one response, read rows and summaries from a consistent database snapshot.

Across pages, use a validated snapshot token or equivalent bounded mechanism.

Do not hold a SQLite read transaction open while waiting for user navigation.

If a snapshot expires, require a refresh rather than silently mixing old and new data.

---

## 6. Implement Stable Ordering and Pagination

Choose a deterministic financial ordering using existing conventions, such as:

- Business-effective date.
- Posting sequence.
- Entry sequence or stable ID.

For transactions sharing a date, ordering must remain stable.

Return:

- Statement header.
- Opening balance.
- Period totals.
- Closing balance.
- Current page of movements.
- Balance immediately before the page.
- Pagination cursor.
- Snapshot metadata.

Running balances must continue correctly across pages.

Do not restart each page at zero.

Bind cursors to the account, currency, date range, filters, and snapshot. Reject invalid or mismatched cursors.

Use bounded page sizes.

Avoid loading the entire account history into the desktop merely to calculate the current page.

---

## 7. Implement Outstanding-Obligation Queries

Reuse the canonical obligation identities from Phase 26.

For each eligible obligation, return:

- Source identity.
- Party account.
- Source date.
- Original amount.
- Effective amount under correction rules.
- Active allocated amount.
- Remaining amount.
- Currency.
- Related bill references.
- Correction status.
- Settlement status.

Include eligible opening-balance obligations separately from sale obligations.

Do not create duplicate rows for:

- A sale entitlement.
- Its buyer or farmer document.
- A later grouped bill containing that same entitlement.

A farmer-bill total is a grouping over underlying obligations.

Keep unbilled farmer entitlements visible. Bill issuance must not determine whether an obligation exists.

Use authoritative allocation and reversal records.

Never derive outstanding amounts from a mutable paid checkbox.

---

## 8. Calculate Historical Outstanding Correctly

For an “as of” date, reconstruct state using events effective by that date and recorded by the captured cutoff.

Account for:

- Obligation creation.
- Sale reversal and replacement.
- Payment posting.
- Allocation creation.
- Allocation release.
- Payment reversal.

Do not use today’s mutable status to exclude a transaction that was still active at the historical date.

For example:

- A bill fully settled today may have been partially outstanding last month.
- A payment reversed today may still count at an earlier cutoff.
- A corrected sale’s original obligation may be valid before its reversal date.

Inspect whether allocation history contains the dates and ordering needed for historical reconstruction.

If it does not:

- Add forward-compatible event metadata where needed.
- Define an explicit legacy-data limitation.
- Do not fabricate missing historical timestamps.
- Do not label a current-status query as historical outstanding.

Follow the existing approved backdating policy. Do not introduce a new one through reporting code.

---

## 9. Reconcile Outstanding with Account Balance

Present these separately:

- Remaining obligations.
- Unapplied payments or credits, if supported.
- Opposite-direction balances, if supported.
- Net account balance.

A net-zero account can still contain an outstanding bill and an unapplied payment.

Do not automatically allocate them while generating the statement.

Define reconciliation using the approved sign convention.

For a simple supported account with only one obligation direction:

`Net balance = remaining obligations − unapplied settlement amounts`

Extend this explicitly for any approved opposite-direction items.

Do not force unsupported account types into that simplified formula.

If reconciliation fails:

- Return or log an actionable integrity diagnostic through existing conventions.
- Preserve the authoritative records.
- Do not insert balancing entries or clamp negative values to hide the mismatch.

Keep diagnostics free of unnecessary personal information.

---

## 10. Preserve Correction and Document History

Statement rows should link to their original source and related documents.

Show original and reversal movements separately.

Do not hide both because their net effect is zero.

A replacement sale must appear as its own posted movement with correction lineage.

For bill summaries:

- Keep original issued amounts available.
- Show current document status separately.
- Show effective outstanding through source obligations.
- Identify superseded or reversed documents explicitly.

Do not label a reversed bill “Paid” merely because it has no current collectible amount.

Generating a farmer bill after a payout must not alter the statement or recreate outstanding entitlement.

---

## 11. Apply Cheque Settlement Rules

Farmer cheque payouts must appear as payments at the approved physical-handover effective date.

They reduce the farmer liability and allocated outstanding immediately.

Show:

- Payment reference.
- Method: Cheque.
- Handover date.
- Authorized cheque reference details where appropriate.

Do not introduce:

- Pending clearance balances.
- Unpresented-cheque liabilities.
- Clearance dates.
- Rejection status.
- Maturity-based settlement delays.

A payment-record reversal appears as the corresponding opposite financial movement.

Do not imply that the application verified bank clearance.

---

## 12. Add Aging Only with Clear Semantics

If aging is part of the approved reporting scope, implement it using an explicit basis.

Distinguish:

- Age since obligation date.
- Days overdue since an approved due date.

Do not label an obligation overdue when no due-date rule exists.

Use approved bucket boundaries and the selected as-of date.

Place each eligible remaining amount into exactly one bucket.

Show opening obligations with their approved historical date. If their age is unknown, use an explicit unknown-age category rather than inventing a sale date.

Aging totals must equal the corresponding outstanding total.

Do not add credit terms, penalties, or interest calculations in this phase.

---

## 13. Add Contracts and Authorized Read Routes

Extend existing shared contracts and service conventions.

Provide:

- Account statement query.
- Current account summary.
- Outstanding-obligation query.
- Historical outstanding query.
- Bill settlement detail.
- Unapplied-payment query where supported.

Validate:

- Account identity.
- Currency.
- Date range.
- As-of date.
- Page size.
- Cursor or snapshot token.
- Supported filters.

Use `accounts.view` where its approved scope permits these reads. Inspect additional bill and payment permissions before exposing linked details.

Do not grant access to payment metadata merely because a user can see a party name.

Derive tenant and stall from authenticated context.

Enforce device, staff-session, capability, and existing offline-policy checks.

Keep these endpoints read-only.

Do not perform synchronization, correction, or allocation as a side effect of retrieval.

---

## 14. Optimize Queries and Add Migrations Only Where Needed

Inspect query plans against representative data.

Add scoped indexes where needed for:

- Account and business date.
- Posting sequence.
- Obligation identity.
- Allocation and release history.
- Payment references.
- Correction relationships.

Use parameterized SQL and bounded queries.

Avoid joining several one-to-many relationships before aggregation in a way that multiplies monetary amounts.

Aggregate ledger, obligation, and allocation sources independently before combining them.

Use forward-only migrations for required indexes or missing historical metadata.

Do not create another authoritative balance table.

Any cached summary must be rebuildable and preserve snapshot semantics.

Document expected query performance without claiming production-scale verification from tiny fixtures.

---

## 15. Build the Desktop Statement Workspace

Use the existing app shell and design system.

Provide entry points from farmer and buyer account details.

### Statement header

- Party code and name.
- Account role.
- Currency.
- Date range.
- Date basis.
- Generated-at and data-cutoff information.

### Summary

- Opening balance and direction.
- Period increases.
- Period decreases.
- Closing balance and direction.

Use operator-friendly labels consistent with the account role.

### Movement table

- Business date.
- Source type.
- Document/reference.
- Description.
- Increase/decrease or approved debit/credit columns.
- Running balance and direction.
- Correction/reversal links.

### Outstanding tab

- Current or selected as-of date.
- Obligation source.
- Original/effective amount.
- Settled amount.
- Remaining amount.
- Related bill.
- Separate unapplied payment summary where supported.

Keep selected-period totals distinct from the current all-time balance.

---

## 16. Make Filters and Navigation Financially Clear

Provide keyboard-accessible:

- Party selection.
- Date inputs.
- Apply/reset filters.
- Pagination.
- Source-detail navigation.
- Snapshot refresh.

A reference search or movement-type filter must not silently turn a subset sum into the full account closing balance.

Either:

- Keep financial totals based on the complete selected period and label the row filter, or
- Present a clearly labeled movement-search view without claiming it is a complete statement.

Do not recompute running balances using only visible matched rows.

Handle:

- No movements in the selected period.
- Nonzero opening with no period activity.
- Inactive party with financial history.
- No opening initialization.
- Missing permission.
- Expired session.
- Service unavailable.
- Expired snapshot.

Clear protected state on logout and ignore stale responses after switching accounts or dates.

---

## 17. Prepare Printing and Export Integration

Provide a stable statement view model for later printing and exports.

Include:

- Scope and party identity.
- Currency and sign labels.
- Selected dates.
- Snapshot metadata.
- Opening and closing balances.
- Ordered rows.
- Period totals.
- Outstanding summary where requested.
- Calculation/view-model version where useful.

Do not issue a bill number for a statement.

Do not implement printer management, PDF generation, CSV exports, or external delivery in this phase.

Ensure later exports can retrieve the complete snapshot rather than exporting only the currently visible page.

Keep export-ready data subject to the same authorization boundaries.

---

## 18. Add Meaningful Automated Tests

### Exact statement fixture

Use an isolated buyer account with:

- Imported opening: `2,000`.
- Sale obligation: `10,000`.
- Receipt: `4,000`.

Expected balance: `8,000`.

Verify that allocating the receipt changes outstanding details without reducing the ledger balance again.

Reverse the receipt and verify the balance returns to `12,000`.

### Farmer fixture

Use:

- Farmer entitlement: `9,500`.
- Cheque payout at handover: `3,000`.

Expected remaining liability: `6,500`.

Verify farmer-bill issuance does not change it.

### Statement tests

Cover:

- Opening before and inside the period.
- Zero opening metadata.
- No activity with nonzero opening.
- Multiple entries on the same date.
- Exact running balances across pages.
- Reversal and replacement chains.
- Currency and account-role separation.
- Inactive parties.
- Backdated entries.
- Business-timezone boundaries.
- Snapshot stability during concurrent writes.
- Expired and mismatched cursors.
- Search filters preserving correct financial meaning.

### Outstanding tests

Cover:

- Partial and full settlement.
- Opening obligations.
- Unbilled farmer entitlements.
- Farmer-bill grouping without duplicate debt.
- Allocation release.
- Payment reversal.
- Supported unapplied payments.
- Historical state before and after correction.
- Historical state before and after allocation.
- Allocation-only events after snapshot capture.
- Bill status independent of account net balance.
- Aging boundaries if implemented.

### Security and regression tests

Cover tenant/stall isolation, capabilities, session expiry, and safe drill-down access.

Verify statement generation creates no financial entries, allocations, bill numbers, or financial outbox events.

---

## 19. Prepare Operator Acceptance and Documentation

Create or update:

`docs/operations/account-statements-and-outstanding-balances.md`

Document a development/staging checklist:

1. Confirm service connectivity and account-view permissions.
2. Prepare a test buyer with an opening, sale, and partial receipt.
3. Open its statement for the complete period.
4. Verify opening plus movements equals closing.
5. Compare closing with the account summary at the same cutoff.
6. Narrow the date range and verify the brought-forward opening.
7. Page through movements and verify running-balance continuity.
8. Open outstanding obligations and verify partial settlement.
9. Check an earlier as-of date before the receipt.
10. Reverse a test payment and verify current and historical behavior.
11. Review a corrected sale and follow its original/replacement links.
12. Open a farmer statement with a recorded cheque handover.
13. Verify immediate liability reduction without clearance status.
14. Generate a farmer bill and confirm the account balance is unchanged.
15. Verify inactive parties remain available to authorized users.
16. Verify restricted users cannot access protected account data.
17. Refresh after another terminal posts a transaction.
18. Confirm the previous snapshot remains stable or requires an explicit refresh.

If migrations are required, back up and run:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset the database.

Document historical-data limitations and pending physical-terminal checks.

Update context files and the progress tracker.

Run applicable formatting, lint, type, domain, database, service, UI, end-to-end, and build checks.

Report:

1. Files and migrations changed.
2. Statement and historical-date semantics.
3. Snapshot and pagination behavior.
4. Outstanding reconciliation rules.
5. Permissions and routes.
6. Tests executed and results.
7. Manual checks completed or pending.
8. Historical-data limitations.
9. Readiness for Phase 29.

## Acceptance Criteria

- Statements reconcile exactly to authoritative ledger entries.
- Imported openings are never counted twice.
- Running balances remain correct across pages.
- Historical views respect effective dates and recording cutoffs.
- Outstanding obligations are not duplicated through bill grouping.
- Allocation activity does not create monetary statement movements.
- Corrections and reversals remain traceable.
- Cheque payouts settle at recorded handover.
- Account net balance, bill outstanding, and unapplied payments remain distinct.
- Read access is scoped and authorized.
- Statement retrieval has no financial side effects.
- Tests pass and remaining acceptance work is documented.