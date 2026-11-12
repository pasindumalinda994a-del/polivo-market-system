# Account Statements and Outstanding Balances

Phase 28 read-only farmer and buyer account statements and outstanding views. Printing, PDF/CSV exports, and aging buckets are out of scope.

## Policy

Accepted decision: [ADR 0019 — Account statements and outstanding](../decisions/0019-account-statements-and-outstanding.md).

- Statements reconcile only to posted ledger entries. Allocation does not create monetary statement movements.
- Statement opening = sum of movements before the selected period (may include an imported opening). Do not double-count imported openings.
- Dual dates: business-effective calendar date and recording cutoff via reporting snapshot watermarks.
- Business date boundaries use **UTC calendar `YYYY-MM-DD`** (existing stall convention). Do not use the terminal OS timezone.
- Farmer and buyer accounts stay separate. Currencies are not combined (LKR only).
- Outstanding uses Phase 26 obligation identities. Farmer bills group lines and must not duplicate debt.
- Historical outstanding reconstructs with effective dates + recording cutoff. Pre-migration `014` reversed allocations without `released_at` may use linked reversal payment `recorded_at` (legacy limitation).
- Cheque payouts appear at recorded physical handover; no clearance status.
- Reads require `accounts.view`. Payment method/cheque metadata requires matching payment capability.

## Migration

```bash
pnpm --filter @polivo/db-local db:migrate
```

Migration `014_account_statements_and_outstanding` adds `payment_allocations.released_at` and statement indexes. Do **not** initialize or reset the database. Restart stall-service and desktop after migrate.

## Desktop workflow

1. Open Farmers or Buyers, select a party, open Account.
2. Choose **Open statement**.
3. Set from/to dates (UTC calendar), Apply.
4. Review opening, period increase/decrease, closing, and movement running balances.
5. Page with Load more; running balances continue across pages.
6. Use movement search only as a row filter — period totals stay for the full selected period.
7. Outstanding tab: load current or historical as-of; compare remaining obligations, unapplied payments, and account balance.
8. Refresh snapshot after another terminal posts, or when a snapshot expires.

## Staging checklist

1. Confirm service connectivity and `accounts.view`.
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

## Historical-data limitations

- Allocations reversed before migration `014` may lack `released_at`. Reconstruction uses the linked reversal payment `recorded_at` when present; otherwise precise release timing is not claimed.
- Tenant cloud timezone is not wired into local statement boundaries.
- Operator acceptance and physical multi-terminal checks remain pending.

## Routes

- `GET /accounts/:partyKind/:partyId/statement`
- `GET /accounts/:partyKind/:partyId/summary`
- `GET /accounts/:partyKind/:partyId/outstanding`
- `GET /accounts/:partyKind/:partyId/outstanding/historical`
- `GET /accounts/:partyKind/:partyId/unapplied-payments`
- `GET /accounts/:partyKind/:partyId/bills/:billKind/:billId/settlement`
