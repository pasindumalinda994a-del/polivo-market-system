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

## Layout concept

Use a stable three-pane operational workspace under a top module bar:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Top nav: brand · modules · global search (+ shortcut hint) · utilities │
├─────────────────┬────────────────────────────────────┬───────────────────┤
│ Paid bill list  │ Active bill workspace              │ Unpaid bill list  │
│ + list search   │ title · bill no · entry · table    │ + list search     │
│                 │ payment · totals · print           │                   │
└─────────────────┴────────────────────────────────────┴───────────────────┘
```

### 1. Top navigation

- Brand mark on the left.
- Stable module destinations (examples from the wireframe: Dashboard, Seller/Buyer, Farmer, Reports, Settings). Omit non-product items such as “Example” or marketing-only “Refer & Earn” unless they become approved Polivo features.
- Centered or prominent global search with a visible keyboard shortcut hint.
- Right-side utilities: notifications, help, signed-in staff identity. Keep these secondary to billing work.

### 2. Left list — paid / settled bills

- Narrow column titled for **paid** (or otherwise settled) buyer bills.
- List search at the top for short codes or names.
- Selecting a row loads that bill into the center workspace.
- Keep the list keyboard-reachable and visually quieter than the center pane.

### 3. Center — active bill workspace

Keep the full billing task on one screen without nested dialogs for routine entry:

1. **Page title** — e.g. Buyer Bill / Farmer Bill — with a short supporting line if needed.
2. **Primary create action** — `+ Add` (or equivalent) near the title for starting a new bill or line, plus any safe secondary icon actions.
3. **Bill identity** — bill number visible and not editable as free text unless a later rule allows it.
4. **Party and line entry fields** — compact two-column grid for buyer, farmer, vegetable, quantity/weight, price, commission (or the fields required by the confirmed domain model). Prefer short-code entry with keyboard selection.
5. **Line table** — code, name, quantity, price, bags/packages, total, row actions (edit/delete). Default row height 44–48 px; numeric columns right-aligned with tabular numerals; headers stay visible while the body scrolls.
6. **Payment strip** — paid amount, explicit payment method choices (cash, cheque, online transfer, bill-to-bill, or the confirmed set), grand total, bag/package count.
7. **Print** — dedicated print action; printing must not appear to create another sale.

### 4. Right list — unpaid / open bills

- Mirror of the left list for **unpaid** (or open) bills.
- Same search and selection behavior as the paid list.
- Optional status markers on the list edge are acceptable if they are not the only way to communicate state.

## Design principles for other desktop layouts

When designing additional desktop screens, reuse this concept rather than inventing a different information architecture:

| Principle | How to apply |
| --------- | ------------ |
| Familiar density | Prefer one stable workspace over multi-step wizards for operational entry. |
| List + detail | Side lists switch records; the center pane edits the active record. |
| Paid vs unpaid split | When a workflow naturally splits settled vs open work, keep that split visible as flanking lists. |
| Top modules | Desktop billing screens should prefer top module navigation over burying primary destinations only in a left rail. |
| Keyboard first | Show shortcut hints; preserve tab order across search → fields → table → payment → print. |
| Clear primary actions | One obvious Add / Save path and one obvious Print path; secondary actions stay quieter. |
| Shared tokens | Use Polivo light surfaces, navy structure, green primary actions from `ui-context.md`. Avoid decorative gradients and glass. |
| Status honesty | Never show Connected / Saved / Synced without real supporting state. |

Screens that are not billing workspaces (simple settings, one-off dialogs) may be simpler, but should still reuse the same top-level destinations, search habit, and control styling.

## Consistency checklist (future builds)

Before marking a desktop operational screen ready for review:

- [ ] Top module nav matches approved destinations and active state is obvious.
- [ ] Global or list search is present where staff switch records frequently.
- [ ] Shortcut hint is visible for the primary search or entry path (final key map still TBD).
- [ ] Center pane keeps identity, entry, table, totals, and final actions without routine nested dialogs.
- [ ] Line table uses consistent columns, numeric alignment, and visible headers.
- [ ] Payment methods are explicit labels/checkboxes or equivalent — not color alone.
- [ ] Print is separate from finalize/save semantics.
- [ ] Flanking lists (when used) clearly separate paid/settled vs unpaid/open work.
- [ ] Labels use Polivo buyer/farmer terminology, not legacy “Seller” in product UI.
- [ ] No fabricated connection, save, or sync status.

## Relationship to the Phase 07 desktop shell

Phase 07 shipped a reusable left-rail `AppShell` for foundation work. This wireframe uses **top navigation + dual context lists + dense center workspace**.

Guidance until billing UI is implemented:

- Prefer this document for **desktop billing and similar operational workspaces**.
- Keep the Phase 07 shell available for interim/foundation screens.
- When buyer/farmer billing UI is built, reconcile chrome so staff land in this familiar 3-pane pattern. Record the chosen shell decision under `docs/decisions/` if it changes the application-wide desktop chrome.

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
