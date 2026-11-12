# Vegetables, packages, and weight entry

Phase 19 vegetable and package-type catalog management, keyboard weight-entry, and a local desktop preview through the stall-service API.

## Fields and code rules

Local migration `006_vegetables_packages_and_weight_entry`:

| Record          | Fields                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `vegetables`    | Existing `id`, `stall_id`, `short_code`, `display_name`, `is_active`, timestamps; added `revision`. Categories remain deferred (ADR 0004). |
| `package_types` | `id`, `stall_id`, `short_code`, `display_name`, `is_active`, `revision`, timestamps. No default tare columns.                              |

**Short-code rule** (same Proposed party charset as Phases 17–18):

- Trim surrounding whitespace; reject empty/whitespace-only.
- Store trimmed, case-preserving value; uniqueness is exact-match on `(stall_id, short_code)` within each catalog table, including inactive.
- Charset `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$` (1–32 characters).
- Read-only after creation.

Vegetable codes and package-type codes do not collide across tables (separate uniqueness scopes).

## Capability

All `/vegetables` and `/package-types` routes require **`catalog.manage`** (device proof + staff session + tenant/stall binding).

- Farmers/Buyers continue to use `parties.register_edit` only.
- Billing-staff default profiles include `catalog.manage`.
- Cashier defaults do **not** include `catalog.manage`.
- Local owners store an empty cloud-derived capability snapshot (ADR 0009). Enforcement expands `is_local_owner` to the full operational catalog, including `catalog.manage`.

### OWNER1 after upgrading to Phase 19

Do not wipe or reinitialize the stall database.

1. Apply migration `006` with the established migrate path (`pnpm --filter @polivo/db-local db:migrate` / service open against the existing DB).
2. Restart stall-service with the new build.
3. In desktop: **Sign out**, then **Sign in** as `OWNER1`.
4. Confirm session capabilities include `catalog.manage`, then open Catalog and create a test vegetable/package type.

### Billing staff with an existing frozen snapshot

1. Update the cloud membership/permission profile so it includes `catalog.manage`.
2. Owner authorizes a trusted refresh: `POST /api/tenants/{tenantId}/local-staff/permission-refresh`.
3. On the host: `pnpm --filter @polivo/stall-service staff-cli refresh-permissions <staffId>` and paste the one-time secret (or set `POLIVO_LOCAL_STAFF_REFRESH_SECRET`).
4. That staff must **sign out and sign in** again so the desktop session picks up the refreshed capabilities.

Do not use argv-only capability edits as production refresh authority. See [local-staff-authentication-and-offline-access.md](local-staff-authentication-and-offline-access.md).

## Weight units, precision, and bounds

Approved by ADR [0003](../decisions/0003-confirmed-financial-rules.md):

| Rule                       | Value                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Unit                       | Kilogram                                                                              |
| Storage / transport        | Integer hundredths-kg (`25.50` → `2550`)                                              |
| Precision                  | At most two decimal places                                                            |
| Entered package weight     | Gross weight                                                                          |
| Packaging / net            | Net = gross − packaging; packaging defaults to **0** when omitted                     |
| Package-type tare defaults | Not used in this release                                                              |
| Zero weight                | Empty/partial draft text is incomplete, not zero; explicit `0` / `0.00` is valid zero |
| Counting                   | Package count = completed rows; do not multiply the summed weight by the count        |

Technical bounds (not market capacity claims): max 200 package rows per entry; sums must stay within safe integer hundredths.

## Keyboard interactions

Reusable desktop `WeightEntry` component:

- Enter on a valid weight advances to the next row or adds one.
- Enter on an invalid row keeps focus and shows the error.
- Tab / Shift+Tab follow visible order; arrow keys keep input behavior.
- Sinhala IME composition does not accidentally submit a row.
- Removing a row focuses a neighboring control; row keys stay stable.
- Trailing empty draft rows created by Enter-to-add are ignored for completion.

## Preview lifecycle

The Catalog screen includes a clearly labeled **Weight entry preview**:

- Staff pick an active vegetable and package type, enter weights, and press **Validate entry**.
- Values stay in the current staff’s in-memory screen state.
- Cleared on sign-out, staff switch, or stall/session change (`staffKey`).
- No operational package-weight rows are persisted; no save confirmation toast; no outbox events.

## Billing integration boundary (phases 22–23)

Future sale/arrival commands must:

- Verify referenced vegetables and package types belong to the stall and are eligible for a new transaction.
- Revalidate package rows and recalculate totals on the service.
- Persist original package weights and an approved calculation snapshot atomically with the sale.
- Keep historical weights reconstructable after catalog label changes.

Price entry, commission calculation, stock movements, and bill finalization remain in their assigned phases.

## HTTP API

| Method  | Path                        | Purpose                             |
| ------- | --------------------------- | ----------------------------------- |
| `GET`   | `/vegetables`               | Search/list                         |
| `GET`   | `/vegetables/:id`           | Read one (including inactive)       |
| `POST`  | `/vegetables`               | Create (`Idempotency-Key` required) |
| `PATCH` | `/vegetables/:id`           | Update display name                 |
| `PATCH` | `/vegetables/:id/status`    | Activate/deactivate                 |
| `GET`   | `/package-types`            | Search/list                         |
| `POST`  | `/package-types`            | Create                              |
| `PATCH` | `/package-types/:id`        | Update display name                 |
| `PATCH` | `/package-types/:id/status` | Activate/deactivate                 |

## Audit and outbox

| Action                        | Event type                           |
| ----------------------------- | ------------------------------------ |
| `vegetable.created`           | `polivo.vegetable.created`           |
| `vegetable.updated`           | `polivo.vegetable.updated`           |
| `vegetable.status_changed`    | `polivo.vegetable.status_changed`    |
| `package_type.created`        | `polivo.package_type.created`        |
| `package_type.updated`        | `polivo.package_type.updated`        |
| `package_type.status_changed` | `polivo.package_type.status_changed` |

Snapshot payloads include the full record after the mutation plus `stallId`. Schema version `"1"`.

## Remaining decisions and acceptance

- Categories remain deferred under ADR 0004.
- Party/catalog short-code Proposed rule is not yet an accepted ADR.
- Operator acceptance checklist in `19-vegetables-packages-and-weight-entry.md` §14 (including physical two-terminal checks) is operator-run and recorded in the progress tracker when completed.
