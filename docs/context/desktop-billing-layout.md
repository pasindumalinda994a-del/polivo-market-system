# Desktop Billing Layout

This document captures the familiar Seller Bill wireframe from the older stall application so future Polivo desktop screens stay consistent for staff who already know that layout. It is a **layout inspiration and consistency guide**, not an approved financial-rules specification and not a completed UI implementation.

## Source

- Wireframe image: [`inspiration Layouts/Seller Bill Wireframr.png`](../../inspiration%20Layouts/Seller%20Bill%20Wireframr.png)
- Origin: older market stall desktop app (familiar to current users)
- Scope: desktop **billing / operational workspace** screens (buyer bills, farmer bills, and similar dense entry workflows)

Visual tokens, component library rules, and accessibility requirements remain in [`ui-context.md`](ui-context.md). Shared package wiring is in [`../operations/design-system.md`](../operations/design-system.md).

## Terminology

| Wireframe label | Polivo product language |
| --------------- | ----------------------- |
| Seller          | Buyer (also called trader in some UI copy) |
| Farmer          | Farmer |
| Seller Bill     | Buyer bill (buyer-facing sale / settlement document) |
| Vegitable Category | Vegetable (correct spelling in product UI) |
| Qantity         | Quantity / weight (confirm unit rules before implementation) |
| Check           | Cheque (confirm spelling and clearance rules before implementation) |
| Online Transfre | Online transfer |

Do not treat wireframe placeholder values (bill numbers, amounts, commission `1`, sample short codes) as approved business rules.

## Adopted chrome (ADR 0015)

Phase 23 accepted [ADR 0015](../decisions/0015-desktop-billing-chrome.md): keep the Phase 07 **left-rail `AppShell`**. Billing lives in the main pane with compact draft navigation, active bill workspace, and totals/review/finalize. Do **not** implement the wireframe’s top-module navigation or dual paid/unpaid side lists until payment workflows justify revisiting chrome.

This document remains a **content-density reference** for the bill workspace (identity, entry fields, line table, totals, keyboard-first habits).

## Historical wireframe concept (inspiration only)

The older app used a three-pane workspace under a top module bar. That pattern is **not** the Phase 23 shell:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Top nav: brand · modules · global search (+ shortcut hint) · utilities │
├─────────────────┬────────────────────────────────────┬───────────────────┤
│ Paid bill list  │ Active bill workspace              │ Unpaid bill list  │
│ + list search   │ title · bill no · entry · table    │ + list search     │
│                 │ payment · totals · print           │                   │
└─────────────────┴────────────────────────────────────┴───────────────────┘
```

### Wireframe panes (deferred or content-only)

1. **Top navigation** — Not adopted for Phase 23; modules remain in the left rail.
2. **Paid / unpaid flanking lists** — Deferred until payment workflows (Phase 26+).
3. **Center — active bill workspace** — Still the content model to follow inside `AppShell` main:

Keep the full billing task on one screen without nested dialogs for routine entry:

1. **Page title** — e.g. Buyer Bill / Farmer Bill — with a short supporting line if needed.
2. **Primary create action** — `+ Add` (or equivalent) near the title for starting a new bill or line, plus any safe secondary icon actions.
3. **Bill identity** — bill number / draft reference visible and not editable as free text unless a later rule allows it.
4. **Party and line entry fields** — compact grid for buyer, farmer, vegetable, quantity/weight, price (or the fields required by the confirmed domain model). Prefer short-code entry with keyboard selection. Prioritize space for weight entry and validation.
5. **Line table** — code, name, quantity, price, bags/packages, total, row actions (edit/delete). Default row height 44–48 px; numeric columns right-aligned with tabular numerals; headers stay visible while the body scrolls.
6. **Draft navigation** — Compact list/resume for open drafts (Phase 23). Not paid/unpaid settlement lists.
7. **Totals / review / finalize** — Authoritative service preview before finalize. Payment strip and print wait for later phases; printing must not appear to create another sale.

## Design principles for other desktop layouts

When designing additional desktop screens, reuse this concept rather than inventing a different information architecture:

| Principle | How to apply |
| --------- | ------------ |
| Familiar density | Prefer one stable workspace over multi-step wizards for operational entry. |
| List + detail | Compact draft (or record) navigation switches the active bill; the main pane edits it. |
| Paid vs unpaid split | Deferred until payment workflows; do not invent settlement lists in Phase 23. |
| Module navigation | Phase 23 uses the left-rail `AppShell` (ADR 0015). Do not require top-module chrome for billing acceptance. |
| Keyboard first | Show shortcut hints; preserve tab order across search → fields → weights → table → review → finalize. |
| Clear primary actions | One obvious Add / Save path and one obvious Print path; secondary actions stay quieter. |
| Shared tokens | Use Polivo light surfaces, navy structure, green primary actions from `ui-context.md`. Avoid decorative gradients and glass. |
| Status honesty | Never show Connected / Saved / Synced without real supporting state. |

Screens that are not billing workspaces (simple settings, one-off dialogs) may be simpler, but should still reuse the same top-level destinations, search habit, and control styling.

## Consistency checklist (Phase 23+)

Before marking a desktop operational screen ready for review:

- [ ] Left-rail destinations match approved modules and the active item is obvious (ADR 0015).
- [ ] Draft or record search is present where staff switch bills frequently; keep it compact.
- [ ] Shortcut hint is visible for the primary search or entry path.
- [ ] Main pane keeps identity, entry, weights, table, totals, and final actions without routine nested dialogs.
- [ ] Line table uses consistent columns, numeric alignment, and visible headers.
- [ ] Payment methods appear only when payment workflows exist; never imply “Paid” from finalize alone.
- [ ] Print (when added) is separate from finalize/save semantics.
- [ ] Labels use Polivo buyer/farmer terminology, not legacy “Seller” in product UI.
- [ ] No fabricated connection, save, or sync status.

## Relationship to the Phase 07 desktop shell

Resolved by [ADR 0015](../decisions/0015-desktop-billing-chrome.md): Phase 07 left-rail `AppShell` remains the application chrome. This wireframe guides **billing content density** inside the main pane. Top-module navigation and paid/unpaid dual lists are not required for Phase 23 acceptance.

## Non-goals

This document does **not**:

- Approve commission, rounding, payment allocation, cheque clearance, or bill-number rules.
- Define thermal print layout (see thermal bill notes in `ui-context.md`).
- Require implementing “Refer & Earn”, notification product behavior, or other wireframe utilities.
- Introduce dark mode.
- Replace `ui-context.md` as the canonical visual token specification.

## Related files

- Wireframe: `inspiration Layouts/Seller Bill Wireframr.png`
- Visual tokens and a11y: `docs/context/ui-context.md`
- Shared UI package: `docs/operations/design-system.md`
- Open financial questions: `docs/context/progress-tracker.md`
