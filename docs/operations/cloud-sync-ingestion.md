# Cloud Sync Ingestion

Phase 31 host-to-cloud ingestion for committed operational events. Local SQLite remains authoritative. The Phase 32 outbox sender is documented in [local-outbox-sync-worker.md](./local-outbox-sync-worker.md).

Decision record: [ADR 0021](../decisions/0021-cloud-sync-ingestion.md).

## Endpoint and protocol

- **Method / path:** `POST /api/sync/ingest` (`apps/web`)
- **Protocol version:** `SYNC_PROTOCOL_VERSION` = `"1"`
- **Auth:** Clerk-exempt machine route. Activated **host** Ed25519 possession over `polivo-ingest-v1` bound to tenant, device, installation, credential version, batch id, body SHA-256, and signed-at.
- **Headers:**
  - `x-polivo-tenant-id`
  - `x-polivo-device-id`
  - `x-polivo-installation-id`
  - `x-polivo-credential-version`
  - `x-polivo-batch-id`
  - `x-polivo-signed-at`
  - `x-polivo-body-sha256`
  - `x-polivo-signature`
- **Body:** versioned batch with ordered complete `transactionGroupId` groups (see `@polivo/contracts` sync ingest schemas).
- **Response:** structured acknowledgements with `committedCursor`, `nextExpectedSequence`, and per-group outcomes. HTTP 200 does **not** mean every group was applied — inspect `allGroupsAccepted` and `groupOutcomes`.

## Authority boundaries

| Authority            | Owns                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local host           | Operational catalog/parties (approved scope), sales/bills, commission snapshots, ledger postings, payments/allocations, corrections, approved operational records |
| Cloud                | Tenant/membership admin, device enrollment/revocation, later config delivery                                                                                      |
| Cloud reporting copy | Accepted local facts + read-only projections                                                                                                                      |

Ingestion must not overwrite cloud access settings. Browser clients cannot insert replicated financial rows.

## Stream and generation identity

- `sourceStreamId` = host `installation_id`
- `streamGeneration` starts at `1`; advances only via explicit restore/re-enrollment (never automatic on restart/conflict)
- Today `stallId` must equal `tenantId` (host activate binding)
- Replacement hosts use a new installation/stream or an explicitly authorized generation

## Transaction grouping and ordering

- Groups are complete (`complete: true`) with shared `transactionGroupId`
- Apply groups in order; each group atomically; stop at first failure; return committed contiguous prefix
- Expected-next sequence is contiguous integers (`committed_cursor + 1`)

## Event compatibility matrix (summary)

| Event type                                                    | Apply version | Cloud destination                                    | Notes                                 |
| ------------------------------------------------------------- | ------------- | ---------------------------------------------------- | ------------------------------------- |
| `polivo.farmer.*`                                             | `1`           | `farmers`                                            | Snapshot upsert by revision           |
| `polivo.buyer.*`                                              | `1`           | `traders`                                            | Snapshot upsert                       |
| `polivo.vegetable.*`                                          | `1`           | `vegetables`                                         | Snapshot upsert                       |
| `polivo.package_type.*`                                       | `1`           | `package_types`                                      | Snapshot upsert                       |
| `polivo.commission_policy.activated`                          | `1`           | `commission_*`                                       | Bands + active pointer                |
| `polivo.opening_balance.posted/.corrected`                    | `1` or `2`    | `party_accounts` + ledger                            | v2 preferred for ledger copy          |
| `polivo.sale.finalized` / `polivo.trader_bill.issued`         | `2`           | sales/lines/packages/allocations/trader_bills/ledger | Local outbox **v1 blocked**           |
| `polivo.farmer_bill.issued`                                   | `2`           | farmer_bills + lines                                 | Local outbox v1 blocked               |
| `polivo.payment.posted` / `.allocation_created` / `.reversed` | `2`           | payments + allocations + ledger                      | Local thin v1 blocked for apply       |
| `polivo.sale.reversed` / `.corrected`                         | `2`           | sales + correction ops + ledger                      | Local v1 blocked                      |
| `polivo.print_job.*` / `print_attempt.*`                      | `1`           | print_jobs / print_attempts                          | Operational only; no financial totals |

Unsupported / unknown types are never acknowledged as applied.

## Acknowledgements and errors

Outcomes: `applied`, `already_applied`, `retryable_failure`, `sequence_conflict`, `dependency_conflict`, `unsupported_event_version`, `integrity_conflict`, `authorization_failure`, `validation_failure`, `incomplete_group`, `rate_limited`.

Identical event id + matching server canonical payload hash → `already_applied`. Same id/sequence with different content → `integrity_conflict` (original receipt retained).

## Limits

See `@polivo/contracts` `SYNC_INGEST_*` constants (request bytes, event/group counts, rate-limit windows). Rate limits are durable in Postgres (`sync_ingest_rate_limits`).

## RLS and grants

- Reporting + inbox tables: authenticated SELECT via `has_active_reporting_access` only
- No authenticated INSERT/UPDATE/DELETE on replicas or inbox
- `apply_sync_ingestion_group` / rate-limit RPC: `service_role` only (revoked from `anon`/`authenticated`)
- Privileged writes still validate host + stall + stream inside the RPC

## Migrations

- `20261113120000_cloud_sync_ingestion_schema.sql`
- `20261113120100_cloud_sync_ingestion_apply.sql`

## Development harness

```bash
# Env only — never put secrets on the command line
export POLIVO_SYNC_INGEST_URL=http://localhost:3000/api/sync/ingest
export POLIVO_SYNC_TENANT_ID=ten_dac04cc73ab44a7f952026465726c52c
export POLIVO_SYNC_DEVICE_ID=dev_c1c4a28fa575417a87f3f4f75bc43a1f
export POLIVO_SYNC_INSTALLATION_ID=f55be500-2cc8-40a4-baf6-ce8f3188d126
export POLIVO_SYNC_CREDENTIAL_VERSION=1
export POLIVO_SYNC_HOST_PRIVATE_KEY_PEM=/path/to/host-pkcs8.pem

node scripts/sync-ingest-harness.mjs farmer
node scripts/sync-ingest-harness.mjs replay
node scripts/sync-ingest-harness.mjs sale-v1-fail
```

Harness alone does not mark local outbox rows delivered — use the Phase 32 stall-service worker for durable local acknowledgement.

## Initial-upload prerequisites

1. Activated host for the tenant
2. Registered/created stream (`installation_id`, generation `1`, cursor `0`)
3. Required master data present or included earlier in the contiguous sequence
4. Compatible event schema versions (financial apply needs v2)

Do not auto-mark historical local rows synced. Bulk DB upload disguised as events is out of scope (later bootstrap/recovery phases).

## Phase 32 sender requirements

- Assemble complete transaction groups from local commits
- Enrich thin local outbox v1 financial payloads to ingestion v2 (re-read immutable local rows) or emit v2
- Sign each request with fresh `polivo-ingest-v1` proof; reuse immutable event ids on retry
- Advance local delivery only for explicitly acknowledged event identities
- Never delete local operational data after acknowledgement

## Development / staging checklist

1. Confirm target Supabase project/environment
2. Apply reviewed cloud migrations (`20261113120000`, `20261113120100`)
3. Configure server-only `SUPABASE_SECRET_KEY` + URL
4. Start development web app with ingest route
5. Use an activated test host
6. Upload a complete synthetic transaction group (harness `farmer`)
7. Verify cloud facts + committed acknowledgement
8. Replay and confirm no duplication
9. Submit altered content with same identity → rejection
10. Test incorrect stall scope
11. Test revoked host
12. Test sequence gap
13. Test financial group failure/rollback (isolation suite)
14. Upload complete sale/payment/correction **v2** fixtures
15. Compare cloud totals with expected fixture cutoff
16. Verify browser reporting SELECT respects membership; no direct inserts
17. Confirm logs omit secrets and full financial payloads

**Do not apply migrations to production while following this development checklist.**

Remote production apply and live Clerk↔host end-to-end acceptance remain pending until explicitly completed.
