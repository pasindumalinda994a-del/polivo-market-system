# 0015 — Desktop Billing Chrome

- Status: Accepted
- Date: 2026-11-10

## Context and source

Phase 07 shipped a left-rail `AppShell` for the desktop foundation. [`desktop-billing-layout.md`](../context/desktop-billing-layout.md) documented the familiar older-app wireframe (top module nav + paid/unpaid flanking lists + dense center workspace) as layout inspiration. Progress tracker left an open question: reconcile application-wide chrome when billing UI is built.

Phase 23 (`23-keyboard-first-pos-billing-interface.md`) requires a focused billing workspace with draft navigation, weight entry, and finalize actions. Payments and print remain later phases, so paid/unpaid lists are not yet operationally meaningful.

## Decision

1. **Application chrome:** Keep the Phase 07 left-rail `AppShell` as the desktop shell for Phase 23 and subsequent operational screens unless a later ADR revises it.

2. **Billing placement:** Enable **Billing** in the existing sidebar. Put compact draft navigation, the active bill workspace (header, line entry, weights, line table), and totals/review/finalize summary inside the main pane.

3. **Wireframe use:** Use `desktop-billing-layout.md` as a **content-density reference** only (identity strip, entry fields, line table, totals, keyboard-first habits). Do **not** introduce its top-module navigation or dual paid/unpaid side lists in Phase 23.

4. **Deferred chrome:** Paid/unpaid flanking lists and payment strips wait for payment workflows (Phase 26+). Revisit chrome only if those workflows prove the left rail insufficient; record any change under `docs/decisions/`.

5. **Space priority:** Prefer weight entry, keyboard navigation, and validation clarity over decorative chrome. Keep draft navigation compact so it does not crowd the billing workspace.

## Consequences

- Phase 23 implements billing inside `AppShell` without a shell rewrite.
- Sidebar destinations remain the primary module navigation (Billing, Farmers, Buyers, Catalog, Settings).
- Inspiration wireframe checklist items that require top nav or paid/unpaid lists are not acceptance criteria for Phase 23.
- Staff who know the older 3-pane layout may need brief orientation; content density and keyboard habits still follow the wireframe reference where they do not conflict with this decision.

## Related

- [`../context/desktop-billing-layout.md`](../context/desktop-billing-layout.md)
- [`../context/ui-context.md`](../context/ui-context.md)
- [`../implementation/23-keyboard-first-pos-billing-interface.md`](../implementation/23-keyboard-first-pos-billing-interface.md)
- [`../implementation/07-brand-design-system-and-app-shells.md`](../implementation/07-brand-design-system-and-app-shells.md)
