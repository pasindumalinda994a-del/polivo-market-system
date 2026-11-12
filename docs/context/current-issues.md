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

## OWNER1 cannot access Farmers — empty owner snapshot (2026-11-09)

**Symptom:** Signed in as local owner `OWNER1`, Farmers shows “Farmers unavailable — This staff account does not include `parties.register_edit`.”

**Root cause:** Cloud first-owner setup grant and owner permission refresh deliberately return `capabilities: []` (ADR 0009 — cloud ownership is not an operational capability grant). `setupFirstLocalOwner` stored that empty array as the local snapshot. Phase 17 Farmers UI and `/farmers` routes require `parties.register_edit`, and local auth/session only read the snapshot — they did not expand `is_local_owner` to the operational catalog.

**Fix:**

- Domain helper `effectiveLocalCapabilities`: local owner → full `PERMISSION_CAPABILITIES`; others → snapshot.
- Wired into `createLocalStaffAuthorizationAdapter` and `GET /local-auth/session`.
- Cloud / stored owner snapshots remain `[]`; expansion is enforcement-time only.

**Operator verify:**

1. Restart or keep running stall-service with the updated code (no DB wipe / remigration).
2. Desktop: Sign out OWNER1 → Sign in again (session must refresh capabilities).
3. Open Farmers → expect list + Add Farmer available; create a synthetic farmer (e.g. `TF1` / Test Farmer A).
4. Sign in as a cashier without `parties.register_edit` → Farmers still unavailable.

## Phase 21 — Farmer account “Device proof is invalid” (2026-11-10)

**Symptom:** Creating and listing farmers works, but opening a farmer’s account shows “Device proof is invalid.” Expected for a new farmer: balance Rs. 0.00, Settled, Not opened. Blocked opening-balance testing.

**Root cause:** Account routes authorized device proofs against Fastify **route templates** (e.g. `/accounts/:partyKind/:partyId/balance`) while the desktop client signed the **concrete** path (e.g. `/accounts/farmer/<id>/balance`). Ed25519 verification failed. Farmer routes already used concrete paths, so CRUD worked on the same session. Integration tests used the test auth adapter and did not exercise real path-bound proofs. A secondary client issue appended movement query strings into the signed path.

**Fix:**

- Stall-service `account-routes.ts`: bind authorize/command proof paths to concrete request paths (farmer/buyer pattern). Verification unchanged — not weakened.
- Desktop `accounts.ts`: drop `encodeURIComponent` on opaque ids; pass movements `limit`/`cursor` via `query:` so they are not part of the signed path.
- No database reset or re-enrollment required.

**Operator verify:**

1. Restart stall-service (so updated routes load) and restart/reload desktop. *(Done 2026-11-10: service restarted on `C:\PolivoData\acceptance-01\stall.sqlite`; desktop relaunched.)*
2. Sign in as staff with `accounts.view` (owner after re-sign-in is enough).
3. Farmers → Select a farmer with no ledger history → account panel should show **Rs. 0.00**, **Settled**, **Not opened** (not “Device proof is invalid”). Acceptance DB farmer `P21F1` has zero `party_accounts` / drafts / ledger rows.
4. Optionally open movements; should load without device-proof errors.

**Automated verify (2026-11-10):** `tests/integration/stall-service.accounts-openings.test.ts` — real Ed25519 device proofs: concrete balance/movements paths return Settled / not_opened / empty movements; signing the Fastify template path still returns 401 “Device proof is invalid.”

## Buyer finalize stuck on “Still checking…” after account-not-ready (2026-11-11)

**Symptom:** Buyer billing shows “Still checking whether the bill was finalized” after initially failing with “Farmer account is not ready for operational posting.” Completing the farmer’s opening and retrying does not clear it. `GET /sales/finalizations/:key` returns 404; `GET /sales/drafts/:id` returns 200 (still draft). Status remains unconfirmed.

**Root cause:** Desktop wrote finalize recovery metadata **before** POST. Finalize rejected with CONFLICT before commit (no idempotency row). The conflict branch always called `resolveFinalization`; lookup 404 + draft still present set `finalization_outcome_unknown` and **never cleared** recovery. Remount re-entered the trap from `userData/billing-recovery/finalize-in-flight.json`. Opening the farmer account fixed the server gate only.

**Fix:**

- Classify completed finalize failures: clear recovery on definite pre-commit rejects (account not ready, stale calculation, validation); keep recovery + lookup only for ambiguous outcomes (timeout/network, idempotency key already in use, already-finalized races).
- Helpers in `apps/desktop/src/renderer/src/billing/finalize-failure.ts`; wired in `BillingPanel.tsx`.

**Operator unblock (already stuck before this fix):**

1. Quit desktop fully.
2. Delete or empty `%APPDATA%\<desktop app userData>\billing-recovery\finalize-in-flight.json`.
3. Relaunch, sign in, open the draft, ensure farmer (and buyer) accounts are opened, Review → Finalize.

**Operator verify (after update):**

1. Restart/reload desktop with the new build.
2. Draft a bill whose farmer account is **not** opened → Finalize → expect the account-not-ready message and return to review (not “Still checking…”).
3. Open the farmer account → same draft Review → Finalize → bill issues; recovery file cleared.
4. Timeout/network simulation (if available) should still enter the check-finalization path.

---

## Phase 24 — Cannot open Farmer bills (2026-11-11)

**Symptom:** Buyer billing opens, but clicking the second sidebar icon (**Farmer bills**) does nothing. Phase 24 UI unreachable.

**Root cause:** `FarmerBillingPanel` and the nav item (`id: "farmer-bills"`) were implemented, but `App.tsx` `onNavigate` used a hardcoded allowlist that omitted `farmer-bills`, so `setActiveView` never ran.

**Fix:** Navigate via a type-safe `DesktopView` membership check (`isDesktopView`) so all registered views, including `farmer-bills`, switch correctly.

**Operator verify:**

1. Reload/restart desktop (`pnpm dev:desktop`).
2. Sign in with billing capabilities.
3. Click **Farmer bills** in the left rail → expect the farmer sales / bill workspace (not stuck on Billing).
4. If unsigned or missing `bills.*`, the panel still opens but may show its host/permission empty state — that is separate from the nav no-op.

## Phase 27 migration 013 — FOREIGN KEY constraint failed (2026-11-11) — resolved

**Symptom:** On acceptance DB with existing Phase 26 payments:

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\acceptance-01\stall.sqlite"
pnpm --filter @polivo/db-local db:migrate
```

failed with `Migration "013" (cheque_payments_and_handover) failed and was rolled back: FOREIGN KEY constraint failed`.

**Root cause:** The migration runner wraps each migration in `BEGIN IMMEDIATE`. SQLite ignores `PRAGMA foreign_keys = OFF` inside an open transaction, so FK enforcement stayed ON. The original 013 rebuilt `payments` then `DROP TABLE payments` while `payment_allocations` still referenced it. Empty/fresh DBs passed; acceptance data did not. Rollback meant 013 was never recorded, so rewriting the unapplied SQL was safe.

**Fix:** Rewrote `013_cheque_payments_and_handover.sql` to copy into `payments_new` + `payment_allocations_new`, drop the **child** table first, then the parent, rename both, and recreate indexes/triggers — without relying on mid-transaction FK disable. Added a db-local regression test that seeds a payment+allocation under migrations through 012, then applies 013.

**Operator verify (done 2026-11-11):** Rebuilt `@polivo/db-local`, re-ran migrate on `C:\PolivoData\acceptance-01\stall.sqlite` → `013` newly applied; `db:status` shows pending `[]`. Restart stall-service + desktop before Phase 27 cheque smoke. 


---

## Desktop white screen — Phase 29 `node:crypto` in `@polivo/domain` (2026-11-12) — resolved

**Symptom:** `pnpm dev:desktop` opened a full white screen. Console:

```
Uncaught Error: Module "node:crypto" has been externalized for browser compatibility.
Cannot access "node:crypto.createHash" in client code.
    at printing.ts:1:28
```

**Root cause:** Phase 29 `packages/domain/src/printing.ts` imported `node:crypto` for `hashPrintPayload` and re-exported it from the `@polivo/domain` barrel. The Electron renderer already imports that barrel for billing/weight/commission helpers, so Vite evaluated `printing.ts` in browser context and crashed before React mounted.

**Fix:**

- Domain keeps browser-safe `buildPrintPayloadHashMaterial` (stable JSON only).
- Stall-service `print-commands.ts` hashes with local `createHash("sha256")` (same pattern as sale/payment fingerprints).
- Domain barrel no longer imports Node builtins for printing.

**Operator verify (done 2026-11-12):** Rebuilt `@polivo/domain`; domain printing tests + stall-service print-commands tests passed; service/desktop typecheck clean. Running `pnpm dev:desktop` HMR-reloaded renderer panels without the `node:crypto` crash.



---

## Settings → Printing — Invalid stall print identity response (2026-11-12) — resolved

**Symptom:** Settings → Printing showed `Invalid stall print identity response.` on Save and after reopen; name/address stayed empty. Stall-service logged `GET`/`PUT` `/print/stall-identity` → 200.

**Root cause:** Stall-service returns `{ identity: { displayName, address, updatedAt } | null }`. Desktop main `parseStallPrintIdentity` expected a flat body with top-level `displayName` and `configured`, so every successful HTTP response failed client-side parsing. PUT could still write SQLite; the UI never accepted the body.

**Fix:**

- Shared `upsertStallPrintIdentityRequestSchema` / `stallPrintIdentityResponseSchema` in `@polivo/contracts`.
- Stall-service uses those schemas (no local duplicates).
- Desktop maps nested `identity` to UI fields (`configured = identity !== null`).
- Parse failures return `INVALID_RESPONSE` (not `SERVICE_UNAVAILABLE`); Printing settings surfaces load errors and applies saved identity after Save.

**Operator verify (dev checks 2026-11-12):** Rebuilt `@polivo/contracts`; contracts printing tests (5) + stall-service print-commands (14) passed; stall-service + desktop typecheck clean. Restart/reload desktop main (Electron) so `printing.ts` picks up the nested parser, then Settings → Printing → save name/address → reopen → fields should persist.



## Desktop `spawn UNKNOWN` — Device Guard / WDAC blocks `electron.exe` (2026-11-12) — open (policy)

**Symptom:** `pnpm dev:desktop` builds main + preload and starts Vite (`http://localhost:5173/`), then fails before the Electron window:

```
error during start dev server and electron app:
Error: spawn UNKNOWN
    at ChildProcess.spawn (node:internal/child_process:486:11)
    at startElectron (.../electron-vite/.../lib-DoUt4oMD.js:287:16)
```

**Not the cause:** Phase 30 report code, missing `path.txt`, or “Electron uninstall”. Main/preload compile successfully; `apps/desktop/node_modules/electron` resolves to `electron@45.1.0` with `dist/electron.exe` present (~250 MB).

**Root cause:** Windows **Device Guard / WDAC** (user-mode Code Integrity **enforced**) blocks launching the Electron binary. Direct evidence:

- `Start-Process` / `cmd` → `An Application Control policy has blocked this file` / `blocked by your organization's Device Guard policy`
- `Get-AuthenticodeSignature` on `electron.exe` → `NotSigned` (does not meet **Enterprise signing level**)
- `Win32_DeviceGuard`: `CodeIntegrityPolicyEnforcementStatus = 2`, `UsermodeCodeIntegrityPolicyEnforcementStatus = 2`
- Event log `Microsoft-Windows-CodeIntegrity/Operational` Id **3033/3077**: `node.exe` / `powershell.exe` attempted to load `...\electron@45.1.0\...\dist\electron.exe` that **did not meet the Enterprise signing level requirements**

Node `spawn UNKNOWN` (`errno: -4094`) is the opaque wrapper around that CreateProcess / Code Integrity denial.

**Tried (insufficient without policy change):**

1. Cleared `ELECTRON_EXEC_PATH`; no leftover Electron processes
2. Forced Electron re-download via `node node_modules/electron/install.js` (binary restored; still blocked)
3. `Unblock-File` on `dist\*` (Mark-of-the-Web only — does not bypass WDAC)
4. Copy to `C:\PolivoData\tools\electron-dist` — still blocked by the same Enterprise signing rule

**Remediation (operator / IT — required to run desktop again):**

1. Ask IT for a **WDAC / Application Control** exception so local Electron can run, for example:
   - Allow publisher / path for  
     `...\node_modules\.pnpm\electron@45.1.0\node_modules\electron\dist\electron.exe`  
     (and DLLs in that `dist` folder), or
   - A developer supplemental policy that permits Electron / Node toolchain binaries under this repo
2. After the policy update, verify:
   ```powershell
   & ".\node_modules\.pnpm\electron@45.1.0\node_modules\electron\dist\electron.exe" --version
   pnpm --filter @polivo/desktop exec electron --version
   pnpm dev:desktop
   ```
3. Do **not** treat this as a Phase 30 application bug; stall-service and web can continue while desktop is blocked.

**Operator verify (pending policy allow):** Electron `--version` prints; `pnpm dev:desktop` opens a window without `spawn UNKNOWN`. 