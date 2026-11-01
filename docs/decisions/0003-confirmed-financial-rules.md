# 0003 — Confirmed Financial Rules

- Status: Accepted
- Date: 2026-11-01

## Context and source

Phase 08 encodes approved stall financial foundations in `@polivo/domain` and matching transport schemas in `@polivo/contracts`. Source: approved Business Rules draft confirmed for phase 08 (domain foundations only), `docs/implementation/08-business-domain-and-financial-rules.md`, `docs/context/architecture.md`, and `docs/context/code-standards.md`.

Prior open questions in `docs/context/progress-tracker.md` blocked money, weight, commission, rounding, bill numbering formats, payment allocation defaults, farmer cheque effects, correction invariants, permission capability lists, and public price math.

## Decision

### Money and weight representation

- Money uses integer minor units (paisa). Rs. 1.00 is stored and calculated as `100`.
- Weight uses integer hundredths of a kilogram. 25.50 kg is stored and calculated as `2550`.
- Authoritative financial math must not use unrestricted floating-point arithmetic.

### Commission

- Commission is charged per kilogram of net vegetable weight from the selling price per kilogram.
- Below Rs. 200/kg: Rs. 5 per kg.
- Rs. 200–400/kg inclusive of both boundaries: Rs. 15 per kg.
- Above Rs. 400/kg: Rs. 50 per kg.
- Commission is deducted from the farmer payment; the trader pays the full selling price.
- Commission rule changes apply to new sales only; finalized bills retain original calculations.

### Rounding and packaging

- Round each bag’s sale amount and commission to two decimal places using half-up (third decimal ≥ 5 rounds up).
- Bill totals are the sum of those rounded line amounts.
- Do not automatically round the final bill to whole rupees.
- Net weight = gross weight − packaging weight; packaging defaults to zero; negative net weight is invalid.

### Bill numbers and payment statuses

- Farmer bill numbers: `F-` followed by digits (example sequence start `F-111111`).
- Trader bill numbers: `T-` followed by digits (example sequence start `T-444444`).
- Sequences are per stall and bill type; assigned on finalize; never daily-reset; never reused after cancel.
- Payment methods: `cash`, `bank_transfer`, `cheque`.
- Payment statuses: `unpaid`, `partially_paid`, `fully_paid`.
- Default payment allocation: oldest unpaid bill first; overpayment becomes customer credit.
- Farmer advances reduce later settlements.
- Farmer and trader balances remain separate even when the same person has both roles.

### Farmer cheques

- When a cheque is handed to a farmer, record the amount as paid immediately.
- Do not require cheque numbers, bank details, deposit dates, or clearance status.
- Do not build a cheque-clearance workflow in this release.

### Explicitly not decided

- Whether cheques received from traders are also treated as paid immediately. Do not assume the farmer rule applies to trader payments. A proposed rule is recorded in [0006](0006-trader-cheque-immediate-paid-proposed.md) (Status: Proposed) and must not be treated as accepted until confirmed.

### Phase 08 delivery boundary

- Encode the above as pure domain helpers and transport schemas only.
- Persistence, APIs, UI, permission enforcement, and sync remain later phases.

## Reasoning

Integer minor units and weight hundredths satisfy the two-decimal display rules without floating-point drift. Inclusive 200/400 commission boundaries match the confirmed examples. Separating farmer cheque policy from trader cheques preserves the unresolved product question. Keeping phase 08 calculation-only prevents inventing persistence or UX behavior not yet guided.

## Consequences

- `@polivo/contracts` may validate money, weight, payment method/status, and bill-number string shapes.
- `@polivo/domain` owns commission, rounding, net weight, allocation, public-price math, and farmer-cheque immediate-paid policy helpers.
- Stall-service and database phases must consume these helpers rather than re-implementing rules.
- Trader cheque balance effects remain blocked until [0006](0006-trader-cheque-immediate-paid-proposed.md) is accepted.
- v1 commission configuration without overrides is further specified in [0005](0005-commission-configuration-v1.md).

## Related implementation phases

- Phase 05 — Shared contracts foundations (financial transport deferred)
- Phase 08 — Business domain and financial rules
- Later phases — Local persistence, stall-service commands, billing UI, permission enforcement
