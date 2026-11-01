# 08 — Business Domain and Financial Rules

## Goal

Implement confirmed financial foundations for Polivo:

1. Persist the approved business rules into this guide and a decision record.
2. Add money, weight, payment-method, bill-number, and payment-status transport schemas to `@polivo/contracts`.
3. Bootstrap `@polivo/domain` with pure calculation functions for commission, rounding, net weight, sale lines, totals, payment allocation, public prices, farmer-cheque policy, bill-number formatting, and permission capability constants.

Do not invent unresolved financial rules. Trader cheque balance effects remain open and must not be assumed from the farmer cheque rule.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Confirm phases 05–07 are complete and locally verified.
4. Inspect `@polivo/contracts` and the empty `@polivo/domain` package stub.
5. Treat the confirmed rules in the Decision Record and the Confirmed Rules section below as the only financial source of truth for this phase.

## Confirmed Rules (Summary)

### Commission

- Charged per kilogram of net vegetable weight.
- Selling price below Rs. 200/kg: Rs. 5 commission per kg.
- Selling price Rs. 200–400/kg inclusive: Rs. 15 per kg.
- Selling price above Rs. 400/kg: Rs. 50 per kg.
- Commission is deducted from the farmer’s payment.
- The trader pays the full selling price.
- Rule changes apply to new sales only; finalized bills retain original calculations.

### Weight, money, and rounding

- Weights: up to two decimal places (for example 25.50 kg).
- Prices and money: two decimal places.
- Round each bag’s sale amount and commission to two decimal places (half up when the third decimal is 5 or more).
- Totals are the sum of those rounded amounts.
- Do not automatically round the final bill to whole rupees.

### Packaging and deductions

- Net weight = gross weight − packaging weight (packaging default zero).
- Use net weight for sale and commission calculations.
- Transport, loading, and packaging charges are separate money deductions with description and amount.

### Bill grouping and numbering

- One trader bill may contain several vegetables from several farmers.
- One farmer bill may include sales to several traders; only sales not already on another finalized farmer bill.
- Record each sale once for related trader and farmer documents.
- Track payments separately: unpaid, partially paid, or fully paid.
- Farmer bills: `F-` + digits (example sequence start F-111111).
- Trader bills: `T-` + digits (example sequence start T-444444).
- Sequences are per stall, shared across computers, assigned on finalize, never reset daily, never reused after cancel, reprints keep the original number.

### Payments

- Methods: cash, bank transfer, cheque.
- Partial payments allowed for traders and farmers.
- Default allocation: oldest unpaid bill first; permitted staff may override later (override UX out of scope here).
- Overpayment becomes customer credit.
- Farmer advances are recorded and deducted from later settlements.
- Farmer and trader balances stay separate even for the same person.

### Cheques

- Farmer cheque handed over is recorded as paid immediately (no clearance workflow, no cheque number required).
- **Trader cheque paid-immediately behavior is not confirmed** — do not implement.

### Corrections (domain invariants only)

- Draft bills may be edited directly.
- After finalization: no silent overwrite; linked correction/cancellation with reason; related balances and commission update together; keep original history.

### Permissions (capability constants only)

- Encode configurable capability identifiers for later enforcement in the stall service.
- Do not implement login, role storage, or offline permission sync in this phase.

### Public vegetable prices (calculation only)

- Daily low, high, and average from finalized non-cancelled sales.
- Use selling prices before commission.
- Average = total sale value ÷ total net kilograms sold.

### Registration and arrivals

- Policy notes only in this phase: stall desktop registration offline; basic arrival tracking concepts.
- Do not implement persistence, UI, or APIs here.

## Representation

| Concept | Representation |
| ------- | -------------- |
| Money | Integer minor units (paisa). Rs. 1.00 → `100` |
| Weight | Integer hundredths of a kilogram. 25.50 kg → `2550` |
| Rounding | Half-up to two decimal places per bag line; sum rounded lines |

Authoritative calculations must not use unrestricted floating-point arithmetic.

## 1. Decision Record and Progress

Create `docs/decisions/0003-confirmed-financial-rules.md`.

Update `docs/context/progress-tracker.md`:

- Mark this phase in progress, then completed when verified.
- Close open questions settled by these rules.
- Keep trader cheque effects, offline credential expiry, backup RTO/RPO, brand assets, and desktop chrome open.

## 2. Contracts — Financial Transport Schemas

Add schemas under `packages/contracts/src/` for:

- Money minor units (signed integer for reversals/credits where needed; non-negative variant for amounts that cannot be negative).
- Weight hundredths (non-negative integer).
- Payment method: `cash` | `bank_transfer` | `cheque`.
- Payment status: `unpaid` | `partially_paid` | `fully_paid`.
- Bill number strings matching `F-{digits}` and `T-{digits}`.

Export from the package root. Add colocated unit tests. Update `docs/operations/contracts-and-validation.md`.

Do not add full bill or payment API command schemas or sync event payloads in this phase.

Business calculations stay out of `@polivo/contracts`.

## 3. Domain Package Bootstrap

Initialize `packages/domain` as `@polivo/domain`:

- ESM with `tsc` → `dist/`.
- Root `exports`.
- Scripts: `build`, `typecheck`, `dev`.
- No React, Electron, Fastify, database, or network dependencies.
- Prefer domain-owned numeric helpers; do not create circular package designs.

Wire root `build`, `typecheck`, `dev:domain`, and a Vitest `domain` project.

Suggested modules:

- `money.ts` — half-up rounding and minor-unit helpers
- `weight.ts` — net weight
- `commission.ts` — rate bands and line commission
- `sale-line.ts` — bag sale amount, commission, trader/farmer amounts
- `totals.ts` — sum rounded lines and money deductions
- `payments.ts` — oldest-unpaid allocation, overpay credit, farmer advance apply
- `bill-numbers.ts` — format/validate F-/T- numbers
- `public-prices.ts` — low/high/average
- `permissions.ts` — capability string constants
- `cheques.ts` — farmer cheque immediate-paid policy only
- `index.ts`

## 4. Required Domain Tests

Cover at least:

- 100 kg @ Rs. 250/kg → trader 25,000.00; commission 1,500.00; farmer 23,500.00 before other deductions.
- Exactly Rs. 200/kg and Rs. 400/kg → commission Rs. 15/kg.
- Multiple bags with different weights → per-bag round then sum.
- Gross 30.50 − packaging 0.50 → net 30.00.
- Packaging/transport money deductions reduce farmer settlement.
- Oldest-unpaid allocation and overpayment credit.
- Farmer cheque recorded as paid immediately.
- Public average = total sale value ÷ total net kg from finalized non-cancelled sales.

## Scope Limits

For this phase:

- Do not create database schemas or migrations.
- Do not implement stall-service business endpoints.
- Do not implement desktop or web billing UI.
- Do not implement authentication, permission enforcement, or offline permission sync.
- Do not implement synchronization workers.
- Do not invent trader cheque paid-immediately behavior.
- Do not invent vegetable-specific commission overrides.
- Do not commit or push automatically.

## Verification

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm check`

Confirm contracts and domain unit tests pass for the cases above.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Domain and contracts financial foundations implemented.
- Representation choices and commission bands.
- ADR link.
- Verification results.
- Remaining open questions (especially trader cheques).

## Completion Report

Provide:

1. Files created or updated.
2. Confirmed rules encoded and open items left unresolved.
3. Verification results.
4. Whether later billing persistence phases can consume these helpers.
