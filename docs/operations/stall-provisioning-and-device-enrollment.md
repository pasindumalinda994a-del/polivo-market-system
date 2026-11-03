# Stall Provisioning and Device Enrollment

Phase 14 operations guide for authorizing one Windows host per stall, binding its local SQLite database, pairing additional terminals, and rotating or revoking device credentials.

## Concepts

| Concept              | Meaning                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stall host           | One Windows installation runs `@polivo/stall-service` and owns the authoritative SQLite file for one Phase 13 tenant. |
| Terminal             | An Electron installation paired to a specific activated host. It never opens SQLite.                                  |
| Enrollment secret    | Short-lived, single-use secret shown once in the owner Devices UI. Digests only are stored in Postgres.               |
| Credential           | Ed25519 keypair. Private key in OS-protected storage (host: Windows DPAPI; terminal: Electron `safeStorage`).         |
| Cloud revoke         | Owner revoke commits in Postgres; subsequent cloud device operations fail.                                            |
| Host acknowledgement | Local host must persist terminal revocation / pairing state. Cloud revoke and host ack are displayed separately.      |

Device enrollment does not open a billing session. Local staff authentication is Phase 15. LAN business auth is Phase 16.

## Development commands

Run these on the computers indicated. Keep secrets out of shell history when possible (`POLIVO_ENROLLMENT_SECRET` for automation only).

### Owner (browser — any machine)

1. Sign in to `@polivo/web` as the stall owner.
2. Open **Devices** for the stall (`/tenants/{tenantId}/devices`).
3. Choose deployment environment (`development` / `staging` / `production`).
4. **Authorize host** (first host only). Copy the one-time secret immediately.
5. After the host is **Activated**, **Authorize terminal** for that host and copy its secret.

### Host computer (Windows service account)

```bash
# Absolute path outside the repo
set POLIVO_LOCAL_DB_PATH=C:\PolivoData\stall.sqlite
pnpm --filter @polivo/db-local db:init
pnpm --filter @polivo/db-local db:migrate

set POLIVO_ENROLLMENT_BASE_URL=http://localhost:3000
set POLIVO_DEPLOYMENT_ENVIRONMENT=development
# Optional non-interactive secret:
set POLIVO_ENROLLMENT_SECRET=paste-secret-here

pnpm --filter @polivo/stall-service activate-host
pnpm --filter @polivo/stall-service start
```

Use the same Windows account for `activate-host` and the running service so DPAPI CurrentUser blobs reopen after restart.

Set `POLIVO_SECURE_STORAGE=simulated` only for non-production local experiments. Report simulated results separately from real DPAPI checks.

### Terminal computer (Electron)

1. Start the stall service on the host (`127.0.0.1:3040` loopback default in this phase).
2. Start desktop: `pnpm dev:desktop`.
3. Paste the terminal enrollment secret into **Terminal enrollment**.
4. Desktop redeems against the web enroll API, then posts a pairing artifact to `POST http://127.0.0.1:3040/enrollment/terminals/accept`.

## Status meanings

| UI / local state                   | Meaning                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pending activation / `reserved`    | Owner authorized; secret not yet redeemed.                                                       |
| Redeemed — awaiting confirmation   | Cloud registered the device; host confirm not finished.                                          |
| Waiting for host confirmation      | Terminal redeemed in cloud; host has not durably accepted yet.                                   |
| Activated / `activated` / `paired` | Confirmed end-to-end for that role.                                                              |
| Revoked                            | Cloud (and/or local) rejection. Host must persist local terminal revoke for offline enforcement. |

## Resume interrupted setup

1. **Cloud committed, response lost:** Re-run `activate-host` on the **same** installation/database. Possession proof + installation id resume the consumed grant. A different installation cannot claim it.
2. **SQLite bound, confirm lost:** Re-run activation; confirm retries without issuing a new credential or rebinding.
3. **Protected storage failed:** Activation stays incomplete. Do not fall back to plaintext. Fix storage under the service account, then resume.
4. **Existing host present:** Do not authorize a second financial writer. Host replacement is Phase 39.

## Revocation

| Action                 | Cloud                                                                        | Host local                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner revokes terminal | Immediate reject of cloud device ops / renewals                              | Requires host sync/ack path to persist `accepted_terminals.pairing_state = revoked` (Phase 14 records local revoke API surface; full pull of cloud revokes while online can be extended in later ops). |
| Owner revokes host     | Credential rejected for cloud device ops; reservation preserved for recovery | Local DB and business data preserved; do not auto-activate another host.                                                                                                                               |

## Phase 16 trust fields

LAN authentication should use: `device_id`, Ed25519 `public_key`, `credential_version`, host `cloud_state_revision` / local revision, and host-accepted terminal rows. Installation id alone is insufficient.

## Related docs

- [0010 — Device credential storage](../decisions/0010-device-credential-storage.md)
- [Tenant onboarding](./tenant-onboarding-and-access-management.md)
- [Local database and migrations](./local-database-and-migrations.md)
- [Environment configuration](./environment-configuration.md)
