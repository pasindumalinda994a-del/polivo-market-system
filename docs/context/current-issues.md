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
