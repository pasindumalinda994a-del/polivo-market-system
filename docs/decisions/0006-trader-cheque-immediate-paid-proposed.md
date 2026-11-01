# 0006 — Trader Cheque Immediate-Paid (Proposed)

- Status: Proposed
- Date: 2026-11-01

## Context and source

Farmer cheques are confirmed as paid immediately when handed over ([0003](0003-confirmed-financial-rules.md)). Trader cheque balance effects were left open. The owner supplied a proposed rule ahead of phase 09. This record captures the proposal only; it is **not** an accepted business rule until confirmed.

## Proposed decision

Treat trader cheques as paid immediately when physically received:

- Record the payment method as `cheque`.
- Reduce the trader’s outstanding balance by the cheque amount immediately.
- Do not track deposits, clearance, or bounced-cheque statuses.
- If a cheque later fails, an authorized user manually reverses the payment with a reason.
- Keep both the original payment and the reversal in history.

Example: a trader owes Rs. 20,000 and gives a cheque for Rs. 12,000 → record Rs. 12,000 paid; remaining balance Rs. 8,000.

## Reasoning (provisional)

Mirroring farmer cheque handling keeps staff workflow simple and avoids a clearance subsystem in the first release. Manual reversal with retained history would cover later failures without silent deletes.

## Consequences while Proposed

- Do not implement trader-cheque immediate-paid domain helpers or service behavior as confirmed rules.
- Phase 09 schema must not add cheque-clearance tables (already forbidden by [0004](0004-phase-09-first-migration-schema-breadth.md)).
- When accepted, update this record to Accepted, align `@polivo/domain` with farmer cheque policy for traders, and close the open question in `docs/context/progress-tracker.md`.

## Related implementation phases

- Phase 08 — Business domain and financial rules
- Phase 09 — Local SQLite schema and migrations (schema-neutral while proposed)
- Later phases — Payment recording and reversals
