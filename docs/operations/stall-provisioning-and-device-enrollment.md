# Stall Provisioning and Device Enrollment

Phase 14 operations guide for authorizing one Windows host per stall, binding its local SQLite database, pairing additional terminals, and rotating or revoking device credentials.

## Concepts

| Concept              | Meaning                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stall host           | One Windows installation runs `@polivo/stall-service` and owns the authoritative SQLite file for one Phase 13 tenant.                                                                      |
| Terminal             | An Electron installation paired to a specific activated host. It never opens SQLite.                                                                                                       |
| Enrollment secret    | Single-use secret shown once in the owner Devices UI. Default TTL is **15 minutes** (900s). Digests only are stored in Postgres.                                                           |
| Credential           | Ed25519 keypair. Private key in OS-protected storage (host: Windows DPAPI; terminal: Electron `safeStorage`).                                                                              |
| Cloud revoke         | Owner revoke commits in Postgres; subsequent cloud device operations fail.                                                                                                                 |
| Host acknowledgement | Local host must persist terminal revocation / pairing state. Devices UI shows **cloud** enrollment state only; confirm local revoke by host/terminal behavior (not a separate ack column). |

Device enrollment does not open a billing session. Local staff authentication is Phase 15. LAN business auth is Phase 16.

## Development commands

Run these on the computers indicated. Keep secrets out of shell history when possible (`POLIVO_ENROLLMENT_SECRET` for automation only).

### Owner (browser — any machine)

1. Sign in to `@polivo/web` as the stall owner.
2. Open **Devices** for the stall (`/tenants/{tenantId}/devices`).
3. Choose deployment environment (`development` / `staging` / `production`).
4. **Authorize host** (first host only). Copy the one-time secret immediately and run `activate-host` **within 15 minutes**.
5. After the host is **Activated**, **Authorize terminal** for that host and copy its secret (same 15-minute TTL).

### Host computer (Windows service account)

Use **PowerShell** (Cursor / Windows Terminal). Environment variables must use `$env:...` — `set VAR=...` is cmd.exe and will not satisfy `db:init`.

```powershell
# Absolute path outside the git repository (required)
New-Item -ItemType Directory -Force -Path C:\PolivoData | Out-Null
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\stall.sqlite"

# Build workspace packages if dist/ is missing or stale (fresh checkout)
pnpm --filter @polivo/contracts build
pnpm --filter @polivo/db-local build
pnpm --filter @polivo/stall-service build
pnpm --filter @polivo/db-local db:init
pnpm --filter @polivo/db-local db:migrate

$env:POLIVO_ENROLLMENT_BASE_URL = "http://localhost:3000"
$env:POLIVO_DEPLOYMENT_ENVIRONMENT = "development"

# Prefer interactive paste (omit POLIVO_ENROLLMENT_SECRET). If using env, clear any stale value first:
Remove-Item Env:POLIVO_ENROLLMENT_SECRET -ErrorAction SilentlyContinue
# $env:POLIVO_ENROLLMENT_SECRET = "paste-secret-from-latest-Authorize-host-only"

pnpm --filter @polivo/stall-service activate-host
pnpm --filter @polivo/stall-service start
```

In cmd.exe instead of PowerShell, use `set POLIVO_LOCAL_DB_PATH=C:\PolivoData\stall.sqlite` (no spaces around `=`). Prefer PowerShell for this guide.

Use the same Windows account for `activate-host` and the running service so DPAPI CurrentUser blobs reopen after restart. Do not place the SQLite file inside the repository tree.

Set `$env:POLIVO_SECURE_STORAGE = "simulated"` only for non-production local experiments. Report simulated results separately from real DPAPI checks.

A cloud device status of **Pending activation** after Authorize host is expected until `activate-host` succeeds on this machine. After every **Authorize host**, replace any shell `POLIVO_ENROLLMENT_SECRET` with the secret shown in that UI response — a stale env value past the 15-minute TTL yields `GRANT_EXPIRED`.

### Terminal computer (Electron)

Phase 14 pairs over **loopback**. Run these on the **same host PC** that already has an Activated host and stall-service:

1. Keep stall-service listening (`127.0.0.1:3040`) and `pnpm dev:web` on that PC (`http://localhost:3000`).
2. On Devices, set deployment environment to **development** (must match desktop).
3. **Authorize terminal** for the activated host; copy the one-time secret and enroll **within 15 minutes**.
4. Start desktop on the **host PC**: `pnpm dev:desktop`.
5. Paste the **new** secret into **Terminal enrollment** once. Desktop redeems at `http://localhost:3000`, then posts to `http://127.0.0.1:3040/enrollment/terminals/accept`.

Do **not** expect another Wi‑Fi PC to pair in this phase: desktop hardcodes `127.0.0.1:3040`, which is that PC’s loopback, not the host. LAN bind is a later phase.

If enrollment fails **before** cloud redeem: check Devices, fix web/stall-service, and retry with the **same** secret while it is still valid (15-minute TTL). After a successful redeem, **do not revoke** to retry host accept/confirm — desktop reuses the stored keypair and resumes accept + cloud confirm. Revoke and re-authorize only when the secret expired unused, the wrong role was authorized, or the device must be retired.

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
5. **Enrollment secret expired (`GRANT_EXPIRED`):** The Pending host’s grant timed out (default 15 minutes) or the shell still holds an older secret. **Revoke** that Pending host or **Cancel unused enrollment**, then **Authorize host** once, clear `$env:POLIVO_ENROLLMENT_SECRET`, and run `activate-host` with the **new** secret within 15 minutes. Do not authorize a second host while a valid pending reservation still exists.
6. **Terminal cloud redeem succeeded, host accept/confirm interrupted:** Keep the same installation. Ensure web + stall-service HTTPS are running on the host PC, then retry enrollment — desktop reuses the stored key and resumes accept + confirm. Do **not** revoke after a successful redeem solely to retry confirm.
7. **Terminal redeem never succeeded / secret expired / wrong role:** Revoke or cancel the stuck Pending/Waiting row if needed, **Authorize terminal** again, and enroll with the **new** secret on that installation (or the PC that should own it). Each installation must enroll itself; host accept remains loopback in this phase.

## Revocation

| Action                 | Cloud                                                                        | Host local                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner revokes terminal | Immediate reject of cloud device ops / renewals                              | Requires host sync/ack path to persist `accepted_terminals.pairing_state = revoked` (Phase 14 records local revoke API surface; full pull of cloud revokes while online can be extended in later ops). |
| Owner revokes host     | Credential rejected for cloud device ops; reservation preserved for recovery | Local DB and business data preserved; do not auto-activate another host.                                                                                                                               |

## Phase 16 trust fields

Desktop LAN connection (Phase 16) uses trust pins captured at host accept: host `device_id`, host Ed25519 `public_key`, `credential_version`, `stallDisplayName`, and TLS certificate SHA-256 — plus host-accepted terminal rows for device proofs. Installation id alone is insufficient. See [desktop-service-connection-and-lan-terminals.md](./desktop-service-connection-and-lan-terminals.md) and [ADR 0012](../decisions/0012-desktop-service-transport-trust.md). Terminals paired before Phase 16 without trust pins must re-pair on the host over loopback HTTPS.

## Related docs

- [0010 — Device credential storage](../decisions/0010-device-credential-storage.md)
- [0012 — Desktop service transport trust](../decisions/0012-desktop-service-transport-trust.md)
- [Desktop service connection and LAN terminals](./desktop-service-connection-and-lan-terminals.md)
- [Tenant onboarding](./tenant-onboarding-and-access-management.md)
- [Local database and migrations](./local-database-and-migrations.md)
- [Environment configuration](./environment-configuration.md)
