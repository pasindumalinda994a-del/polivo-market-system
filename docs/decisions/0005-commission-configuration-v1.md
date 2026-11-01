# 0005 — Commission Configuration (v1)

- Status: Accepted
- Date: 2026-11-01

## Context and source

Phase 08 confirmed default commission bands in [0003](0003-confirmed-financial-rules.md). An open question remained whether vegetable- or category-specific overrides would exist. Owner confirmation ahead of phase 09 closes that for v1 and states how band changes interact with finalized sales.

## Decision

Use default commission bands for each stall only:

- Below Rs. 200/kg: Rs. 5 per net kg.
- Rs. 200–400/kg inclusive: Rs. 15 per net kg.
- Above Rs. 400/kg: Rs. 50 per net kg.

Additional v1 rules:

- Apply the same bands to all vegetables and categories within the stall.
- Do not create vegetable-specific or category-specific override tables in v1.
- Do not allow individual sale commission overrides in v1.
- The stall owner, or staff given permission, can update the stall’s default bands.
- Updated bands apply to new sales only.
- Store the applied commission rate and amount with each finalized sale so later band changes do not alter old bills.

## Reasoning

A single stall-level band table matches the confirmed business rules and keeps the first schema small. Snapshotting applied rate and amount on finalize preserves historical bill integrity when owners change bands later.

## Consequences

- Phase 09 may include a stall-scoped default commission-bands table and sale columns for applied rate/amount.
- Domain and stall-service code must not invent per-vegetable or per-line commission overrides in v1.
- Permission to change bands is a later enforcement concern; capability identifiers already exist in `@polivo/domain`.

## Related implementation phases

- Phase 08 — Business domain and financial rules
- Phase 09 — Local SQLite schema and migrations
- Later phases — Stall-service finalization and permission enforcement
