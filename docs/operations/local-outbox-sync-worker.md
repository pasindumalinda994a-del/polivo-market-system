# Local Outbox Sync Worker

Phase 32 host-side worker that uploads committed local outbox events to the Phase 31 cloud ingestion API. Local SQLite remains authoritative. Desktop terminals do not run upload workers. Local billing never waits on cloud acknowledgement.

Implementation guide: [32-local-outbox-sync-worker.md](../implementation/32-local-outbox-sync-worker.md). Ingestion contract: [cloud-sync-ingestion.md](./cloud-sync-ingestion.md), [ADR 0021](../decisions/0021-cloud-sync-ingestion.md).

## Host credential loading

- Uses the Phase 14 enrolled host credential via `SecureStorageAdapter` (`windows-dpapi` on Windows production; `simulated-file` only when `POLIVO_SECURE_STORAGE=simulated`).
- Opaque `host_enrollment.credential_ref` points at the secure blob. Private keys never enter SQLite, renderer storage, or environment variables for the primary path.
- Signing is a service-side facade (`createHostIngestSigner`) that signs `polivo-ingest-v1` possession messages and returns headers only.
- Actionable configuration error when secure storage cannot open or the host is not activated.

Development signing helper (same production path):

```bash
pnpm --filter @polivo/stall-service sync-sign < body.json
```

Requires `POLIVO_LOCAL_DB_PATH` and an activated host. Never prints the private key.

## Endpoint configuration

| Variable | Purpose |
|----------|---------|
| `POLIVO_SYNC_INGEST_URL` | Full ingest URL (`POST /api/sync/ingest`) |
| `POLIVO_SYNC_ALLOW_INSECURE_HTTP` | `1`/`true` allows `http://` for local development only |

Production and staging must use HTTPS. TLS certificate verification is not disabled. Signed requests do not follow redirects. Supabase privileged keys are not installed on the host.

## Worker startup and shutdown

- Started from stall-service process entry after DB open + verify and HTTPS listen preparation.
- Runs only for an activated authoritative host with loadable credentials.
- Stops cleanly on SIGINT/SIGTERM before database close.
- One in-process upload loop plus durable SQLite lease/fencing per stall stream.

## Ownership / lease

- Table `sync_worker_lease` stores `owner_token`, `fence_token`, and expiry.
- Progress and acknowledgement updates require the current fence token.
- An expired lease may be stolen with a bumped fence; active foreign leases cannot.

## Batching and group ordering

- Pending events read in `local_sequence` order.
- Complete `transaction_group_id` groups are never split.
- Limits come from `@polivo/contracts` `SYNC_INGEST_MAX_*` and are checked against the encoded request.
- An oversized single group is blocked (not truncated). Later dependent groups are not skipped around a block.
- SQLite write transactions are not held open during HTTP.

Multi-event producers (sale finalize, payment+allocation) share one `transactionGroupId` at commit time. Historical pre-017 rows were backfilled as single-event groups (`transaction_group_id = event_id`).

## Financial enrichment

Thin local outbox schema `"1"` financial payloads are enriched at upload time to ingestion apply schema `"2"` by re-reading immutable local rows. Stored outbox payloads are never rewritten. Missing reconstructible facts block with `ENRICHMENT_FAILED` rather than inventing history.

## Acknowledgement validation

HTTP 200 alone is insufficient. The worker validates stream identity, batch correlation, and acknowledged event IDs against the submitted batch, then advances only the verified prefix inside one local SQLite transaction.

## Retry classification

Transient network/timeout/5xx/rate-limit outcomes use exponential backoff with jitter (max 15 minutes) and durable `next_retry_at`. Server `retryAfterSeconds` is honored within bounds. Restarts do not create retry storms. Pending data is never deleted after retry exhaustion.

## Blocked conditions

Revoked/invalid credentials, unsupported versions, integrity/sequence/generation conflicts, oversized groups, and enrichment failures set durable blocked state. Manual **Retry now** clears retry gates and rechecks conditions; it does not bypass validation or start a parallel loop.

## Status meanings

`GET /sync/status` (capability `settings.manage`):

| State | Meaning |
|-------|---------|
| `up_to_date` | No pending events through the measured local tail |
| `uploading` | An upload cycle is in progress or pending work is eligible |
| `waiting_retry` | Backoff deadline has not elapsed |
| `paused` | Worker disabled |
| `configuration_required` | Missing ingest URL, host not activated, or credential unavailable |
| `blocked` | Requires attention; first blocking group preserved |

`POST /sync/retry` wakes the same worker under the same lease.

Desktop Settings shows a minimal Cloud sync panel via `polivoSync` IPC.

## Live smoke-test procedure

1. Apply local migration `017` (`pnpm --filter @polivo/db-local db:migrate`).
2. Confirm Phase 31 cloud migrations and `POST /api/sync/ingest`.
3. Confirm enrolled host credential loads (`sync-sign` or worker startup without configuration_required).
4. Send one authenticated group via harness with `POLIVO_LOCAL_DB_PATH` set.
5. Enable worker with `POLIVO_SYNC_INGEST_URL`; create a small local transaction; verify upload + local ack.
6. Disconnect internet; create another local transaction; verify pending + local success.
7. Restore internet; verify catch-up without duplicate cloud effects.
8. Restart during backoff; verify recovery.
9. Confirm status distinguishes pending vs acknowledged.

Do not export the host private key. If real DPAPI reopen cannot run, record live signed-host checks as pending separately from mocked tests.

## Restore and host-replacement limitations

- Stream id = `installation_id`; generation starts at `1` and never auto-forks.
- Restored older DBs may replay already-applied events for duplicate-safe cloud results.
- Sequence/content conflicts block and require later restore/reconciliation workflows (Phase 34 / recovery phases).
- Cloud reporting replication is not a backup replacement.

## Phase 33 / 34 boundaries

- Phase 33: cloud→local configuration and permission delivery.
- Phase 34: full reconciliation and recovery UI.
- This phase does not purge the outbox, rewrite historical payloads, or auto-replace hosts.
