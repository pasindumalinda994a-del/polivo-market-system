# 23 — Keyboard-First POS Billing Interface

## Objective

Build the desktop billing interface on top of the Phase 22 sales and buyer-billing service.

The interface must allow authorized staff to:

- Create and resume buyer-bill drafts.
- Select buyers, farmers, vegetables, and package types quickly.
- Enter individual bag weights using the keyboard.
- Correct draft details inline.
- Review authoritative calculations.
- Finalize a bill safely.
- Recover from connection failures without duplicate billing.
- Start the next bill efficiently.

The stall service remains authoritative for validation, calculations, numbering, and financial posting.

This phase implements the operational desktop workflow. Farmer-bill generation, finalized corrections, payments, and printing remain in their respective later phases.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 07 design system and app shells.
- Phase 16 desktop connection and session handling.
- Phase 17 farmer search.
- Phase 18 buyer/trader search.
- Phase 19 catalog and keyboard weight entry.
- Phase 20 commission preview.
- Phase 21 account readiness and balances.
- Phase 22 contracts, routes, permissions, and finalization behavior.

Inspect:

- Existing desktop routing.
- Shared UI components.
- Typed service client.
- Electron preload and IPC boundaries.
- Form-state conventions.
- Error handling.
- Existing keyboard shortcuts.
- Testing utilities.

Confirm the actual Phase 22 capabilities, including:

- `bills.create`
- `bills.edit_draft`
- `bills.finalize`

Use the repository’s existing bill-view permission.

Do not invent endpoint names or duplicate service contracts.

Mark Phase 23 as `IN_PROGRESS`.

Preserve pending operator acceptance from earlier phases. Do not treat automated tests as proof that physical operator checks passed.

---

## 2. Define the Billing Workflow

Implement this primary flow:

1. Open Billing.
2. Create a new draft or resume an existing draft.
3. Select the buyer.
4. Enter a sale line.
5. Select its farmer, vegetable, and package type.
6. Enter individual weights and price per kilogram.
7. Add further lines where supported.
8. Save all changes.
9. Review the authoritative service calculation.
10. Finalize the reviewed revision.
11. Display the issued buyer bill.
12. Start the next bill.

Follow Phase 22’s approved grouping rules.

Do not assume a bill supports multiple farmers or vegetables if the service contract does not.

Preserve the implemented financial behavior:

- Buyer amount is the full sale amount.
- Farmer entitlement is sale amount minus commission.
- Commission comes from the approved default-band engine.

Read exact rounding and deduction rules from the domain implementation.

Do not add editable commission, discounts, taxes, or other financial fields without approved support.

---

## 3. Build a Focused Billing Layout

Use the established design system.

Provide clearly separated areas for:

### Bill header

- Buyer selection.
- Business date, subject to service rules.
- Draft reference.
- Save status.
- Service connection status.

### Sale-line workspace

- Farmer.
- Vegetable.
- Package type.
- Individual weight rows.
- Bag/package count.
- Total and chargeable weight where applicable.
- Price per kilogram.
- Line amount.
- Inline edit and remove actions.

### Bill summary

- Total weight.
- Buyer total.
- Commission and farmer breakdown where authorized.
- Validation or readiness issues.
- Review and finalize actions.

### Draft navigation

- New bill.
- Resume draft.
- Accessible draft list with pagination.
- Unsaved-change indicators.

Keep the active entry area readable at the supported desktop resolution.

Use sticky summaries only if they do not hide fields or keyboard focus.

Do not build a dense dashboard around the billing task.

---

## 4. Implement Explicit UI States

Represent the workflow with clear states rather than unrelated loading flags.

Cover at least:

- No active draft.
- Loading draft.
- Editing.
- Unsaved changes.
- Saving.
- Saved.
- Previewing.
- Ready for review.
- Review stale.
- Finalizing.
- Finalization outcome unknown.
- Finalized.
- Revision conflict.
- Service unavailable.
- Session expired.
- Permission denied.

Define which actions are allowed in each state.

Ensure:

- Editing invalidates a previous review.
- A stale preview cannot enable finalization.
- Finalization locks mutation of the submitted draft.
- A timeout does not imply failure.
- A confirmed finalized record opens read-only.
- An old response cannot overwrite a newer screen state.

Scope asynchronous work to the current session, stall, draft, and request generation.

Ignore stale responses after logout, draft switching, or session changes.

---

## 5. Implement Fast Reference Selection

Reuse existing farmer, buyer, vegetable, and package search APIs.

Support:

- Search by short code.
- Search by name.
- Arrow-key navigation.
- Enter to select a highlighted result.
- Escape to close suggestions.
- Tab to move naturally.
- Visible selected code and name.

Use stable IDs internally.

Do not store only the display text as the selected reference.

For exact-code matches, make selection efficient without silently choosing among ambiguous results.

Debounce remote searches where appropriate and discard out-of-order responses.

Show clear states for:

- Searching.
- No matches.
- Service unavailable.
- Inactive selection.
- Selection no longer eligible.

An empty search result during a connection failure must not be presented as “No records found.”

Allow existing draft references to remain visible even if they became inactive. Explain why finalization is blocked when the service rejects them.

If offering “Create farmer” or “Create buyer” shortcuts:

- Require the appropriate party-management permission.
- Use the existing registration workflow.
- Preserve the billing draft.
- Restore focus after returning.
- Do not create duplicate registration logic.

---

## 6. Integrate the Existing Weight Entry Component

Reuse the Phase 19 weight component and domain utilities.

Support:

- Individual bag-weight rows.
- Stable row IDs.
- Fast row addition.
- Inline correction.
- Keyboard-accessible row removal.
- Exact package count and total.
- Clear invalid-row messages.

Use Enter within a valid weight row to advance or add the next row according to the established component behavior.

A trailing empty entry row may support fast entry, but it must not count as a package or become a persisted weight.

Do not convert an incomplete value into zero.

Do not calculate:

`sum of bag weights × bag count`

The sum already represents the total.

Preserve the established verification example:

- `32.00 + 28.50 + 19.25 = 79.75 kg`
- Change `28.50` to `30.00` → `81.25 kg`
- Remove `19.25` → `62.00 kg`

Support the project’s approved precision and maximum values.

Handle decimal entry and input-method composition without losing keystrokes.

---

## 7. Support Inline Draft Corrections

Allow staff to edit draft values directly in the billing workspace.

Do not require a popup for ordinary changes to:

- Farmer.
- Vegetable.
- Package type.
- Weight.
- Price.
- Approved draft metadata.

Use stable line and row identities so editing does not unexpectedly move focus.

Preserve partially typed input while the user is editing.

Show field errors near the relevant input.

Recalculate local previews through shared domain functions where useful, and label them as estimates until the service confirms the saved revision.

Removing a draft line must have a clear, keyboard-accessible action. Provide a lightweight undo where practical.

Do not enable inline editing for finalized records.

---

## 8. Define and Implement Keyboard Behavior

Document a consistent shortcut map.

Reuse existing shortcuts and check for conflicts with:

- Electron menus.
- Operating-system shortcuts.
- Browser behavior.
- Text editing.
- Screen readers.
- Input-method composition.

Provide keyboard actions for:

- New bill.
- Buyer search focus.
- Add line.
- Save draft.
- Review bill.
- Finalize from the review state.
- Open draft list.
- Close the current popup or panel.

Choose shortcut combinations after inspecting the application.

Do not use an ordinary Enter keypress in an input to finalize a bill.

Keyboard behavior must obey these rules:

- Enter selects a highlighted search result before advancing.
- Escape closes the nearest temporary UI first.
- Tab and Shift+Tab remain predictable.
- Shortcuts do not fire during IME composition.
- Repeated keydown events cannot trigger repeated finalization.
- Shortcuts respect permissions and current workflow state.
- Focus returns to a sensible control after closing a panel.
- Errors move focus to the first actionable invalid field when appropriate.

Include a visible shortcut-help panel.

All essential actions must also have labeled buttons.

---

## 9. Implement Reliable Draft Saving

Persist drafts through the Phase 22 service.

Provide an explicit Save action.

If adding autosave:

- Debounce edits.
- Serialize saves per draft.
- Track the revision acknowledged by the service.
- Preserve edits made while a save is in flight.
- Coalesce pending updates without dropping changes.
- Do not send several writes using the same stale revision.

Show truthful statuses:

- Unsaved.
- Saving.
- Saved to stall.
- Save failed.
- Conflict.

“Saved” means the service confirmed persistence.

Before preview or finalization:

1. Validate local input.
2. Flush pending saves.
3. Await the saved revision.
4. Request an authoritative preview for that revision.

Do not silently ignore invalid partial fields to make a save appear successful.

If the service cannot persist a partially entered field, retain it as unsaved editor state and explain what must be completed.

Protect navigation away from unsaved work.

Saved drafts must be resumable after desktop restart.

Do not add unrestricted renderer localStorage or a second local database for draft persistence.

---

## 10. Handle Concurrent Draft Editing

Use Phase 22 revision conflicts.

When another terminal changes the draft:

- Preserve the current operator’s unsaved values in memory.
- Explain that a newer saved version exists.
- Offer to reload the authoritative version.
- Allow comparison or deliberate reapplication of edits where practical.

Do not silently overwrite either version.

Do not automatically clone the draft into another sale as conflict recovery.

If another terminal finalized the draft:

- Retrieve the finalized result.
- Open it read-only.
- Disable further draft mutation.
- Explain what happened.

Use service-supported refresh or invalidation mechanisms. Avoid aggressive polling that disrupts entry or creates unnecessary LAN traffic.

---

## 11. Build the Authoritative Review Step

Display the Phase 22 preview for the latest saved draft revision.

Include:

- Buyer identity.
- Farmer attribution.
- Vegetable and package details.
- Weight and price.
- Line totals.
- Buyer total.
- Authorized commission and farmer totals.
- Business date.
- Relevant readiness errors.

A review may be an inline panel or dedicated state within the billing workspace.

Keep ordinary draft editing inline.

Show clear actions to:

- Return to editing.
- Refresh calculation.
- Finalize the reviewed bill.

Any edit after review invalidates it.

A commission-policy change or service-side stale-calculation response must require refreshed review.

Do not silently accept a changed amount.

If finalization is blocked by missing openings or configuration, provide an actionable explanation and a permission-aware navigation link where possible.

Do not automatically post opening balances or activate commission settings from the billing screen.

---

## 12. Implement Safe Finalization and Recovery

Use the Phase 22 finalization contract exactly.

Before submitting:

- Confirm the saved draft revision.
- Confirm the reviewed calculation identity.
- Establish one stable idempotency key for this attempt.
- Lock the submitted payload against editing.

Repeated clicks or shortcuts must reuse the same in-flight operation rather than create new keys.

After confirmed success:

- Display the issued bill number.
- Render the committed snapshot.
- Mark the screen finalized.
- Refresh relevant cached account and draft queries.
- Enable “New bill.”

If the request times out or the connection drops:

- Show “Checking whether the bill was finalized” or equivalent.
- Keep the draft and operation identity.
- Use the scoped operation lookup and draft-status APIs.
- Retry with the original key and payload when appropriate.
- Do not create a replacement bill automatically.

Distinguish a confirmed rejection from an unknown outcome.

For recovery across application restart, use the existing approved main-process storage pattern for minimal operation metadata, or service-side lookup by draft identity.

Persist no session secrets or unnecessary financial payloads in renderer storage.

A temporary “not found” lookup must not be treated as definitive failure while the original operation may still be running.

After session expiry, require reauthentication before resolving or displaying protected results.

---

## 13. Show the Finalized Buyer Bill

Render the service’s immutable bill response.

Show:

- Explicit buyer/trader bill type.
- Issued number.
- Buyer details.
- Business date.
- Sale lines.
- Weights and unit prices.
- Totals.
- Finalization status.

Keep bill-specific amounts separate from overall account balances.

Do not infer payment status from the account balance.

Do not show “Paid” merely because finalization succeeded.

Do not add working payment or print buttons before their supporting phases exist.

The finalized view must not contain editable financial inputs.

Starting the next bill must create a new operation identity.

Clear the previous buyer, farmers, prices, weights, and totals by default. Retain only explicitly approved convenience defaults.

Do not clear the finalized result automatically before the operator can verify it.

---

## 14. Handle Connectivity, Authentication, and Permissions

Distinguish:

- Internet unavailable while the stall service is reachable.
- Stall service unreachable.
- Invalid or expired session.
- Revoked device.
- Insufficient capability.

Internet loss alone must not disable authorized LAN billing.

When the stall service is unreachable:

- Disable authoritative saving, preview, and finalization.
- Show that unsaved edits are not stored at the stall.
- Preserve current in-memory edits while the session remains valid.
- Do not queue financial finalization for automatic execution later.

On logout or session replacement:

- Clear protected screen state and query caches.
- Cancel or invalidate pending UI requests.
- Prevent late responses from repopulating the screen.
- Retain only approved recovery metadata behind the authentication boundary.

Respect the existing production fail-closed policy.

Do not weaken device checks or session validation to make demonstrations pass.

Apply permissions to both visible actions and service requests.

---

## 15. Meet Accessibility and Performance Requirements

Ensure:

- Visible focus indicators.
- Proper field labels.
- Accessible combobox behavior.
- Keyboard-accessible validation messages.
- Predictable focus restoration.
- No keyboard traps.
- Status messages that do not announce on every keystroke.
- Meaningful labels for icon-only actions.
- Sinhala and English names display correctly.
- Monetary and weight columns remain easy to scan.

Keep input responsive while searches, saves, and previews are pending.

Avoid rerendering every weight input on unrelated state changes.

Use bounded search results and paginated draft lists.

Do not virtualize editable rows unless needed and tested for focus stability.

Measure the complete workflow using a representative bill.

The target of approximately five bill operations per minute depends on bill complexity and operator behavior. Record the scenario and timing rather than claiming performance from component render speed alone.

---

## 16. Add Automated Tests

### Component and interaction tests

Cover:

- Buyer and farmer code/name search.
- Keyboard selection.
- Empty and unavailable search states.
- Out-of-order search responses.
- Weight addition, correction, and removal.
- Exact weight examples.
- Inline price editing.
- Invalid partial input.
- Focus retention.
- IME composition.
- Shortcut scoping.
- Permission-restricted actions.

### Draft-state tests

Cover:

- Save confirmation.
- Edits during an in-flight save.
- Autosave serialization, if implemented.
- Stale-revision conflicts.
- Draft switching during requests.
- Unsaved navigation protection.
- Resuming a saved draft.
- Logout followed by a late response.
- Service disconnection during save.

### Finalization tests

Cover:

- Save → preview → review → finalize.
- Editing invalidates review.
- Policy changes invalidate reviewed calculations.
- Double click and repeated keyboard activation.
- Stable idempotency identity.
- Timeout after server commit.
- Lookup and recovery.
- Application restart recovery.
- Confirmed rejection versus unknown outcome.
- Finalization by another terminal.
- Read-only finalized display.

### End-to-end tests

Using the real local service and an isolated test database, verify:

1. Prepare required test records and openings.
2. Activate a synthetic test commission policy.
3. Complete a bill using keyboard navigation.
4. Correct a weight inline before finalization.
5. Finalize.
6. Verify the displayed bill matches the committed snapshot.
7. Verify exact ledger effects.
8. Retry or recover the operation and confirm no duplicate bill.
9. Start the next bill and confirm prior financial data is cleared.

Keep production authentication unchanged. Test-only authentication fixtures must remain isolated to test infrastructure.

---

## 17. Prepare the Operator Acceptance Checklist

Document a development or staging checklist:

1. Confirm the host service is reachable and the desktop is signed in.
2. Confirm the session has the required billing capabilities.
3. Confirm test farmer and buyer openings are `opened` or `opened_zero`.
4. Confirm active catalog records and commission policy.
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
19. Verify one issued buyer bill and the expected ledger effects.
20. Start another bill and verify fields reset correctly.
21. Repeat with mouse interaction.
22. Verify cashier or other restricted-role behavior.
23. Disconnect internet while preserving LAN access and verify permitted operation.
24. Test service interruption and uncertain-outcome recovery in a controlled test environment.
25. Test concurrent draft editing from another terminal when available.
26. Record workflow timing and focus problems.

Do not deliberately interrupt a live stall’s financial workflow.

If schema changes were genuinely necessary, back up and migrate the existing database. Do not initialize or reset it.

Record unavailable physical-terminal checks as pending.

---

## 18. Update Documentation and Report Completion

Create or update:

`docs/operations/keyboard-first-pos-billing.md`

Document:

- Normal operator workflow.
- Keyboard shortcuts.
- Inline corrections.
- Save-state meanings.
- Draft recovery.
- Revision conflicts.
- Stale calculation handling.
- Finalization recovery.
- Permission requirements.
- Connection and session errors.
- Features intentionally scheduled for later phases.

Update relevant context files and the progress tracker.

Run applicable repository scripts for:

- Formatting.
- Linting.
- Type checking.
- Component tests.
- Service integration regression tests.
- End-to-end billing tests.
- Desktop and workspace builds.

Report:

1. Screens and components implemented.
2. Existing service contracts reused.
3. Any necessary contract changes.
4. Keyboard workflow and shortcut map.
5. Draft-save and recovery behavior.
6. Finalization duplicate-prevention behavior.
7. Tests executed and results.
8. Manual checks completed or pending.
9. Measured workflow timing and limitations.
10. Readiness for Phase 24.

Do not mark operator acceptance or production readiness complete without evidence.

## Acceptance Criteria

- A normal buyer bill can be entered and finalized using the keyboard.
- Draft corrections happen inline.
- Search and weight entry remain responsive and accessible.
- Saved drafts survive application restart.
- Unsaved, saved, reviewed, and finalized states are clearly distinguished.
- Finalization uses the latest saved and reviewed service calculation.
- Repeated actions and uncertain network outcomes cannot create duplicate bills.
- Concurrent edits produce explicit conflicts.
- Finalized bills display immutable service snapshots.
- Permissions, session boundaries, and local-service security remain enforced.
- Internet loss does not block otherwise authorized LAN operation.
- Automated tests pass and pending operator checks are documented accurately.