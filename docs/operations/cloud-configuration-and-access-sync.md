# Cloud Configuration and Access Sync

Phase 33 delivers cloud-authoritative **access** configuration to the enrolled stall host. See [ADR 0022](../decisions/0022-cloud-configuration-and-access-sync.md) and `docs/implementation/33-cloud-configuration-and-access-sync.md`.

## Identity boundaries

| Identity | Role in this flow |
|---|---|
| Clerk web user | Owner publishes via web |
| Cloud membership | Caps + status in access snapshot |
| Local staff | Updated only when `cloud_membership_id` matches |
| Enrolled host | Only recipient of pull/ack |
| LAN terminal | Never pulls config; may be revoked via snapshot |

Do not create local staff from Clerk sessions. Do not match by display name or email.

## Ownership matrix (v1)

| Setting | Authority |
|---|---|
| Role permission profiles | Cloud (Permissions Save also cascades onto matching memberships) |
| Membership capabilities/status | Cloud → local via verified membership mapping |
| Device revocations | Cloud → local enrollment projection |
| Offline access durations | ADR 0013 (2h idle / 12h absolute / 7d snapshot) |
| Stall display | Local host trust/meta (not delivered) |
| Commission bands | Local Phase 20 (not delivered) |
| Terminal printers | Terminal-local (not delivered) |
| Sales/payments/ledger | Local only (never mutated by apply) |

## Domain and trust

- Domain: `access` complete-replacement snapshots only.
- Trust: HTTPS + host Ed25519 possession (`polivo-config-pull-v1` / `polivo-config-ack-v1`).
- Not trusted: unsigned files, renderer messages, arbitrary cached/relayed copies outside authenticated pull.
- Cloud save ≠ applied. Applied advances only after host ack of a local commit.

## Host endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/config/pull` | Host possession |
| POST | `/api/config/ack` | Host possession |

Owner status: `get_access_config_delivery_status` RPC + Permissions page copy (“Saved in cloud; waiting for stall host”).

## Stall-service worker

Separate from the outbox upload worker.

| Env | Purpose |
|---|---|
| `POLIVO_CONFIG_PULL_URL` | Pull endpoint (defaults from ingest origin `/api/config/pull` when unset) |
| `POLIVO_CONFIG_ACK_URL` | Ack endpoint (defaults to same origin `/api/config/ack`) |
| `POLIVO_SYNC_ALLOW_INSECURE_HTTP` | Dev-only http:// allowlist (shared with ingest) |

Local routes (require `settings.manage`):

- `GET /config/status`
- `POST /config/refresh`

Desktop Settings → **Access configuration** (`polivoConfigSync`).

## Local application

Migration `018`:

- `config_domain_state` — effective revision, pending ack, blocks
- `config_received_snapshots` — immutable received payloads
- `config_application_audit`

Apply is one SQLite transaction: revision guard → persist snapshot → update mapped staff caps / disable inactive → revoke terminals → pending ack. Authorization re-reads capability snapshots on every protected request (no parallel checker).

Desktop terminals refresh `/local-auth/session` while signed in (and after Access configuration Refresh) so UI gates drop removed capabilities without requiring sign-out. Session rows are not revoked on capability-only changes.

Manual permission-refresh grant/redeem remains an emergency fallback.

## Status labels

| Label | Meaning |
|---|---|
| Saved in cloud; waiting for stall host | Published revision ahead of host ack |
| Applied | Host acknowledged successful apply |
| Failed / blocked | Host reported rejection or compatibility/revocation block |
| Pending acknowledgement | Applied locally; ack upload outstanding |

## Offline and revocation

- Snapshot age follows ADR 0013; poll/restart/Refresh do not extend expiry.
- Cloud-only revoke takes effect only after local apply; offline lag up to snapshot validity remains.
- Host revoke in snapshot blocks further config ops without auto re-enrollment.
- A generic network failure is not proof of revocation.

## Live development checklist

1. Apply cloud migration `20261113200000` to the linked polivo-dev project.
2. Apply local migration: `pnpm --filter @polivo/db-local db:migrate`.
3. Restart stall-service with ingest/config URLs configured and activated host credentials available.
4. As stall owner, change a role permission on `/permissions`.
5. Confirm web shows saved / waiting for host.
6. Let the host poll (or Refresh now).
7. Confirm local effective revision advances and ack reaches cloud.
8. Confirm web shows applied.
9. Sign in as mapped staff; verify caps; remove a cap and confirm next protected op denies.
10. Disconnect network, publish again, confirm pending delivery; restore and verify apply/ack.
11. Restart after apply before ack; confirm ack recovery without reapplying side effects.
12. Confirm sales/bills/payments/balances unchanged.

If production policy values beyond ADR 0013 remain unresolved (fresher-auth, device credential offline expiry), report access readiness as blocked for those items only.

## Remaining decisions

- Fresher-auth capability subset (ADR 0013 deferred).
- Staff secret TTL/rotation.
- Device credential offline expiry (ADR 0010).
- Live enrolled-host smoke for Phase 32/33 (DPAPI reopen).
