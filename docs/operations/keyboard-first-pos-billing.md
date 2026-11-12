# Keyboard-First POS Billing

Phase 23 desktop billing UI for buyer/trader bills. The stall service remains authoritative for validation, calculations, numbering, and ledger posting. Chrome follows [ADR 0015](../decisions/0015-desktop-billing-chrome.md): left-rail `AppShell`, billing content in the main pane.

## Normal operator workflow

1. Sign in with a session that includes `bills.create`, `bills.edit_draft`, and/or `bills.finalize`.
2. Open **Billing** (default signed-in destination).
3. **New bill** (or resume a draft from the compact draft list).
4. Select the **buyer** (short code or name).
5. Enter sale line: farmer, vegetable, package type, individual bag weights, price per kg.
6. Add further lines as needed (max 100).
7. **Save draft** — persists at the stall; balances unchanged.
8. **Review** — authoritative preview + calculation fingerprint.
9. **Finalize** — issues `T-{n}` trader bill and posts ledgers once.
10. Verify the immutable bill view, then **New bill** (clears prior entry; new operation identity).

Create requires a buyer id (`POST /sales/drafts`). The UI creates the stall draft on first successful save after a buyer is selected.

## Keyboard shortcuts

| Chord      | Action                            |
| ---------- | --------------------------------- |
| Ctrl+N     | New bill                          |
| Ctrl+B     | Focus buyer search                |
| Ctrl+L     | Add sale line                     |
| Ctrl+S     | Save draft                        |
| Ctrl+R     | Review bill                       |
| Ctrl+Enter | Finalize (only from ready review) |
| Ctrl+D     | Focus draft list                  |
| Ctrl+/     | Toggle shortcut help              |
| Esc        | Close help / suggestions first    |

Enter in search selects a highlighted result before advancing. Enter in a weight row advances or adds a package row. Enter never finalizes. Shortcuts are ignored during IME composition. Essential actions also have labeled buttons.

## Inline corrections

Edit farmer, vegetable, package type, weights, price, and business date directly in the workspace. Removing a line offers a lightweight **Undo remove line**. Finalized bills are read-only.

## Save-state meanings

| Status                                          | Meaning                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| Unsaved                                         | Local edits not confirmed by the service                 |
| Saving…                                         | Write in flight                                          |
| Saved to stall                                  | Service confirmed the revision                           |
| Previewing…                                     | Authoritative preview requested                          |
| Checking whether the bill was finalized         | Uncertain finalize outcome — not a confirmed failure     |
| Conflict                                        | Newer revision elsewhere; reload or keep in-memory edits |
| Service unavailable — edits not stored at stall | Host unreachable; no queue for later finalize            |

“Saved” always means stall confirmation. No renderer `localStorage` draft database.

## Draft recovery

Saved drafts survive desktop restart via `GET /sales/drafts` / `getDraft`. Unsaved in-memory work does not. Navigation away from dirty editors prompts confirmation.

## Revision conflicts

On `CONFLICT`, unsaved values stay in memory. Reload the authoritative draft or keep editing intentionally. Do not auto-clone into another sale. If another terminal finalized the draft, the UI opens the issued bill read-only.

## Stale calculation handling

Any edit after review invalidates finalize. Preview again for the latest saved revision. Fingerprint mismatches require a refreshed review; amounts are never silently accepted.

## Finalization recovery

Before finalize, the UI stores minimal main-process recovery metadata (sale id, idempotency key, revision, fingerprint, startedAt) under userData — no session secrets or full financial payloads. Repeated clicks reuse the same in-flight key.

- **Ambiguous outcomes** (timeout / network / unreachable / idempotency key already in use / possible already-finalized race): keep recovery and poll `lookupFinalization` plus draft/bill status. Temporary lookup misses are not definitive failure.
- **Definite completed failures** (e.g. farmer/buyer account not opened, stale calculation fingerprint, other pre-commit validation): clear recovery immediately, show the server message, and return to review so Finalize can be retried after the operator fixes the condition.

If an older build left a sticky `billing-recovery/finalize-in-flight.json`, quit desktop and remove that file once before retrying.

## Permission requirements

| Capability                                                    | UI                                      |
| ------------------------------------------------------------- | --------------------------------------- |
| Any of `bills.create` / `bills.edit_draft` / `bills.finalize` | Open Billing / list drafts / view bills |
| `bills.create`                                                | New bill / create draft                 |
| `bills.edit_draft`                                            | Save, preview, edit                     |
| `bills.finalize`                                              | Finalize / recovery lookup              |

Cashier without create/edit can still be denied the workspace when no bill capability is present. Create-party shortcuts from billing are not offered in Phase 23.

## Connection and session errors

- Internet down while LAN host reachable: billing continues.
- Stall unreachable: disable save/preview/finalize; keep in-memory edits; do not queue finalize.
- Session expired / staff switch: clear protected screen state and ignore late responses.
- Production remains fail-closed for device/session checks.

## Deferred to later phases

- Corrections (25), payments / paid-unpaid lists (26), print/reprint, create-party shortcuts from billing, top-module chrome rewrite, autosave.

## Operator acceptance checklist

1. Confirm host reachable and desktop signed in.
2. Confirm session has required billing capabilities.
3. Confirm test farmer and buyer openings are `opened` or `opened_zero`.
4. Confirm active catalog and commission policy.
5. Open Billing.
6. Select a buyer using only the keyboard.
7. Select farmer, vegetable, and package type.
8. Enter `32.00`, `28.50`, and `19.25`.
9. Verify `79.75 kg`.
10. Change `28.50` to `30.00` inline.
11. Verify `81.25 kg`.
12. Remove the `19.25` row.
13. Verify `62.00 kg`.
14. Enter an approved test price.
15. Save and verify balances remain unchanged.
16. Navigate away and resume the saved draft.
17. Review and independently check the financial calculation.
18. Finalize using the keyboard.
19. Verify one issued buyer bill and expected ledger effects.
20. Start another bill and verify fields reset.
21. Repeat with mouse interaction.
22. Verify cashier or other restricted-role behavior.
23. Disconnect internet while preserving LAN access and verify permitted operation.
24. Test service interruption and uncertain-outcome recovery in a controlled test environment.
25. Test concurrent draft editing from another terminal when available.
26. Record workflow timing and focus problems.

Do not interrupt a live stall’s financial workflow for recovery drills. Record unavailable physical-terminal checks as pending.

## Related

- Implementation: [`../implementation/23-keyboard-first-pos-billing-interface.md`](../implementation/23-keyboard-first-pos-billing-interface.md)
- Service API: [`sales-and-buyer-billing.md`](sales-and-buyer-billing.md)
- Chrome: [ADR 0015](../decisions/0015-desktop-billing-chrome.md)
