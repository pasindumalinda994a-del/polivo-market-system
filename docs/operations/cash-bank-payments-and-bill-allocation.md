# Cash, Bank Payments, and Bill Allocation

Phase 26 operations for recording buyer receipts and farmer payouts, allocating them to obligations, and reversing bookkeeping errors.

## Policy

Accepted decision: [ADR 0017 — Cash, bank payments, and allocation](../decisions/0017-cash-bank-payments-and-allocation.md).

- Buyer receipt (`payments.receive_trader`) and farmer payout (`payments.pay_farmer`) only.
- Methods: `cash` and manually recorded `bank_transfer`. Farmer cheque payouts are Phase 27 — see [cheque-payments-and-handover.md](./cheque-payments-and-handover.md).
- Recognition: operator commits a reviewed preview of already-completed physical activity.
- Allocations are explicit and reviewed. Oldest-unpaid may propose a breakdown; commit does not silently redistribute.
- Excess amount becomes unapplied party credit/advance via the single payment ledger posting. Later allocation of remaining available amount does not post money again.
- Obligation targets: trader bills, farmer sale lines (`farmer_receives_minor`), posted opening drafts.
- Receipt references `R-{n}`; payout references `P-{n}` (sequences start at `100001`).
- Full bookkeeping reversal only (`payments.reverse`). Not a cash refund or bank transfer. No partial reverse; no standalone allocation release/reassign.
- Bill settlement status derives from obligation remainders, not the party net balance.
- Corrections with active allocations remain blocked (ADR 0016). Payment posting serializes against the same eligibility helpers.

## Migration

Apply pending local migrations without reset:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Migration `012_cash_bank_payments_and_bill_allocation` rebuilds payment/allocation tables for source-level targets and adds payment sequences. Restart stall-service and desktop after migrate. Sign out/in (or trusted permission refresh) so cashier snapshots that should collect/pay include `payments.receive_trader` / `payments.pay_farmer`. Owners already have the full catalog, including `payments.reverse`.

## Desktop workflow

1. Open **Payments**, or use **Receive payment** / **Record payout** from a buyer/farmer account, or **Record payment** from bill history.
2. Choose Receive from buyer or Pay farmer.
3. Select party, method (cash or bank transfer), amount, and business date. Enter bank reference and transfer date when required.
4. Select eligible obligations and enter explicit allocation amounts, or propose oldest-first and review the breakdown.
5. Keep account balance separate from selected bill outstanding.
6. Preview/review effects (allocations, remainders, unapplied, balance after). Preview is not a receipt.
7. Post explicitly. Enter does not commit. Retries use the same idempotency key.
8. If the response is lost, use recovery: check outcome, retry the same payload, or discard after confirming status.
9. Review payment history, allocate remaining unapplied amounts when needed, or reverse a posted payment with reason when authorized.

## Staging checklist

1. Back up the database.
2. Apply pending migrations without reset.
3. Restart service and desktop.
4. Refresh authorized staff permissions.
5. Finalize a test buyer sale.
6. Record a partial cash receipt.
7. Verify one ledger effect and partial bill settlement.
8. Record the remainder by bank transfer.
9. Verify full settlement.
10. Generate a farmer bill.
11. Record a partial farmer payout.
12. Verify farmer liability decreases once.
13. Allocate across multiple eligible obligations.
14. Settle a supported opening balance.
15. Retry a posted operation and verify no duplication.
16. Reverse a test payment and verify obligations reopen.
17. Verify a sale correction with active allocations is blocked where unsupported.
18. Test unapplied-payment allocation (account balance unchanged).
19. Test concurrent settlement from another terminal when available.
20. Verify restricted staff cannot reverse payments.
21. Restart and recover payment history and statuses.

## Status meanings

| Status | Meaning |
|---|---|
| Bill `unpaid` | No active allocations against its obligations |
| Bill `partially_paid` | Some but not all obligation amount allocated |
| Bill `fully_paid` | Remaining obligation amount is zero |
| Payment `posted` | Financial effect recorded; may still have unapplied amount |
| Payment `reversed` | Full bookkeeping reversal linked; history preserved |

Do not show a reversed/superseded document as Paid merely because collectible amount is zero.

## Recovery after uncertain outcomes

A network timeout does not prove money was not exchanged. Keep the original idempotency key, look up `/payments/operations/:key`, and retry the same reviewed payload when appropriate. Do not instruct the operator to collect or pay again solely because the UI timed out.

## Cheque boundary (Phase 27)

Do not record cheques as cash or bank transfers to bypass method rules. Farmer cheque payment and handover settlement is documented in [cheque-payments-and-handover.md](./cheque-payments-and-handover.md) (ADR 0018). Buyer/trader cheque receipts remain unsupported.
