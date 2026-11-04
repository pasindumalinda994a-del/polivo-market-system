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