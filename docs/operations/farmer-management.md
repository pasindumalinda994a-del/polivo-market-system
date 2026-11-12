# Farmer management

Phase 17 local farmer registration, search, edit, and activation for the desktop terminal through the stall-service API.

## Fields and short-code rules

Local `farmers` columns (migration `004_farmer_management`):

| Field                       | Notes                                                   |
| --------------------------- | ------------------------------------------------------- |
| `id`                        | Opaque service-generated id                             |
| `short_code`                | Required; unique per stall including inactive rows      |
| `display_name`              | Required; Unicode/Sinhala supported; duplicates allowed |
| `contact_number`            | Optional text (preserves leading zeros)                 |
| `locality`                  | Optional                                                |
| `is_active`                 | Eligibility for later operational selection             |
| `revision`                  | Optimistic concurrency                                  |
| `created_at` / `updated_at` | Service timestamps                                      |

**Proposed short-code rule** (not yet an accepted ADR):

- Trim surrounding whitespace; reject empty/whitespace-only.
- Store trimmed, case-preserving value; uniqueness is exact-match on `(stall_id, short_code)`.
- Charset `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$` (1–32 characters).
- Read-only after creation (no correction API in this phase).

## Capability

All farmer routes require `parties.register_edit` (device proof + staff session + tenant/stall binding).

Billing staff default profiles include this capability; cashier defaults do not.

Local owners store an empty cloud-derived capability snapshot by design (ADR 0009). At local enforcement and session time, `is_local_owner` expands to the full operational catalog (including `parties.register_edit`), so OWNER1 can use Farmers without seeding that capability into the snapshot.

## HTTP API

Root-level stall-service routes (HTTPS, authenticated):

| Method  | Path                  | Purpose                                                              |
| ------- | --------------------- | -------------------------------------------------------------------- |
| `GET`   | `/farmers`            | Search/list (`q`, `active=active\|inactive\|all`, `limit`, `cursor`) |
| `GET`   | `/farmers/:id`        | Read one                                                             |
| `POST`  | `/farmers`            | Create (`Idempotency-Key` required)                                  |
| `PATCH` | `/farmers/:id`        | Update details (`expectedRevision`; short code not editable)         |
| `PATCH` | `/farmers/:id/status` | Activate/deactivate (`expectedRevision`)                             |

Optional field clearing on update: omit leaves the value unchanged; JSON `null` clears `contactNumber` / `locality`.

## Search behavior

- Exact short-code match ranked first, then code prefix and display-name substring.
- Stable tie-break: `short_code`, `id`.
- LIKE metacharacters in user input are escaped (literal `%` / `_`).
- SQLite `LIKE` is ASCII case-insensitive; non-ASCII (including Sinhala) follows the SQLite build’s NOCASE behavior (typically case-sensitive for those scripts).
- Desktop management defaults the filter to **active**; staff can include inactive/all.
- Desktop debounces typing (~300 ms) and ignores stale responses.

**Billing eligibility:** list filters alone do not enforce transaction eligibility. Future billing commands must check `is_active` server-side before attaching a farmer to a new sale or bill.

## Desktop workflows

1. Enable **Farmers** in the left nav after sign-in.
2. Search, filter, open Edit, or Add Farmer.
3. Create focuses the short-code field, uses a stable idempotency key per attempt, keeps values on recoverable errors, and focuses the created row after success.
4. Edit loads the current revision. On conflict, unsaved input is preserved; staff must reload and reconcile deliberately (no silent overwrite).
5. Deactivate/reactivate preserve id and short code; historical bill FKs remain.
6. Sign-out / switch-staff clears farmer private UI state. Host unavailable disables service-dependent actions and shows Phase 16 connection state.
7. Timed-out saves should retry with the same idempotency key; show an uncertain outcome until resolved.

## Audit and outbox

Successful mutations write audit + outbox in the same `BEGIN IMMEDIATE` transaction as the farmer row and idempotency record.

| Audit action            | Outbox `event_type`            |
| ----------------------- | ------------------------------ |
| `farmer.created`        | `polivo.farmer.created`        |
| `farmer.updated`        | `polivo.farmer.updated`        |
| `farmer.status_changed` | `polivo.farmer.status_changed` |

Payload semantics: **snapshot** of the farmer DTO after the change (`eventSchemaVersion` `"1"`), plus `stallId`. Credentials and unrelated personal data are omitted.

Desktop may show **Saved locally** after commit. Synchronization progress appears only when a sync worker provides that state (later phases).

## Revision conflicts and idempotent retries

- Stale `expectedRevision` → HTTP `409 CONFLICT`; stored newer revision is preserved.
- Same idempotency key + same body → original result.
- Same key + different body → `409 CONFLICT`.
- Competing creates with the same code → one winner and one conflict.

## Remaining decisions and acceptance

- Party short-code rule remains **Proposed** until product confirms an ADR.
- Physical two-terminal acceptance checklist (guide §11), including internet-off LAN while host remains reachable, is **operator-run** and not claimed passed by automated suites.
- Cloud reporting `farmers` columns are unchanged in this phase; sync delivery owns later alignment.
- Buyer/trader management is [buyer-trader-management.md](buyer-trader-management.md).
