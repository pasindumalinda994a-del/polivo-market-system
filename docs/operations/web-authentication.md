# Web Authentication

Phase 12 online authentication for `@polivo/web` using Clerk, connected to Supabase tenant isolation from phase 11.

## Boundaries

- Clerk authenticates online web users.
- Supabase membership policies authorize stall/tenant access.
- Signing in does **not** create a tenant or grant ownership.
- Desktop and stall-service authentication remain local and independent of Clerk.
- Web registration creates an online account only. Farmers and traders are still created by stall staff on the desktop app.

## Public and protected routes

| Route                  | Access                                            |
| ---------------------- | ------------------------------------------------- |
| `/`                    | Public                                            |
| `/sign-in`, `/sign-up` | Public authentication                             |
| `/dev/ui`              | Development preview only (404 in production)      |
| `/dashboard`           | Authenticated                                     |
| `/tenants/[tenantId]`  | Authenticated + active membership for that tenant |
| `/api/auth/session`    | Authenticated API probe (no tokens returned)      |

Request protection lives in `apps/web/src/proxy.ts` (`clerkMiddleware` for Next.js 16). Server helpers re-verify identity before reading protected data. Client-side UI checks are presentation only.

## Environment configuration

Documented in [environment-configuration.md](./environment-configuration.md). Required names:

| Variable                               | Public | Purpose                      |
| -------------------------------------- | ------ | ---------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`    | Yes    | Clerk browser SDK            |
| `CLERK_SECRET_KEY`                     | No     | Clerk server verification    |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`        | Yes    | `/sign-in`                   |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`        | Yes    | `/sign-up`                   |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes    | User-context Supabase client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes    | User-context Supabase client |

`SUPABASE_SECRET_KEY` and `DATABASE_URL` are not used for dashboard reads. Authenticated reads use the Clerk session token through `@polivo/db-cloud` `createUserSupabaseClient`.

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill development values. Do not commit real credentials.

## Native Clerk–Supabase integration

Use the supported third-party authentication integration (Clerk session token with `role: authenticated`).

Do **not** use the deprecated Clerk Supabase JWT-template approach.

Local Supabase CLI configuration:

```toml
[auth.third_party.clerk]
enabled = true
domain = "<your-clerk-frontend-api-host>"
```

Remote Supabase projects must add Clerk as a third-party provider with the same domain. Cloud migrations from `supabase/migrations` must be applied before membership queries succeed.

Server wiring:

1. `auth()` from `@clerk/nextjs/server` verifies the session.
2. `(await auth()).getToken()` supplies the session token.
3. `createRequestUserSupabaseClient()` passes that token into `createUserSupabaseClient({ accessToken })`.
4. RLS policies match `auth.jwt()->>'sub'` to `tenant_memberships.external_subject`.

### Required session-token claims for invitations

Clerk’s default session token does **not** include email. Invitation acceptance reads verified email from `auth.jwt()` inside `accept_tenant_invitation` (`polivo_jwt_verified_email`). Without these claims, accept fails with `EMAIL_NOT_VERIFIED`.

Configure this in the **Clerk** Dashboard (not Supabase) → **Sessions** → **Customize session token**. Use Clerk’s real shortcodes — `{{user.email_verified}}` is valid; `{{user.primary_email_address_verified}}` is **not**:

```json
{
  "role": "authenticated",
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}"
}
```

Keep the Supabase integration `role: authenticated` claim in the same object. After saving, sign out and sign in again so a new session token is issued. Invite the recipient’s exact primary Clerk email (normalized case-insensitive match).

The invitee’s primary email must be **verified** in Clerk. Accept preflight trusts Clerk `currentUser()` when that primary email is verified, even if the session claim `email_verified` is a non-canonical string. Explicit `email_verified: false` still blocks. If accept fails, confirm Users → invitee email is Verified, invite email matches exactly, then sign out/in and retry with a fresh invite link.

## Server identity helpers

Located under `apps/web/src/lib/auth/`:

| Helper                                          | Role                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| `requirePageUser` / `requireApiUser`            | Verified Clerk subject; redirect or HTTP 401          |
| `resolveSafeRedirectPath`                       | Same-origin path-only return URLs                     |
| `createRequestUserSupabaseClient`               | Request-scoped user client                            |
| `listActiveMemberships` / `resolveTenantAccess` | Membership resolution without auto-selecting a tenant |

Rules:

- Never accept user IDs from request bodies or query parameters as identity.
- Keep Clerk subjects opaque.
- Do not return session tokens to pages or custom diagnostic endpoints.
- Distinguish authentication failure (`UNAUTHENTICATED` / 401) from upstream outages (`SERVICE_UNAVAILABLE` / 503).
- Empty membership lists are not treated as query failures.

## Membership resolution

Active memberships require:

- `identity_provider = 'clerk'`
- matching verified subject (via RLS)
- `status = 'active'`
- `access_role = 'reporting_reader'`

Dashboard states:

- **No membership:** signed-in empty state with a create-stall entry point to `/onboarding`.
- **Active memberships:** list verified stalls (display name + role) with links to `/tenants/[tenantId]`. No automatic selection when multiple exist.
- **Access denied:** authenticated user without membership for the requested tenant; do not reveal whether unrelated tenants exist.
- **Unavailable:** cloud/auth integration failure, distinct from “no membership.”

Tenant onboarding, invitations, and owner permission editing are documented in [tenant-onboarding-and-access-management.md](./tenant-onboarding-and-access-management.md). Ownership transfer remains unavailable.

## Safe redirect behavior

After authentication:

- Use a validated `redirect_url` when present.
- Otherwise default to `/dashboard`.
- Reject external URLs, protocol-relative URLs, malformed targets, and `/sign-in` / `/sign-up` loops.

After sign-out, Clerk returns to `/` (`afterSignOutUrl`). Application-owned user-specific client state must be cleared on account changes; do not manually delete Clerk cookies.

## Cache boundaries

- Authenticated pages use `dynamic = "force-dynamic"`.
- Authenticated API responses send `Cache-Control: private, no-store`.
- Do not memoize membership results across users.
- Do not prerender private tenant data at build time.

## Sign-out behavior

Use Clerk’s `UserButton` / session lifecycle. After sign-out, protected routes redirect to sign-in again. Revocation timing depends on Clerk session lifetime and Supabase JWT acceptance; membership removal is enforced on the next membership/RLS check and is not claimed to be instantaneous across all caches without verification.

## Tests

### Deterministic (no live credentials)

```bash
pnpm test --project web
# or
pnpm test
```

Covers redirect validation, require-user behavior, membership outcomes, error mapping, and absence of privileged-client fallback in the request client helper.

### Web end-to-end

```bash
pnpm test:e2e:web
```

Asserts public home access, unauthenticated dashboard redirect, sign-in theme shell, untrusted redirect rejection, unauthenticated API 401, and production `/dev/ui` 404.

Web e2e serves production Next.js on `http://localhost:3100` (hostname `localhost`, not `127.0.0.1`). Clerk with the Next.js 16 `proxy.ts` entry can self-proxy or hang when the request host is `127.0.0.1`.

Signed-in Playwright flows that depend on Clerk testing tokens or dedicated fixtures are optional and must not store passwords or session files in Git.

### Real Clerk–Supabase integration (manual / dedicated development)

Verify separately from mocked tests:

1. A real Clerk session token is accepted by the configured Supabase project.
2. Token `sub` matches membership `external_subject`.
3. Authorized tenant rows are readable; unauthorized rows are not.
4. No-membership users receive no protected records.
5. Invalid tokens are rejected.
6. Active members cannot mutate synchronized financial tables through the user client.
7. Membership removal blocks subsequent protected reads.

Fixture creation may use explicit administrative setup. Application requests under test must use the authenticated user’s token. Never treat service-role access as evidence that RLS works.

If remote migrations, third-party auth activation, or dedicated fixtures are missing, leave this verification incomplete and record the blocker.

## Deferred work

- Ownership transfer and tenant deletion
- Device enrollment / local staff credentials / permission sync (phase 14+)
- Clerk webhooks / duplicated profile tables (not required for membership lookup)
- Desktop and stall-service authentication
- Dashboard financial reports and synchronization
- Cloud financial mutations

## Related docs

- [environment-configuration.md](./environment-configuration.md)
- [cloud-database-and-tenant-isolation.md](./cloud-database-and-tenant-isolation.md)
- [testing-and-ci.md](./testing-and-ci.md) — includes Clerk development secrets required for CI `web-e2e`
- [local-development.md](./local-development.md)
