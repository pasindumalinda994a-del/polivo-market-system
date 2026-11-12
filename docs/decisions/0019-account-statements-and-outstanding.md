# 0019 — Account Statements and Outstanding Balances

- Status: Accepted
- Date: 2026-11-11

## Context and source

Phase 28 (`28-account-statements-and-outstanding-balances.md`) requires read-only farmer and buyer account statements and outstanding views over Phase 21–27 financial records. ADR [0014](./0014-party-subledger-and-opening-balances.md) defined natural signs, party-role accounts, and imported openings. ADR [0017](./0017-cash-bank-payments-and-allocation.md) defined source-level obligations, unapplied credit, and allocation without a second ledger movement. No prior ADR defined statement period opening, reporting snapshots across pages, or historical outstanding reconstruction when allocation release timestamps were incomplete.

## Decision

1. **Statements are read-only.** Generating or viewing a statement must not post ledger entries, allocate payments, change settlement, create bills, or emit financial outbox events.

2. **Statement opening vs imported opening.** An imported opening is a posted Phase 21 financial event. A statement opening is the sum of all qualifying posted account movements before the selected period. Do not add the imported opening again after summing ledger movements. If an imported opening falls inside the period, show it as a period movement; if before, include it only in the statement opening. Respect `opened_zero` metadata without inventing a zero monetary movement.

3. **Monetary source of truth.** Statement amounts and running balances come only from posted `ledger_entries`. Buyer-bill issuance, farmer-bill grouping, payment allocation, allocation release, previews, and printing are not additional monetary movements. Allocation may appear in settlement detail without changing the running balance.

4. **Dual date dimensions.** Business-effective date is when an event affects the account. Recording cutoff is which committed events were known at snapshot capture. Default statements show events effective in the selected period using information recorded up to the captured cutoff. A later backdated entry can change a newly generated historical statement.

5. **Reporting snapshot.** Capture watermarks in a short SQLite read (`maxPostingSequence`, allocation and payment recording watermarks). Bind opaque snapshot tokens and pagination cursors to account, currency, date range/filters, and those watermarks. Do not hold a read transaction open across user navigation. Expired or mismatched tokens require an explicit refresh; never silently mix old and new data.

6. **Business date boundaries.** Local stall financial dates continue to use UTC calendar `YYYY-MM-DD` (existing Phase 22/26 convention). Do not derive boundaries from the terminal OS timezone. Tenant cloud timezone is not wired into local statement boundaries in this phase.

7. **Outstanding identities.** Reuse Phase 26 obligation kinds (`trader_bill`, `farmer_sale_line`, `opening_balance`). Do not duplicate debt through farmer-bill grouping. Keep unbilled farmer entitlements visible. Never derive outstanding from mutable `payment_status` checkboxes.

8. **Historical outstanding.** Reconstruct using events effective by the as-of date and recorded by the captured cutoff. Migration `014` adds `payment_allocations.released_at` set on payment reversal. Pre-`014` reversed rows with null `released_at` may use the linked reversal payment `recorded_at` when available; otherwise do not claim precise historical release timing and document the limitation. Do not label a current-status query as historical outstanding.

9. **Reconciliation.** Present remaining obligations, unapplied payments/credits, and net account balance separately. For simple one-direction accounts: `netBalance = remainingObligations − unappliedSettlementAmounts` under natural signs. On mismatch, return/log an actionable integrity diagnostic without inventing balancing entries or clamping values.

10. **Permissions.** Statement, summary, and outstanding amount reads use `accounts.view`. Payment method/cheque metadata and payment-detail drill-down require the matching payment capability. Do not expose payment metadata solely because a user can see a party name.

11. **Cheque presentation.** Farmer cheque payouts appear as payments at the recorded physical-handover effective date. Show method Cheque and handover details where authorized. Do not introduce clearance, unpresented, or rejection balances.

12. **Out of scope.** Aging buckets, printing/PDF/CSV, opposite-direction inventiveness beyond already-supported natural signs, netting farmer and buyer accounts of the same person, and new authoritative balance caches.

## Reasoning

Separating statement opening from imported openings prevents double-counting while reusing the immutable ledger. Snapshot watermarks give reproducible pagination without long-lived SQLite readers. Explicit historical reconstruction with a documented legacy release-timestamp limitation avoids fabricating missing history or mislabeling live status queries. Keeping allocation out of the running balance preserves Phase 26’s “allocate without moving the account” rule.

## Consequences

- Local migration `014` adds allocation `released_at` and statement-oriented indexes.
- Contracts/domain add statement, outstanding, snapshot, and reconciliation schemas/helpers.
- Stall-service exposes read-only `/accounts/...` statement and outstanding routes gated by `accounts.view`.
- Desktop adds an Account statement workspace from Farmers/Buyers account details.
- Ops guide documents operator checklist and historical-data limitations.
- Aging and exports remain later phases.

## Related implementation phases

- Phase 21 / ADR 0014 — party subledger and openings
- Phase 25 / ADR 0016 — corrections and reversals
- Phase 26 / ADR 0017 — payments and allocation
- Phase 27 / ADR 0018 — farmer cheque handover settlement
- Phase 28 — account statements and outstanding balances
