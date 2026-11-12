# Cheque Payments and Handover Settlement

Phase 27 operations for recording farmer cheque payouts that settle on physical handover. Filename continuity: implementation guide remains `27-cheque-lifecycle-and-settlement.md`; there is no cheque clearance lifecycle.

## Policy

Accepted decision: [ADR 0018 — Farmer cheque handover settlement](../decisions/0018-farmer-cheque-handover-settlement.md). Builds on [ADR 0017](../decisions/0017-cash-bank-payments-and-allocation.md) payment/allocation/reversal infrastructure and [ADR 0003](../decisions/0003-confirmed-financial-rules.md) immediate-paid farmer cheque rule.

- Cheque is a payment method for **farmer payouts only**.
- Settlement occurs when physical handover is recorded and the reviewed preview is posted.
- Required metadata: cheque number (string; leading zeros preserved), issuing bank label, cheque date, physical handover date; optional note.
- Payment posting reduces farmer liability once; allocations reduce selected obligations immediately.
- No clearance, deposit, bounce, maturity, or bank-reconciled claim from posting a cheque.
- Buyer/trader cheque receipts are unsupported ([ADR 0006](../decisions/0006-trader-cheque-immediate-paid-proposed.md) remains Proposed).
- Duplicate cheque metadata in the same stall produces a **warning**, not a hard reject. System payment references (`P-*`) remain unique. Idempotency still prevents duplicate posts on retry.
- Preview/post require `payments.pay_farmer` and `payments.record_cheque`. Reversal requires `payments.reverse` and is a payment-record reversal only—not bounce, bank cancel, or clearance failure.
- Recovery after timeout reuses Phase 26 operation lookup; do not hand over another cheque solely because the UI timed out.

## Migration

```bash
pnpm --filter @polivo/db-local db:migrate
```

Migration `013_cheque_payments_and_handover` rebuilds `payments` (and `payment_allocations`) to add cheque metadata columns and CHECKs while preserving existing cash/bank rows. It does **not** rely on mid-transaction `PRAGMA foreign_keys = OFF` (that pragma is a no-op inside the runner’s `BEGIN IMMEDIATE`). Do not reset the database. Restart stall-service and desktop after migrate. Sign out/in (or trusted permission refresh) so cashier snapshots that record cheques include `payments.record_cheque` in addition to `payments.pay_farmer`.

## Desktop workflow

1. Open **Payments**, choose **Pay farmer**.
2. Select Cheque as the method (unavailable for buyer receipts).
3. Enter amount, cheque number, issuing bank, cheque date, handover date, allocations, and optional note.
4. Confirm physical handover.
5. Review: the form states that recording the handover counts the amount as paid.
6. Post. Retrieve from payment history; filter by Cheque when needed.
7. Reverse only with `payments.reverse` and a reason. History preserves cheque metadata.

Do not use a real physical cheque for automated or simulated acceptance tests.

## Staging checklist (simulated handover)

1. Back up the database.
2. Apply pending migrations without resetting it.
3. Restart service and desktop.
4. Sign in with authorized payout permissions (`payments.pay_farmer` + `payments.record_cheque`).
5. Create or select a test farmer obligation.
6. Note the account balance and obligation outstanding.
7. Choose Cheque in the payout form.
8. Enter test cheque metadata (include a leading-zero number).
9. Select a partial allocation.
10. Confirm simulated physical handover.
11. Review and post.
12. Verify the farmer liability decreases once.
13. Verify the obligation becomes partially settled immediately.
14. Confirm no clearance step is required.
15. Retrieve the payment from history.
16. Retry the same operation and confirm no duplicate.
17. Record a separate test payment for the remaining amount.
18. Verify full settlement.
19. Reverse an eligible test cheque payment.
20. Verify its allocations reverse and outstanding amounts reopen.
21. Confirm unauthorized users cannot reverse it.
22. Confirm buyer-cheque entry is unavailable.
23. Restart and verify payment history persists.
24. Test uncertain-outcome recovery in a controlled environment.

## Related

- [Cash, bank payments, and bill allocation](./cash-bank-payments-and-bill-allocation.md)
- [Local database and migrations](./local-database-and-migrations.md)
