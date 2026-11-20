# 0022 — Cloud Configuration and Access Sync

- Status: Accepted
- Date: 2026-11-13

## Context and source

Phase 33 (`33-cloud-configuration-and-access-sync.md`) requires secure delivery of cloud-authoritative configuration and access changes to the stall host. Foundations: Phase 13 permission profiles, Phase 14 host enrollment, Phase 15 offline access (ADR 0013), Phases 31–32 host Ed25519 ingest transport.

## Decision

1. **Ownership matrix (v1).**

| Setting | Authoritative | Editor | Scope | Revision | Local apply | Active sessions | Offline expiry |
|---|---|---|---|---|---|---|---|
| Owner-managed role permissions | Cloud | Stall owner (web) | Tenant/stall | Monotonic publication revision | Complete `access` snapshot | Recheck caps on next authorize | ADR 0013 snapshot age |
| Local staff access assignments | Cloud membership caps via verified `cloud_membership_id` | Owner (web) + local provisioning | Mapped staff only | Membership `capabilities_revision` inside snapshot | Apply only when mapping exists | Disable/revoke on inactive | ADR 0013 |
| Device revocations | Cloud enrollment | Owner (web) | Stall devices | Included in `access` snapshot | Update local terminal/host projection | Deny revoked devices | Lag until apply; then immediate |
| Access-policy validity | ADR 0013 | Product ADR | Host | N/A | Enforce locally | Idle/absolute/snapshot | 7d max snapshot age |
| Stall display settings | Local host trust/meta | Local | Host/terminal | Local | Not cloud-delivered | N/A | N/A |
| Commission configuration | Local (Phase 20) | Local `commission.manage` | Stall | Local versions | Not cloud-delivered | N/A | N/A |
| Terminal printer selection | Terminal-local | Desktop | Terminal | Local | Not cloud-delivered | N/A | N/A |
| Sales, payments, ledger | Local host | Stall-service | Stall | Local | Never mutated by config apply | N/A | N/A |

2. **Domain model.** Phase 33 delivers one domain: `access`. Snapshots are **complete replacements** for that domain (not deltas). Related profiles, memberships, and device states share one atomic bundle.

3. **Trust model.** Authenticated HTTPS to Next.js host endpoints plus request-bound Ed25519 possession (`polivo-config-pull-v1` / `polivo-config-ack-v1`), reusing Phase 14/31/32 host credentials. No separate server-signed config envelopes in v1. Trust does **not** extend to unsigned local files, browser messages, renderer input, or arbitrary cached/relayed copies outside the authenticated pull path.

4. **Publication vs application.** Cloud save publishes an immutable revision. “Applied” advances only after the intended activated host acknowledges a successful local commit. Pull alone does not mark applied.

5. **Authorization effectiveness.** No parallel permission checker and no new authorization-epoch column. The existing adapter re-reads capability snapshots on every protected authorize. Account disablement revokes sessions. Terminal revoke updates local enrollment projection.

6. **Offline policy.** Production durations remain ADR 0013. Receiving a snapshot must not invent indefinite offline access or extend expiry because of poll timeout, restart, replay, or Refresh. TEST-ONLY policy values stay tests-only.

7. **Workers.** Configuration pull is a separate stall-service responsibility from outbox upload. Upload schema blocks must not stop authorized access refresh.

## Reasoning

Complete `access` snapshots keep removed grants and disabled accounts explicit. Reusing host possession avoids a second key-distribution system while documenting transport limits. Preserving local authority for commission, printers, display, and financial records prevents dual writers and feedback loops.

## Consequences

- Cloud migrations add published config versions and per-host acknowledgements.
- Local migration `018` stores effective revision, received snapshot metadata, and pending acks.
- Web permissions UI shows saved vs pending vs applied.
- Manual permission-refresh grants remain as emergency fallback.

## Related implementation phases

- Phase 13 — tenant onboarding and role management
- Phase 14 — device enrollment
- Phase 15 — local staff offline access (ADR 0013)
- Phases 31–32 — host ingest transport
- Phase 33 — cloud configuration and access sync
- Phase 34 — reconciliation UI
