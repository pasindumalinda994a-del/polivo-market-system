# 19 — Vegetables, Packages, and Weight Entry

## Goal

Implement vegetable and package-type management through the authenticated stall-service API.

Build a reusable keyboard-friendly weight-entry component that captures individual bag or box weights and calculates exact totals using the approved domain rules.

Authorized staff can maintain the catalog and verify package-weight entry before the billing workflow is implemented.

## 1. Inspect the Existing Implementation

1. Read `AGENTS.md`, the six context files, and accepted business decisions.
2. Read `docs/context/progress-tracker.md`.
3. Inspect the existing vegetable, category, package, and sale-line schema.
4. Review phase 08’s weight representation, precision, limits, and deduction rules.
5. Inspect phases 17–18 for management forms, search, authenticated routes, IPC, revisions, and audit/outbox behavior.
6. Mark phase 19 as in progress.

Reuse established domain functions and database representations.

Apply forward migrations only where the current schema lacks required fields or constraints. Preserve existing data and applied migration checksums.

Keep unresolved production offline policies fail-closed. Automated verification may use explicitly labeled test policies.

## 2. Confirm Weight Semantics

Before implementing production calculations, identify the recorded decisions for:

- Entered weight unit.
- Accepted decimal precision.
- Maximum weight per package and per entry.
- Whether entered weight means gross or net weight.
- Whether packaging deductions apply.
- Whether deductions are entered per package or calculated through an approved rule.
- Rounding and excess-precision handling.

Use the existing approved decisions.

If a rule remains unresolved, record its specific effect and continue independent catalog work. Keep the affected production calculation unavailable until its meaning is confirmed.

Do not silently interpret an unresolved deduction as zero or apply a conventional bag weight.

## 3. Define Vegetable and Package Records

Use the existing schema and naming conventions.

### Vegetables

Support these fields where required by the approved model:

| Field | Behavior |
| --- | --- |
| Internal ID | Stable service-generated identity. |
| Short code | Required under the existing catalog-code rules. |
| Display name | Required, supporting Sinhala and English. |
| Category | Reference to the approved category model, if applicable. |
| Active status | Controls availability for new selections. |
| Revision | Supports concurrent-edit detection. |
| Created/updated metadata | Assigned by the service. |

Reuse existing category records. If category maintenance is required, implement a minimal code/name/status workflow with the same integrity rules.

Keep category classification separate from commission calculation. The current release uses default commission bands.

### Package Types

Represent package types such as bags or boxes using:

- Stable internal ID.
- Code or identifier consistent with existing conventions.
- Display label.
- Active status.
- Revision and timestamps.

A package type describes the container. Individual packages can have different weights.

Add default tare fields only when the approved requirements explicitly define them. Any applied deduction must remain explicit in the captured entry.

Preserve historical references when catalog records are deactivated.

## 4. Add Shared Contracts

Extend `packages/contracts` for:

- Vegetable creation, detail updates, and status changes.
- Vegetable lookup and paginated search.
- Required category operations.
- Package-type creation, updates, and status changes.
- Package-type lookup.
- Structured package-weight input.
- Validated weight-summary output.

Use expected revisions and the established idempotency convention for persisted mutations.

Weight input must preserve the exact decimal representation from phase 08.

Each package row should have:

- A stable row key within the entry.
- A package-type reference where required.
- Its entered weight.
- Explicit deduction information only where approved.

Keep transient editing text separate from validated transport values. An empty field or partially typed decimal is an incomplete draft, not a valid zero weight.

Apply bounded field lengths, search limits, and row counts. Document technical bounds without presenting them as client-approved market capacity.

## 5. Implement Catalog Repositories and Commands

Add tenant-scoped operations for creating, reading, searching, updating, deactivating, and reactivating vegetables and package types.

Use phase 10’s transaction executor.

Each mutation must atomically persist:

- Catalog changes.
- Revision advancement.
- Audit records.
- Validated outbox events.
- Idempotency result.

Enforce uniqueness using database constraints and the established normalization rules.

Handle concurrent duplicate codes and stale revisions with clear conflicts.

If deactivating a category affects vegetable selection, document and enforce the chosen approved behavior. Avoid silently changing every child record.

Referenced catalog records must remain available for historical lookup.

## 6. Expose Authenticated Service Operations

Follow the current API prefix and route conventions.

Provide operations equivalent to:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/vegetables` | Search and list vegetables. |
| GET | `/vegetables/:id` | Read one vegetable. |
| POST | `/vegetables` | Create a vegetable. |
| PATCH | `/vegetables/:id` | Update editable details. |
| PATCH | `/vegetables/:id/status` | Change active status. |
| GET | `/package-types` | List or search package types. |
| POST | `/package-types` | Create a package type. |
| PATCH | `/package-types/:id` | Update package details. |
| PATCH | `/package-types/:id/status` | Change active status. |

Add category routes only when needed by the implemented model.

Reuse existing catalog capabilities. If a required capability is missing, add it consistently to contracts, owner configuration, local validation, and tests.

Keep operational lookup access distinct from catalog-edit permission where the existing capability model supports that distinction.

Derive tenant, actor, and device from the verified context. Enforce access in Fastify even when the desktop hides unavailable controls.

## 7. Implement Exact Weight Calculations

Reuse or extend pure functions in `packages/domain`.

Support:

- Parsing an approved weight representation.
- Validating each completed package row.
- Summing individually entered weights.
- Counting completed package rows.
- Applying approved explicit deductions.
- Returning totals with units and validation results.

Requirements:

- Preserve exact arithmetic through input, calculation, and serialization.
- Reject unsupported precision and out-of-range values.
- Reject duplicate row keys.
- Reject negative weights and invalid deductions.
- Apply the approved zero-weight rule.
- Check aggregate limits as well as individual limits.
- Calculate from the current row values rather than incrementally accumulating rounded deltas.

For individually weighed packages, package count is derived from completed rows. The summed weight must not be multiplied by that count again.

If a separate “multiple identical packages” mode is already approved, represent it explicitly and test it independently. Otherwise, implement individual-weight entry.

Return an incomplete/error state while any required row is invalid. A subtotal may be displayed as a clearly labeled preview, but completion must remain unavailable.

## 8. Build the Keyboard Weight-Entry Component

Create a reusable component in the appropriate shared or desktop UI location.

Keep business calculations in the domain package and application persistence in the service layer.

Provide:

- Package-type selection.
- One editable weight field per row.
- Add/remove row actions.
- Inline row validation.
- Visible package count.
- Exact total weight with its unit.
- Approved deduction and net-weight displays where applicable.
- A completion callback that emits validated structured values.

### Keyboard Behavior

- Enter on a valid weight row advances to the next row or adds one.
- Enter on an invalid row keeps focus there and exposes the error.
- Tab and Shift+Tab follow the visible form order.
- Arrow keys retain expected input behavior.
- Removing a row moves focus to a predictable neighboring control.
- Input-method composition for Sinhala must not accidentally submit a row.
- Row identity remains stable after insertion or removal.

Keep shortcut handling within this component.

Editing `32.00` to `31.50` must immediately recalculate the preview. Adding or removing rows must keep focus and totals consistent.

## 9. Provide a Usable Weight-Entry Preview

Add a clearly labeled local weight-entry preview within the authorized desktop catalog area.

Let staff select an active vegetable and package type, enter several weights, edit them, and inspect the total.

The preview exercises the reusable component and domain rules. Its completion action should say `Validate entry` or equivalent.

Keep preview values in the current staff’s in-memory screen state. Clear them on sign-out, staff switching, or stall changes.

Persisting operational package weights belongs to the later sale or arrival command that owns them. Avoid creating unattached weight records or displaying a save confirmation for a preview.

## 10. Build Catalog Management Screens

Use the existing Farmers and Buyers screen patterns.

Provide:

- Vegetable search by code and name.
- Active/inactive filtering.
- Category filtering where supported.
- Add and edit forms.
- Deactivate/reactivate actions.
- A compact package-type management view.
- Inline validation and revision-conflict handling.

Use actual committed service results to update the interface.

Preserve entered form values on recoverable errors. Resolve uncertain saves using the original idempotency key.

Keep the Electron main-process client and preload methods narrow and typed. Clear stale responses and private screen state when the authenticated context changes.

Deactivated vegetables and package types should disappear from default new-entry selections while remaining accessible through management filters.

## 11. Prepare the Billing Integration Boundary

Document the structured weight result that phases 22–23 will consume.

The future billing command must:

- Verify all referenced vegetables and package types belong to the stall.
- Verify eligibility for a new transaction.
- Revalidate package rows.
- Recalculate totals on the service.
- Persist the original package weights and approved calculation snapshot atomically with the sale.

The desktop preview is advisory until the owning service command commits.

Historical package weights and applied deductions must remain reconstructable even after catalog labels or defaults change.

Keep price entry, commission calculation, stock movements, and bill finalization in their assigned feature work.

## 12. Add Audit and Outbox Events

Follow the conventions established for farmer and buyer management.

Define concrete event schemas for catalog creation, updates, and status changes.

Include:

- Stable event ID.
- Tenant and source record ID.
- Source revision.
- Event schema version.
- Timestamp.
- Permitted actor/device metadata.
- Fields needed to reproduce the change.

Commit events with their corresponding catalog mutations.

Weight-preview edits are transient UI activity and do not produce operational outbox events.

## 13. Test the Implemented Behavior

### Domain Tests

Use independently calculated expected results.

Cover:

- Unequal package weights.
- Exact summation.
- Editing, adding, and removing rows.
- Empty and partially typed input.
- Negative, zero, excessive, and excess-precision values under the approved rules.
- Aggregate overflow or range limits.
- Duplicate row keys.
- Approved deductions and invalid deductions.
- Serialization round trips.
- Package count not multiplying an already summed weight.

A synthetic example without deductions is:

- Package 1 — 32.00 kg
- Package 2 — 28.50 kg
- Package 3 — 19.25 kg
- Count — 3
- Total — 79.75 kg

Use this fixture only where its precision is supported. It does not establish a production deduction policy.

### Service Tests

Verify:

- Catalog CRUD and status behavior.
- Cross-tenant reference rejection.
- Capability enforcement.
- Duplicate-code races.
- Stale-revision conflicts.
- Idempotent replay.
- Audit/outbox rollback.
- Preservation of historical foreign-key references.
- Active/inactive lookup behavior.

### Desktop Tests

Verify:

- Keyboard-only package entry.
- Focus after row insertion and removal.
- Inline errors and blocked completion.
- Sinhala input composition.
- Correct totals after edits.
- Clearing state on sign-out.
- Handling host loss during catalog mutations.
- Existing farmer and buyer workflows.

## 14. Perform the Operator Acceptance Check

On the existing development host, apply pending migrations using the established migration command, then restart the service.

Use the existing database containing the stall setup and test parties.

1. Sign in with catalog-management permission.
2. Create a test vegetable using a valid short code.
3. Create a test package type if one is needed.
4. Find both by their supported lookup fields.
5. Edit a label and verify it persists.
6. Test duplicate-code rejection.
7. Deactivate and reactivate the records.
8. Open the weight-entry preview.
9. Enter the three synthetic weights above if supported.
10. Verify the count and exact total.
11. Change 28.50 kg to 30.00 kg and verify 81.25 kg.
12. Remove the 19.25 kg row and verify 62.00 kg across two packages.
13. Enter invalid input and verify completion is blocked.
14. Switch staff and verify the preview clears.
15. Confirm a staff member without catalog-management permission cannot change catalog data.

Record any physical two-terminal verification separately.

## 15. Document and Complete the Phase

Create `docs/operations/vegetables-packages-and-weight-entry.md`.

Document:

- Catalog fields and code rules.
- Required capabilities.
- Weight units, precision, and accepted bounds.
- Gross/net meaning and approved deduction behavior.
- Keyboard interactions.
- Preview lifecycle.
- The contract for later operational persistence.
- Acceptance results and unresolved decisions.

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e:desktop`
- `pnpm check`

Run web or cloud tests when their contracts or implementation changed.

Update `docs/context/progress-tracker.md` with completed features, migrations, weight-policy decisions, checks performed, and remaining blockers.

## Completion Report

Provide:

1. Vegetable and package operations available.
2. Weight-entry behavior and exact calculation rules.
3. Schema and capability changes.
4. Automated and operator verification results.
5. Unresolved rules affecting production use.
6. Readiness for `20-configurable-commission-engine.md`.