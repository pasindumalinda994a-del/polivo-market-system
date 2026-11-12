# Buyer and trader management

Phase 18 local buyer registration, search, edit, and activation for the desktop terminal through the stall-service API.

## Terminology

**Buyer** is the customer-facing name for the party that purchases vegetables from the stall. The same party is called a trader in the local `traders` table, trader bills, and `payments.receive_trader`. This phase does not create a second record type.

Farmers and buyers are separate records. A person who is both is not represented by one shared party. Adding a buyer role to an existing farmer is a future decision, not part of this phase.

## Fields

Local `traders` columns after migration `005_buyer_trader_management`:

| Field                       | Notes                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| `id`                        | Opaque service-generated id                                          |
| `short_code`                | Required; unique among buyers for the stall, including inactive rows |
| `display_name`              | Required; Unicode/Sinhala supported; duplicates allowed              |
| `contact_number`            | Optional text (preserves leading zeros)                              |
| `locality`                  | Optional                                                             |
| `is_active`                 | Eligibility for later new-transaction selection                      |
| `revision`                  | Optimistic concurrency                                               |
| `created_at` / `updated_at` | Service timestamps                                                   |

Short codes and internal ids are separate from the trader bill-number sequence (`T-` bills). Financial balances, credit limits, opening balances, and settlements are later phases.

## Code uniqueness and normalization

Buyer codes use the same **Proposed** short-code rule as farmers (not yet an accepted ADR):

- Trim surrounding whitespace; reject empty/whitespace-only.
- Store the trimmed, case-preserving value.
- Charset `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$` (1–32 characters).
- Read-only after creation.

Uniqueness is exact-match on `(stall_id, short_code)` **inside `traders` only**. A farmer may use the same code as a buyer. Inactive buyers still occupy the code.

Duplicate display names are valid. Name or phone similarity does not merge records.

## Shared-party behavior

Roles are separate tables. Buyer endpoints read and write `traders` only. A farmer id is not found on `/buyers/:id`. Editing a buyer does not change a farmer, and there is no shared contact field to keep in sync.

Deactivation keeps the id, short code, sales, trader bills, payments, and audit history. It removes the buyer from the default active list. Reactivation uses the same id and code. `ON DELETE RESTRICT` on trader foreign keys remains in place; this phase does not delete party rows.

## Capability

All `/buyers` routes require `parties.register_edit`, plus device proof, a staff session, and the bound stall.

Billing-staff default profiles include this capability. Cashier defaults do not. A cashier can manage buyers only when the effective assignment includes `parties.register_edit`.

Local owners store an empty cloud-derived capability snapshot (ADR 0009). Enforcement expands `is_local_owner` to the operational catalog, including `parties.register_edit`.

Future billing lookup may need a narrower capability than `parties.register_edit`. This phase does not add that capability. Billing commands must still check `is_active` at the service write boundary before attaching a buyer to a new sale.

## HTTP API

Root-level stall-service routes (HTTPS, authenticated):

| Method  | Path                 | Purpose                                                              |
| ------- | -------------------- | -------------------------------------------------------------------- |
| `GET`   | `/buyers`            | Search/list (`q`, `active=active\|inactive\|all`, `limit`, `cursor`) |
| `GET`   | `/buyers/:id`        | Read one buyer                                                       |
| `POST`  | `/buyers`            | Register (`Idempotency-Key` required)                                |
| `PATCH` | `/buyers/:id`        | Update details (`expectedRevision`; short code not editable)         |
| `PATCH` | `/buyers/:id/status` | Activate or deactivate (`expectedRevision`)                          |

Optional field clearing: omit leaves the value unchanged; JSON `null` clears `contactNumber` / `locality`.

Command types are `buyer.create`, `buyer.update`, and `buyer.set_status`. Idempotency scope includes the command type, so a farmer command key does not replay a buyer command.

## Search and status

- Exact short-code match ranked first, then code prefix and display-name substring.
- Stable tie-break: `short_code`, `id`.
- LIKE metacharacters in user input are escaped (literal `%` / `_`).
- SQLite `LIKE` is ASCII case-insensitive; non-ASCII (including Sinhala) follows the SQLite build’s NOCASE behavior.
- List default is **active**. Management screens can request inactive or all.
- The desktop does not load the full traders table for filtering.

## Desktop workflows

1. **Buyers** is enabled in the left nav. The label is Buyers.
2. Search, filter, open Edit, or Add Buyer.
3. Create focuses the short-code field, uses a stable idempotency key while the attempt is pending, and focuses the created row after the host confirms the commit.
4. Edit loads the current revision. On conflict, unsaved input stays on screen. Reload is explicit.
5. Host unavailable disables buyer actions. Sign-out and staff switching clear the list and form.
6. **Saved locally** is shown only after a confirmed local commit. Cloud sync status is not claimed here.

## Audit and outbox

Successful mutations write audit and outbox in the same `BEGIN IMMEDIATE` transaction as the trader row and idempotency record.

| Audit action           | Outbox `event_type`           |
| ---------------------- | ----------------------------- |
| `buyer.created`        | `polivo.buyer.created`        |
| `buyer.updated`        | `polivo.buyer.updated`        |
| `buyer.status_changed` | `polivo.buyer.status_changed` |

`target_type` is `buyer`. The payload is a snapshot of the buyer DTO plus `stallId` (`eventSchemaVersion` `"1"`). A failure in audit or outbox rolls back the trader change.

Cloud reporting `traders` columns are unchanged. Sync delivery owns later alignment of `revision`, `contact_number`, and `locality`.

## Revision conflicts and idempotent retries

- Stale `expectedRevision` returns HTTP `409 CONFLICT` and leaves the stored row unchanged.
- The same idempotency key and body returns the original result, including after the database is reopened.
- The same key with a different body returns `409 CONFLICT`.
- Competing creates for one buyer code produce one winner and one conflict.

## Acceptance

Automated coverage uses temporary migrated SQLite databases and synthetic records. It includes create/read/update/deactivate/reactivate, leading-zero contact text, explicit clearing, duplicate names, per-table code uniqueness, wrong-role and other-stall denial, `parties.register_edit` allow and deny, idempotent replay after reopen, stale revision, Sinhala and literal search, stable pagination, historical sale and trader-bill survival, and full rollback when the buyer outbox insert fails.

Operator single-PC and two-terminal checklists from the implementation guide are **not claimed passed** in this change. Physical two-terminal buyer conflict remains outstanding, as does the Phase 17 farmer two-terminal checklist.

Apply migration `005` with the explicit migrate command before restarting stall-service. The service does not auto-migrate.

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\stall.sqlite"
pnpm --filter @polivo/db-local db:migrate
```

Do not re-initialize a database that already holds stall records.
