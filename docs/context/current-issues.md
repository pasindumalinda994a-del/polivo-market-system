# Current issues

## Devices page PGRST202 — missing Phase 14 RPCs (2026-11-03)

**Symptom:** Owner opens Devices → 500 with “Confirm phase 13 migrations are applied.” Log: `PGRST202 Could not find the function public.list_tenant_devices(p_tenant_id)`.

**Root cause:** Phase 14 migration `20261103180000_device_enrollment.sql` was in the repo but not applied to hosted polivo-dev. CLI had been linked to **polivo-staging** while `.env.local` targeted **polivo-dev**. Error mapper also blamed Phase 13 generically for any missing-function PostgREST error.

**Fix:**

- Relinked CLI to polivo-dev (`jvwjhvouhuvqujuinuoc`) and pushed `20261103180000`.
- Neutralized PGRST202 copy in `mapTenantRpcError` (migrations / device enrollment, not Phase 13-only).
- Devices page renders `TenantShell` unavailable instead of uncaught 500 on `SERVICE_UNAVAILABLE`.

**Operator verify:** As stall owner, open `/tenants/{tenantId}/devices` → expect HTTP 200 and empty device list (or existing devices), not 500. Keep CLI linked to the same project as `NEXT_PUBLIC_SUPABASE_URL`.

---

## Invitation accept — non-canonical email_verified claim (2026-11-03)

**Symptom:** Dileep accepts Pasindu’s invite; Clerk user email is verified, but accept 400s with “session token still reports email_verified as false.” Log:

```
hasEmail: true
hasEmailVerifiedClaim: true
emailVerifiedOk: false
emailVerifiedIsFalse: false
emailVerifiedType: 'string'
clerkPrimaryEmailStatus: 'verified'
```

**Root cause:** Session claim `email_verified` is a non-canonical string (not boolean true/false). Preflight treated that as failure even when `currentUser()` reported verified; SQL `polivo_jwt_verified_email` only accepted `true`/`t`/`1`.

**Fix:**

- Preflight trusts Clerk `currentUser()` when primary email is verified and the claim is not explicitly false; hardens quote-wrapped truthy parsing.
- Forward migration `20261103120000_soften_jwt_verified_email_claim.sql` — same rules in Postgres; pushed to polivo-dev.

**Operator verify:** As Dileep (`dileepsanjeewa122@gmail.com`), open a fresh invite from Pasindu to that exact email → Accept → expect membership on dashboard.

---

## Invitation not visible on invitee account — expected (2026-11-03)

Phase 13 has no invitee inbox / no email delivery. Owner copies `/invitations/[token]`; invitee opens that link.

---

## Hydration mismatch (`cz-shortcut-listen`) — resolved (2026-11-03)

ColorZilla injects `cz-shortcut-listen` on `<body>`. Mitigated with `suppressHydrationWarning` on `html`/`body`.

---

## Create-stall PGRST202 — resolved (wrong project) (2026-11-02)

CLI was linked to polivo-staging while `.env.local` targeted polivo-dev. Relinked and pushed through `20261102193000`.

---

## Create-stall hardening notes (2026-11-02)

- `20261102190000` — `extensions.gen_random_uuid()` under empty `search_path`.
- `20261102193000` — create-stall capability args as `json` + schema reload.

---

## Host `db:init` missing `POLIVO_LOCAL_DB_PATH` (2026-11-04)

**Symptom:** `pnpm --filter @polivo/db-local db:init` fails with `POLIVO_LOCAL_DB_PATH is required...` while Devices shows host `dev_a72c84db…` as **Pending activation**.

**Root cause:** PowerShell session had no `POLIVO_LOCAL_DB_PATH`. The provisioning ops guide used cmd-style `set VAR=...`, which does not set the variable in PowerShell. Pending activation is expected until `activate-host` runs against a local DB.

**Fix:**

- Ops guide host steps rewritten to PowerShell `$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\stall.sqlite"` (create `C:\PolivoData` first).
- CLI missing-env error now includes PowerShell and cmd examples.

**Operator verify:**

```powershell
New-Item -ItemType Directory -Force -Path C:\PolivoData | Out-Null
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\stall.sqlite"
pnpm --filter @polivo/db-local db:init
```

Then `db:migrate` and `activate-host` with the one-time enrollment secret (do not authorize a second host if the pending reservation is still valid).

---

## Host `activate-host` GRANT_EXPIRED (2026-11-04)

**Symptom:** After successful `db:init` / `db:migrate` on `C:\PolivoData\stall.sqlite`, `pnpm --filter @polivo/stall-service activate-host` failed with opaque `Enrollment request failed (400).` Web log: `device.redeem_rpc_failed` → `GRANT_EXPIRED`.

**Root cause:**

- Enrollment grants default to a **15-minute** TTL. A stale `$env:POLIVO_ENROLLMENT_SECRET` from an earlier Authorize host (while `db:init` was blocked) was past `expires_at` while still `issued`.
- Browser revoke + re-authorize (`POST /devices` 201) created a new grant, but PowerShell still used the old secret.
- CLI `postJson` looked for nested `error.message` while public ApiError is top-level `{ code, message }`, so the mapped validation text never reached the operator. Mapper also collapsed `GRANT_EXPIRED` into a generic enrollment message.

**Fix:**

- `activate-host` reads top-level ApiError `message` / `code`.
- `mapTenantRpcError` returns specific copy for `GRANT_EXPIRED`, `GRANT_NOT_REDEEMABLE`, and `GRANT_NOT_FOUND`.
- Ops guide documents 15-minute TTL, clearing stale env secrets, and expired-Pending recovery.

**Operator verify:**

1. Devices: Revoke expired Pending host (or Cancel unused enrollment) if needed; **Authorize host** once; copy the new secret.
2. PowerShell: `Remove-Item Env:POLIVO_ENROLLMENT_SECRET -ErrorAction SilentlyContinue`, keep `POLIVO_LOCAL_DB_PATH` / base URL / `development`, run `activate-host` and paste the fresh secret within 15 minutes.
3. Devices should show **Activated**. Reuse `C:\PolivoData\stall.sqlite`; do not re-`db:init` unless binding requires a clean DB.

---

## Host redeem `state_revision` ambiguous — 42702 (2026-11-04)

**Symptom:** Fresh `activate-host` with a valid pasted secret returns `Unable to complete the stall administration request. (SERVICE_UNAVAILABLE)`. Web log: `device.redeem_rpc_failed` → Postgres `42702` / `column reference "state_revision" is ambiguous`.

**Root cause:** `redeem_device_enrollment_grant` (and confirm/rotate) use `RETURNS TABLE (… state_revision …)` and `SET state_revision = state_revision + 1`. PL/pgSQL OUT vars clash with `tenant_devices.state_revision`. Authorize/revoke were fine; redeem failed on the bump. Failed redeem rolls back, so the Pending grant stays `issued`.

**Fix:** Forward migration `20261104120000_fix_device_enrollment_state_revision_ambiguity.sql` — `CREATE OR REPLACE` redeem/confirm/rotate using local `v_rev` (same pattern as `revoke_tenant_device`). Pushed to polivo-dev (`jvwjhvouhuvqujuinuoc`).

**Operator verify:** Re-run `activate-host` with the same secret if still within 15 minutes; otherwise Revoke Pending → Authorize host once → activate within 15 minutes. Reuse `C:\PolivoData\stall.sqlite`. Devices should show **Activated**.

---

## Terminal enrollment redeem failed / ECONNREFUSED :3040 (2026-11-04)

**Symptom:** After host Activated, Authorize terminal + paste secret into desktop shows opaque `Terminal enrollment redeem failed.` Web log: `GRANT_NOT_REDEEMABLE`. Other Wi‑Fi PC also hits `ECONNREFUSED 127.0.0.1:3040`. `safeStorage` deprecation warnings only.

**Root cause:**

- Desktop read nested `error.message` while ApiError is top-level `{ code, message }`.
- Each Enroll click minted a new Ed25519 keypair; retries after a consumed grant failed with `GRANT_NOT_REDEEMABLE` / installation mismatch.
- Phase 14 hardcodes host accept to `http://127.0.0.1:3040` (this machine’s loopback). Another PC cannot reach the host stall-service that way.

**Fix:**

- Desktop surfaces top-level ApiError text; reuses stored keypair on mid-enrollment retry; clear message when accept cannot reach the host service.
- Ops guide: first terminal pair on the **host PC** (web + stall-service + desktop); revoke stuck terminals and use a fresh secret.

**Operator verify:**

1. Devices: revoke stuck Waiting / Pending terminals.
2. Host PC: stall-service + `pnpm dev:web` + `pnpm dev:desktop`.
3. Authorize terminal (development) → paste new secret once within 15 minutes → Devices shows terminal Activated / paired.
4. Defer other-PC pairing until LAN host bind exists.


Now: i paste the code in same pc same running code i run in another terminal desktop and and paste the secret key its run and activated the terminal. but i autorize another terminal and  try with another pc that run same code and connect with same wifi  but its not connect its give this error

Enrollment failed
Error invoking remote method 'enrollment:enrollTerminal': Error: The enrollment request could not be completed. (VALIDATION_ERROR)

electron) 'safeStorage.decryptString' is deprecated and will be removed. Please use 'safeStorage.decryptStringAsync' instead.
Error occurred in handler for 'enrollment:enrollTerminal': Error: Enrollment secret was not recognized. (VALIDATION_ERROR)
    at enrollTerminal (file:///E:/Polivo%20Market%20System/polivo-market-system/apps/desktop/out/main/index.js:157:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)       
Error occurred in handler for 'enrollment:enrollTerminal': Error: Enrollment secret is no longer valid (revoked, cancelled, or already used). (VALIDATION_ERROR)
    at enrollTerminal (file:///E:/Polivo%20Market%20System/polivo-market-system/apps/desktop/out/main/index.js:157:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)       
Error occurred in handler for 'enrollment:enrollTerminal': Error: The enrollment request could not be completed. (VALIDATION_ERROR)
    at enrollTerminal (file:///E:/Polivo%20Market%20System/polivo-market-system/apps/desktop/out/main/index.js:157:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)


## Local staff `setup-owner` — Authentication required (2026-11-07)

**Symptom:** After a successful browser `POST /api/tenants/{tenantId}/local-staff/setup-grant`, host `pnpm --filter @polivo/stall-service staff-cli setup-owner OWNER1` fails with `{"ok":false,"error":"Authentication required."}` after pasting the setup grant secret and choosing a local owner secret.

**Root cause:** `staff-cli` redeems at `POST /api/local-staff/setup-grants/redeem` with the one-time setup grant only (no Clerk cookie). `isProtectedPath` treated all `/api/*` as Clerk-protected except `/api/device-enrollment/`, so `proxy.ts` returned 401 before the machine redeem route ran. The owner secret and staff code were unrelated.

**Fix:** Exempt `/api/local-staff/setup-grants/redeem` in `isProtectedPath` (same machine-endpoint pattern as device enrollment). Keep `POST /api/tenants/{tenantId}/local-staff/setup-grant` Clerk + owner protected. Unit tests cover redeem public / authorize protected.

**Operator verify:**

1. Ensure web is running (`pnpm dev:web`) and migration `20261104180000_local_staff_setup_grants` is applied.
2. As owner, issue a **fresh** setup grant (previous secret is fine if redeem never consumed it; issue a new one if unsure).
3. PowerShell with `POLIVO_LOCAL_DB_PATH` set to the stall DB; prefer prompt for the setup grant secret:

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\acceptance-01\stall.sqlite"
$env:POLIVO_ENROLLMENT_BASE_URL = "http://localhost:3000"
pnpm --filter @polivo/stall-service staff-cli setup-owner OWNER1
```

4. Expect `{"ok":true,"staffId":"..."}`. Do not set `POLIVO_SECURE_STORAGE=simulated` for this path.

**Note:** Desktop staff sign-in after redeem was later unblocked by ADR 0013 production offline durations (see below).

## Local staff `activate-staff` — capabilities JSON / PowerShell (2026-11-07)

**Symptom:** `staff-cli activate-staff ... '[\"payments...\"]' ...` prompts for the secret, then fails with `Unexpected token 'p', "[payments.r"... is not valid JSON`. Logged argv shows capabilities as `[payments.receive_trader,...]` (inner quotes stripped).

**Root cause:** Bash-style single-quoted JSON through **PowerShell → pnpm → cmd** loses the `"` around capability ids. `JSON.parse` ran on invalid text before `activateLocalStaff` / `areKnownCapabilities`. Membership id and secret were unrelated.

**Fix:** `parseCapabilitiesArgv` accepts valid JSON arrays and recovers shell-mangled `[cap1,cap2]` / comma lists; clearer errors point at Windows quoting. Ops guide documents escaped multi-cap PowerShell examples. Capability catalog and auth checks unchanged.

**Operator verify** (`POLIVO_LOCAL_DB_PATH` set; local owner already set up):

```powershell
pnpm --filter @polivo/stall-service staff-cli activate-staff CASH1 mem_127e740cc9f34c80a80cab4ce7f20749 "[\"payments.receive_trader\",\"payments.pay_farmer\",\"payments.record_cheque\",\"reports.view_financial\"]" 1 "Cashier One"
```

Expect `{"ok":true,"staffId":"..."}`. Desktop sign-in requires ADR 0013 production offline policy (see below).

## Desktop staff sign-in — Stall access needs an online refresh (2026-11-07) — resolved for acceptance

**Symptom:** After successful `setup-owner` / `activate-staff`, desktop sign-in showed **Action failed / Stall access needs an online refresh.**

**Root cause:** Composition defaulted to ADR 0011 `productionFailClosedOfflineAccessPolicy`, which refuses every new session until product durations were approved. Credentials and device proof were unrelated.

**Fix:** ADR [0013](../decisions/0013-local-staff-offline-access-durations.md) — production policy **2h idle / 12h absolute / 7d snapshot / first login offline allowed**. Trusted permission refresh grants replace argv-only `refresh-permissions`. Composition default is `createProductionOfflineAccessPolicy`. Fail-closed object kept for explicit tests only.

**Acceptance (2026-11-08):** Operator-reported Phase 14–16 single-PC checklist included successful local staff desktop sign-in under the production policy. Treat this login blocker as **resolved for acceptance**.

**Still open for full production readiness (not this blocker):** real DPAPI/`safeStorage` reopen evidence; offline cloud-revoke lag until Phase 33; two-PC LAN (documented in ADR 0013 / ops / progress tracker).