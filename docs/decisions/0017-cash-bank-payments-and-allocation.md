# 0017 — Cash, Bank Payments, and Allocation

- Status: Accepted
- Date: 2026-11-11

## Context and source

Phase 26 (`26-cash-bank-payments-and-bill-allocation.md`) requires operational payment posting and obligation allocation. ADR [0003](./0003-confirmed-financial-rules.md) confirmed payment methods, oldest-unpaid allocation, overpayment credit, and farmer advances. ADR [0014](./0014-party-subledger-and-opening-balances.md) defined party-subledger signs and deferred opening settlement to a dedicated opening-item reference. ADR [0016](./0016-sale-corrections-reverse-and-replace.md) requires payment posting to serialize against the same obligation eligibility used by sale corrections. No prior ADR defined cash/bank metadata, receipt/payout numbering, source-level farmer targets, unapplied allocation-after-post, or reversal scope for Phase 26.

## Decision

1. **Directions:** Buyer receipt records money received from a trader/buyer (`payments.receive_trader`) and posts a negative trader ledger entry. Farmer payout records money paid to a farmer (`payments.pay_farmer`) and posts a negative farmer ledger entry. Opposite-direction payments are out of scope.

2. **Methods:** Support `cash` and manually recorded `bank_transfer` only. Reject `cheque` in Phase 26 APIs; cheque workflows remain Phase 27. Do not initiate bank transfers or integrate a payment gateway.

3. **Recognition:** A payment is posted only when an authorized operator commits a reviewed preview that records already-completed physical cash or bank activity. Drafts and previews have no financial effect.

4. **Allocation ordering:** Commit uses **explicit** reviewed allocation amounts only. Oldest-unpaid ordering (ADR 0003) may propose a breakdown for operator review. Do not silently redistribute on commit.

5. **Excess / unapplied:** Payment amount may exceed selected allocations. The unapplied remainder becomes party credit (buyer) or advance-like balance (farmer) via the single payment ledger posting. Later allocation of remaining available amount must not post money movement again.

6. **Obligation identities:**
   - Buyer: active finalized `trader_bill_id` (one bill per sale).
   - Farmer: `sale_line_id` using `farmer_receives_minor` (expand farmer-bill selection into source lines; unbilled lines remain eligible).
   - Opening: posted `opening_balance_drafts.id` — never fabricate historical bills.

7. **Bills as navigation:** Trader and farmer bills group obligations for UI. They must not create duplicate settlement targets for the same underlying obligation.

8. **Cash and bank metadata:** Cash records party, direction, exact amount/currency, business date, actor, and optional note. Bank transfer additionally requires transfer reference and transfer date; optional free-text stall bank-account label is allowed. No chart-of-accounts cash/bank GL and no cash-drawer balance inference from party ledgers.

9. **References:** Per-stall sequences issue buyer receipts as `R-{digits}` and farmer payouts as `P-{digits}`, starting at `100001`. Numbers are allocated on commit only and never reused after reverse.

10. **Immutability:** Posted payment amount, method, party, direction, business date, and financial metadata are immutable. Corrections use linked full reversal, not in-place edits.

11. **Reversal:** Full bookkeeping reversal only, gated by `payments.reverse`. Create an exact opposite ledger posting, reverse active allocations, link reversal to the original payment, and preserve history. Not a cash refund or bank transfer. No partial payment reversal. Standalone allocation release/reassignment is unsupported in Phase 26.

12. **Permissions:** `payments.receive_trader`, `payments.pay_farmer`, and `payments.reverse`. Do not authorize payment posting via `bills.*` or opening capabilities. Recommended cashier defaults include receive/pay and omit reverse. `payments.record_cheque` remains unused until Phase 27.

13. **Concurrency:** Recheck obligation eligibility, remainders, and reviewed fingerprint inside the write transaction. Serialize with Phase 25 correction eligibility so allocations cannot attach to reversed/superseded obligations and corrections cannot overlook committed allocations.

14. **Atomicity:** Payment header, ledger effect (when posting money), allocations, bill settlement projections, audit, and outbox commit in one SQLite transaction. Allocation-only operations against an existing unapplied payment leave the party ledger unchanged.

## Reasoning

These rules operationalize ADR 0003 allocation and credit defaults without inventing FIFO-on-commit behavior that would surprise operators. Source-level farmer sale-line targets and opening-draft targets satisfy Phase 26’s non-duplication and ADR 0014 opening-settlement requirements. Restricting methods to cash/bank and reversals to full bookkeeping keeps cheque and refund semantics for later phases. Dedicated payment capabilities prevent cashiers who can collect cash from automatically reversing posted payments.

## Consequences

- Local migration `012` extends payments, rebuilds allocation targets, and adds payment sequences.
- Stall-service exposes preview/post/allocate/reverse/outcome routes with atomic posting through the Phase 21 ledger interface.
- Desktop adds a Payments workspace plus account/bill entry points with uncertain-outcome recovery.
- Phase 25 allocation detection must use the extended allocation target model.
- Cheque recording, payment gateways, printers, and standalone allocation release remain out of scope.

## Related implementation phases

- Phase 08 / ADR 0003 — payment method and allocation defaults
- Phase 21 / ADR 0014 — party subledger signs and opening settlement deferral
- Phase 22–24 — sale obligations, trader bills, farmer bill lines
- Phase 25 / ADR 0016 — correction eligibility vs allocations
- Phase 26 — cash/bank payments and bill allocation
- Phase 27 — cheques
