# Sync Reconciliation and Recovery

Phase 34 operational guide. Local financial records remain authoritative. See [ADR 0023](../decisions/0023-sync-reconciliation-and-recovery.md).

## Status meanings

### Upload (operational)

| State                               | Meaning                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `up_to_date`                        | Local ack cursor has caught the local committed tail |
| `uploading` / `waiting_retry`       | Pending groups remain; worker active or backing off  |
| `blocked`                           | Compatibility/integrity block; do not force past it  |
| `configuration_required` / `paused` | Host/signing/worker not ready                        |

Remote cloud cursors are shown only with observation times. Cached remote values are never presented as live.

### Configuration / access

| State                                | Meaning                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `up_to_date`                         | Effective local revision matches what the host last applied |
| `pending_acknowledgement`            | Applied locally; cloud ack still outstanding                |
| `expired`                            | Access snapshot age exceeded ADR 0013 policy                |
| `blocked` / `configuration_required` | Pull/apply cannot proceed                                   |

Published, downloaded/applied, and cloud-acknowledged revisions are kept separate.

### Overall healthy

The desktop must **not** show Healthy while an access snapshot is expired or an unresolved integrity conflict exists.

## Comparison guarantees and limits

Three checks:

1. **Delivery** — local transaction groups vs cloud application receipts (event IDs / payload identity).
2. **Data** — replicated fact counts/relationships at a shared cutoff.
3. **Reporting** — selected derived totals (exact ledger sum) using equivalent definitions.

Results are phrased as **Matched through cutoff X**. Matching cursors alone or matching totals alone is not complete proof.

### Common-cutoff rules

- Capture local stream identity, local committed tail at run start, verified cloud cursor, and a comparable complete transaction-group boundary.
- Distinguish expected unsent backlog, cloud-committed awaiting local ack, and true mismatches inside the compared prefix.
- Do not compare today’s mutable master data against an older cloud revision as the same point.
- If historical reconstruction is unavailable, mark the domain inconclusive.
- Do not hold a SQLite transaction open across network calls.

### Manifest version

`sync-manifest-v1` / definitions `sync-reconcile-defs-v1`: sorted keys, preserved nulls, omitted undefined, SHA-256 of canonical JSON, chunked digests.

## Error categories

Stable categories include: expected upload backlog, missing cloud receipt, missing local acknowledgement, missing cloud fact, different immutable payload, missing relationship, stale projection, unsupported comparison version, incomplete source history, stream/generation conflict, configuration application/ack pending, access snapshot expired, remote state unavailable.

Network failures are not labeled as data mismatches. Host revocation is not inferred from arbitrary error strings.

## Safe recovery actions

| Action                              | Behavior                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Retry upload now                    | Wake existing Phase 32 worker only                                               |
| Replay original events              | Same event IDs/content through normal ingest                                     |
| Recover local acknowledgement       | Only after verified matching cloud receipts; advances ack via normal worker path |
| Refresh configuration               | Phase 33 pull without extending expiry                                           |
| Retry configuration application     | Same validated revision                                                          |
| Retry configuration acknowledgement | Ack only; not a second application                                               |

Plans are reviewed, eligibility is rechecked, stale plans are rejected, execution is idempotent, and jobs are audited.

## Intentionally unavailable

- Force synced
- Skip event
- Reset cursor
- Delete failed event
- Trust cloud balance
- Recreate host identity
- Fix all
- Cloud projection repair execution (diagnose only in Phase 34)
- Host replacement / DB restore / full backup recovery (later phases)

## Diagnostic export

Redacted JSON bundle via desktop save dialog (`sync.export_diagnostics`):

Includes application/schema versions, stream/generation, cursor observations, safe error codes, comparison metadata, job history, configuration revision metadata.

Excludes private keys, session secrets, auth headers, password hashes, full financial payloads, unnecessary party details, unrestricted environment dumps.

Diagnostics are never sent externally automatically.

## Capabilities

| Capability                | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `sync.view`               | Workspace / status                         |
| `sync.reconcile`          | Read-only comparison                       |
| `sync.retry`              | Worker wake / config refresh               |
| `sync.recover`            | Bounded replay / ack / config ack recovery |
| `sync.export_diagnostics` | Redacted export                            |

Reporting-only users must not receive recover/retry.

## Restore / host-replacement escalation

If local source history is missing, stream generation conflicts, or host identity is wrong: stop and follow later host/restore procedures. Do not invent recovery here.

## Integrated Phase 31–34 live acceptance checklist

Use a real enrolled host and synthetic business data. Do **not** corrupt a live stall database.

1. Verify secure host-key loading under the correct Windows account.
2. Confirm ingest, config pull, and ack endpoints.
3. Apply reviewed local (`019`) and cloud (`20261114160000`) migrations.
4. Commit a test local sale.
5. Verify signed upload and matching cloud application.
6. Verify local acknowledgement advances.
7. Run reconciliation and confirm the matched cutoff phrase.
8. Disconnect internet while retaining LAN connectivity.
9. Create another permitted local transaction.
10. Verify pending status and continued local operation.
11. Publish a test cloud permission change.
12. Verify it remains pending while the host is unreachable.
13. Restore internet.
14. Verify upload catch-up and configuration application.
15. Verify application acknowledgement and permission enforcement.
16. Simulate a lost ingestion response after cloud commit.
17. Recover through replay without duplicates.
18. Simulate a lost configuration acknowledgement.
19. Recover without repeated application side effects.
20. Restart during retry/backoff and verify durable progress.
21. Inject a controlled mismatch in an isolated test fixture.
22. Verify classification and that unsafe actions remain unavailable.
23. Export diagnostics and inspect redaction.
24. Reconcile financial totals at the same cutoff.
25. Confirm original local records remain intact.

Record real signed-host, DPAPI, LAN, and cloud checks separately from automated fixtures. Offline-access policy open questions remain in the progress tracker.
