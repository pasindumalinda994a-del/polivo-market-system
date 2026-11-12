# 0018 — Farmer Cheque Handover Settlement

- Status: Accepted
- Date: 2026-11-11

## Context and source

Phase 27 (`27-cheque-lifecycle-and-settlement.md`) extends Phase 26 payment posting for farmer cheque payouts. ADR [0003](./0003-confirmed-financial-rules.md) confirmed that farmer cheques are paid immediately on handover and forbade a clearance workflow; it also said cheque numbers and bank details were not required for that settlement rule. ADR [0017](./0017-cash-bank-payments-and-allocation.md) deferred cheque APIs to Phase 27 and left `payments.record_cheque` unused. ADR [0006](./0006-trader-cheque-immediate-paid-proposed.md) remains Proposed for buyer/trader cheques. Operational recording needs bounded instrument metadata without introducing bank clearance, deposit, bounce, or maturity tracking.

## Decision

1. **Method and direction:** `cheque` is a payment method for **farmer payouts only** (`partyKind: farmer`, `direction: pay`). Buyer/trader cheque receipts are unsupported and must be rejected at the service even if the UI hides the option.

2. **Settlement recognition:** When an authorized operator records that a cheque was physically handed to a farmer and commits the reviewed preview, the payment posts immediately. The farmer liability and selected allocations reduce once in the same transaction. No later clearance, deposit, bounce, or maturity action is required or allowed.

3. **Operational metadata (required):** Cheque number/reference (string; preserve leading zeros), issuing bank label (free text; not a bank-account master identity), cheque date, and physical handover date. Optional bounded note. System payment reference (`P-*`) stays separate from the cheque number.

4. **Clarification of ADR 0003:** Immediate-paid-on-handover and no-clearance remain in force. The earlier “do not require cheque numbers / bank details” guidance applied to settlement semantics and clearance avoidance. Phase 27 **requires** the operational metadata above for durable recording and duplicate review; it does not introduce clearance status fields.

5. **Handover confirmation:** Preview must state that recording the handover counts the amount as paid. Commit requires explicit physical-handover confirmation. A future physical handover date must not be recorded as a completed payout. Cheque date and handover date remain distinct.

6. **Accounting:** Reuse Phase 26 farmer-payout posting (single party-subledger line). Do not invent a cash/bank/cheque counterpart GL or treat posting as bank reconciliation. Keep cheque totals distinguishable from cash and bank_transfer in method-based reporting.

7. **Duplicates:** Cheque number alone is not a global payment identity. There is no approved instrument UNIQUE constraint. When matching cheque metadata already exists in the stall, preview warns and shows authorized references; operators may proceed deliberately. Idempotency still prevents duplicate payouts on retry.

8. **Permissions:** Farmer cheque preview/post requires `payments.pay_farmer` and `payments.record_cheque`. Payment reversal remains `payments.reverse` only and is labeled as a payment-record reversal—not bounce, bank cancel, or clearance failure. Reversal does not claim the physical cheque was retrieved or that the bank was stopped.

9. **Unsupported:** Clearance-state tables, deposit batches, maturity queues, rejection workflows, cheque reminder jobs, cheque images/signatures/credentials, buyer cheque receipts, and parallel cheque-only posting endpoints.

## Reasoning

Handover-as-settlement matches confirmed farmer practice without building a banking subsystem. Requiring operational metadata improves auditability and duplicate review while preserving ADR 0003’s immediate-paid rule. Rejecting buyer cheques avoids inventing trader-cheque semantics still Proposed in ADR 0006. Reusing Phase 26 allocation and reversal keeps one payment model across methods.

## Consequences

- Local migration `013` adds cheque metadata columns and CHECKs on `payments`.
- Contracts and stall-service accept `cheque` for farmer payouts with method-specific validation; buyer cheque submissions fail explicitly.
- Desktop Payments workspace adds Cheque for farmer payouts with handover confirmation; no clearance dashboard.
- Ops guide: `docs/operations/cheque-payments-and-handover.md`.
- Trader cheque immediate-paid remains blocked until ADR 0006 is accepted.

## Related implementation phases

- Phase 08 / ADR 0003 — farmer cheque immediate-paid policy
- Phase 09 / ADR 0004 — no cheque-clearance tables in first schema
- Phase 26 / ADR 0017 — cash/bank payments and allocation foundations
- Phase 27 — cheque payment and handover settlement
