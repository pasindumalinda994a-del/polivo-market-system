# 0021 — Cloud Sync Ingestion

- Status: Accepted
- Date: 2026-11-13

## Context and source

Phase 31 (`31-cloud-sync-ingestion-api.md`) requires a cloud API that accepts committed operational events from an authorized stall host and applies them to the Supabase reporting copy. Local SQLite remains authoritative. The Phase 32 outbox sender, Phase 33 configuration delivery, and Phase 34 reconciliation UI are out of scope.

Existing foundations: Phase 11 reporting replicas + thin `sync_received_events`; Phase 14 host Ed25519 enrollment; local `sync_outbox` with stall-scoped `local_sequence` and no transaction-group or stream identity; many financial outbox payloads are summary-only (sale lines and allocation rows not embedded).

## Decision

1. **Authority map.** Local host owns operational party/catalog changes (approved scope), finalized sales/bills, commission snapshots, ledger postings, payments/allocations, corrections/reversals, and other approved local operational records. Cloud owns tenant/membership administration, device enrollment/revocation, and later cloud-managed configuration. Cloud reporting copy stores accepted local facts and derived read-only views. Ingestion must not overwrite cloud-authoritative access settings. Web clients must not edit replicated financial rows. No bidirectional financial LWW.

2. **Placement.** Ingestion is `POST /api/sync/ingest` in Next.js (`apps/web`), Clerk-exempt like device enrollment. No separate microservice. Privileged Supabase client stays server-only.

3. **Host authentication.** Request-bound Ed25519 possession message `polivo-ingest-v1` binds deviceId, installationId, credentialVersion, batchId, canonical body hash, and signed-at. Only an **activated host** for the tenant may upload. Terminal credentials are denied. Authority (device status, stall assignment, stream generation, credential version) is rechecked inside the apply transaction. Clerk browser sessions are insufficient. Transport replay protection still allows legitimate retries with fresh signatures and identical immutable event IDs. Local staff identities in payloads are provenance only.

4. **Stream identity.** Source stream id is the host `installation_id`. Stream generation starts at `1` and advances only via explicit restore/re-enrollment authorization — never automatically on restart or conflict. Today stall binding uses `stall_id = tenant_id`; envelope scope must match the authenticated host’s tenant/stall. A replacement host must register a distinct stream (new installation) or an explicitly authorized generation.

5. **Transaction groups.** Wire batches carry ordered `transactionGroupId`s with a verifiable complete-group boundary. Process groups in source order; apply each complete group atomically; stop at the first failed group; return the committed contiguous prefix. Incomplete groups are rejected without acknowledgement. Expected-next sequence is contiguous integers (`committed_cursor + 1`).

6. **Financial payload versions.** Master-data snapshot events (`polivo.farmer.*`, buyer, vegetable, package_type) and commission/opening/print events apply at schema version `"1"` when they already carry required facts. Sale, trader-bill, farmer-bill, payment-allocation, and correction **cloud apply** require ingestion schema **`"2"`** with nested immutable snapshots (lines, packages, allocations, bill headers, correction lineage, ledger posting copies). Local thin outbox schema `"1"` for those types is rejected with stable `UNSUPPORTED_EVENT_VERSION` until Phase 32 enriches or emits v2. Never invent missing historical facts.

7. **Idempotency and integrity.** Server computes a canonical payload hash. Identical event id + matching hash → already applied. Same event id or sequence with different content → integrity conflict; do not overwrite the original receipt. Dedup identities are retained indefinitely for financial safety (no short cleanup that permits duplication).

8. **Acknowledgements.** Responses always include structured per-group outcomes and the committed cursor. HTTP 200 never implies every submitted event was applied. Phase 32 must mark delivered only explicitly acknowledged identities.

9. **Print events.** Print job/attempt events are retained as operational metadata only and must not change financial totals.

10. **Rate limits.** Durable Postgres counters enforce per-stream and per-tenant limits; do not rely solely on per-process memory.

## Reasoning

Reusing host Ed25519 and the Next.js privileged RPC pattern matches Phases 12–14 and architecture boundaries. Explicit stream generation and group atomicity prevent double money and half-applied financial operations. Separating thin local outbox v1 from cloud apply v2 avoids inventing line facts while still allowing Phase 31 harness and Phase 32 enrichment.

## Consequences

- Forward Supabase migrations add stream/inbox state, reporting schema alignment, ledger/opening/print projection tables, apply RPC, and rate-limit storage.
- `@polivo/contracts` gains ingest request/ack schemas and financial v2 apply payloads.
- Ops guide documents the event matrix, checklist, and Phase 32 sender requirements.
- Local stall-service outbox producers are unchanged in Phase 31.

## Related implementation phases

- Phase 11 — cloud reporting schema and `sync_received_events`
- Phase 14 — device enrollment and host credentials
- Phase 31 — cloud sync ingestion API
- Phase 32 — local outbox sender (consumes this contract)
- Phases 33–34 — config delivery and reconciliation
