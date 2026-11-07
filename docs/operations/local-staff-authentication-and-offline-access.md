# Local Staff Authentication and Offline Access

Phase 15 stall-service local staff authentication. Desktop LAN session handoff is Phase 16.

## Policy (ADR 0011 + ADR 0013)

- **Production** composition uses `createProductionOfflineAccessPolicy` ([0013](../decisions/0013-local-staff-offline-access-durations.md)):
  - Session **idle:** 2 hours from last meaningful activity
  - Session **absolute:** 12 hours from sign-in (`issued_at` → expiry inclusive at the boundary)
  - **Max snapshot age:** 7 days (168 hours) from `authority_verified_at`
  - **First login offline:** allowed when a non-expired local snapshot, active credentials, and accepted/activated device are present
- **TEST-ONLY** offline policy values are injected only in automated test composition. They must never be production defaults or ordinary env toggles.
- Session lifetime and offline authorization deadline are independent. Re-login does not extend an old snapshot’s authority. Restart/clock rollback does not renew offline access.
- Device enrollment ≠ staff permissions. Web membership alone cannot issue a local session.
- `productionFailClosedOfflineAccessPolicy` remains for explicit tests only (not the service default).

### What counts as idle activity

Only authenticated **command write-boundary** authorization with `touchActivity: true` updates `last_activity_at` (see `command-runner` recheck before execute).

**Does not** extend idle:

- `GET /health`
- `GET /local-auth/session` (and other passive session checks)
- Initial/idempotent-replay authorization with `touchActivity: false`
- Background polling / automatic retries that only read session state

### Offline revocation limitation

Locally applied device revoke, staff deactivate, credential reset, and capability reductions take effect **immediately** on the host.

Cloud-only membership or device changes do **not** take effect locally until received and applied. During an outage, staff may retain last-known permissions until the snapshot expires (up to 7 days after last trusted verification). Offline cloud revocation is **not** immediate.

## Prerequisites

1. Local SQLite migrated through `003_local_staff_and_sessions`.
2. Host activated (Phase 14) with OS-protected credentials (Windows DPAPI in production; simulated storage is test/dev only).
3. Terminals accepted locally for multi-device scenarios.
4. Cloud migrations applied: `20261104180000_local_staff_setup_grants` and `20261107200000_local_staff_permission_refresh` (membership `capabilities_revision` + refresh grants).

## Development commands

Set `POLIVO_LOCAL_DB_PATH` to an absolute SQLite path.

### First-owner setup (requires internet)

1. As cloud owner, `POST /api/tenants/{tenantId}/local-staff/setup-grant` (authenticated Clerk session). Response includes one-time `setupGrantSecret` — show once.
2. On the host, `staff-cli setup-owner` redeems via `POST /api/local-staff/setup-grants/redeem`. That redeem route is a **machine endpoint** (one-time setup grant secret), exempt from Clerk session checks the same way `/api/device-enrollment/*` is. Owner authorize under `/api/tenants/.../setup-grant` remains Clerk-protected.

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\path\to\stall.sqlite"
$env:POLIVO_ENROLLMENT_BASE_URL = "http://localhost:3000"
pnpm --filter @polivo/stall-service staff-cli setup-owner OWNER1
```

Prefer pasting the setup grant secret at the prompt. Prompt also asks for the local owner secret (do not put secrets on argv). Device enrollment grants must not be reused.

### Activate billing staff / cashier (local)

Capabilities are a JSON array of capability ids. Prefer matching the cloud membership’s current capabilities and `capabilities_revision`. On **PowerShell + pnpm**, use a double-quoted argument with escaped inner quotes. Do **not** pass bash-style `'["cap"]'` through pnpm.

```powershell
pnpm --filter @polivo/stall-service staff-cli activate-staff CASH1 mem_<membershipId> "[\"payments.receive_trader\",\"payments.pay_farmer\",\"payments.record_cheque\",\"reports.view_financial\"]" 1 "Cashier One"
```

Link staff with stable `cloud_membership_id`, not email/name/role labels. Activation writes a local snapshot; it is not a substitute for later **trusted** refresh.

### Permission refresh (trusted online authority — ADR 0013)

Internet alone or re-typing capability JSON is **not** a valid authority refresh. Owner must authorize a short-lived grant; the host redeems it and applies **live** cloud membership capabilities + `capabilities_revision`.

1. As cloud owner (Clerk session):

```http
POST /api/tenants/{tenantId}/local-staff/permission-refresh
Content-Type: application/json

{ "membershipId": "mem_<membershipId>" }
```

Response includes one-time `refreshGrantSecret` (show once) and `expiresAt`.

2. On the host:

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\path\to\stall.sqlite"
$env:POLIVO_ENROLLMENT_BASE_URL = "http://localhost:3000"
pnpm --filter @polivo/stall-service staff-cli refresh-permissions <staffId>
```

Paste the refresh grant secret when prompted (or set `POLIVO_LOCAL_STAFF_REFRESH_SECRET` for non-interactive use). Redeem hits `POST /api/local-staff/permission-refresh/redeem` (Clerk-exempt machine endpoint). Failed redeem must not advance `authority_verified_at`. Automated background distribution remains Phase 33.

### Sign-in / session / sign-out (HTTP)

With the stall service running (`pnpm dev:service`):

- `POST /local-auth/sign-in` — body: `{ staffCode, secret, deviceProof }`
- `GET /local-auth/session` — headers: device proof + `x-polivo-session` (**does not** extend idle)
- `POST /local-auth/sign-out` — body: `{ deviceProof }`; header: `x-polivo-session`

Device proof headers:

- `x-polivo-device-id`
- `x-polivo-device-signed-at`
- `x-polivo-device-signature` (Ed25519 over `polivo-device-auth-v1` message)

Session secret is returned **once** at sign-in. Keep it out of renderer `localStorage`, URLs, logs, and shared UI state.

### Credential reset / deactivation

```powershell
pnpm --filter @polivo/stall-service staff-cli reset-credential <staffId>
pnpm --filter @polivo/stall-service staff-cli deactivate-staff <staffId>
```

Reset invalidates existing sessions. Deactivated accounts fail login and session validation immediately on this host.

## Online vs outage

| Step | Internet required? |
| --- | --- |
| First-owner setup grant issue + redeem | Yes |
| Host activated + staff credentials + snapshot within 7 days | Sign-in can work offline |
| Trusted permission refresh (authorize + redeem) | Yes |
| Recover from snapshot / session expiry | Yes (trusted refresh) then sign in again |
| Staff switch / logout | No (local) |
| Cloud-only revoke while host offline | Not local until refresh/apply or snapshot expiry |

## Recovery from offline expiry

1. Restore connectivity.
2. Owner authorizes a permission refresh grant for the membership; host runs `refresh-permissions <staffId>` with the one-time secret.
3. Sign in again. New session does not extend an expired snapshot by itself.

## Verification notes

- Automated tests use **TEST-ONLY** or explicit production policy injection and **memory/simulated** secure storage where appropriate.
- Real Windows DPAPI / Electron `safeStorage` reopen remains an outstanding Phase 14 platform check.
- Production-policy desktop sign-in unblocks the prior ADR 0011 login failure; full operational readiness still requires secure-storage reopen evidence and a verified refresh procedure on the target environment.
