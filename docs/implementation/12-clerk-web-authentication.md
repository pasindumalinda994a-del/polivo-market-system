# 12 — Clerk Web Authentication

## Goal

Implement online authentication for the Polivo Next.js application using Clerk.

Connect authenticated users to the Supabase tenant-isolation foundations from phase 11.

Deliver:

- Sign-in and account flows.
- Protected dashboard routes.
- Server-side identity verification.
- Request-scoped Supabase access using the signed-in user’s identity.
- Safe handling of users without stall membership.
- Authentication and tenant-access tests.

Do not implement stall onboarding, invitations, staff permissions, or desktop authentication yet.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect phase 11’s migrations, membership policies, and cloud client factories.
4. Inspect existing web routes, layouts, environment validation, and tests.
5. Verify the installed Next.js version and current Clerk SDK compatibility.
6. Mark phase 12 as in progress.

Check current official Clerk, Next.js, and Supabase documentation before implementing SDK integration.

Use the supported native Clerk–Supabase third-party authentication integration.

Do not introduce the deprecated Supabase JWT-template approach.

### Verify Existing Setup

Check whether:

- Development Clerk keys are configured.
- The intended Supabase development project is configured.
- Clerk–Supabase integration is enabled.
- Required cloud migrations are applied to the selected test environment.
- Local Supabase configuration references the real development Clerk issuer rather than an example domain.

Inspect configuration without printing secret values.

Do not assume setup is complete merely because environment-variable names exist.

If external configuration is missing, continue independent implementation and report the exact blocked verification.

## Architecture Boundaries

Clerk authenticates online web users.

Supabase membership policies determine which tenant data those users can access.

These are separate checks:

- A valid Clerk session identifies the user.
- An active Polivo membership authorizes access to a stall.

Signing in must not automatically create a tenant or grant ownership.

The local desktop application continues to use the planned local staff sessions and device credentials.

Do not add Clerk to the desktop or stall service.

## 1. Install and Configure Clerk

Install the compatible Clerk Next.js SDK in:

`apps/web`

Preserve existing dependency and workspace conventions.

Wrap the appropriate application layout with `ClerkProvider`.

Requirements:

- Reuse documented environment-variable names.
- Keep secret keys server-only.
- Do not place credentials in source files.
- Do not initialize a second authentication provider.
- Do not introduce Supabase Auth sign-in alongside Clerk.

Use the current supported APIs for the installed SDK.

Do not copy outdated examples without verifying them.

## 2. Define Public and Protected Routes

Create a clear route-access map.

Public routes should include only explicitly intended pages, such as:

- The existing public home page.
- Sign-in.
- Sign-up, if account creation is enabled.
- Required authentication callbacks or verification routes.

Protect:

- The dashboard.
- Tenant-scoped application pages.
- Private API routes.
- Server actions that access protected data.

For the installed Next.js version, use its supported request-protection entry point. If it uses `proxy.ts`, place it correctly for the existing `src` structure.

Do not create both competing middleware and proxy implementations.

### Server Enforcement

Request-level protection is not the only authorization boundary.

Verify identity again where protected data is accessed:

- Server-side data helpers.
- Route handlers.
- Server actions.

Client-side visibility checks are presentation only.

Do not rely solely on a dashboard layout to protect independently callable endpoints.

## 3. Build Sign-In and Account Pages

Use Clerk’s supported components for:

- Sign-in.
- Account creation, when enabled.
- Verification and recovery flows.
- User profile and sign-out controls.

Do not build custom password handling.

### Design

Follow the shared Polivo light design system.

Use:

- Existing color tokens.
- Existing spacing and typography.
- A compact, accessible layout.
- Clear headings and short explanatory text.

Do not introduce a new auth-page theme.

On wider screens, a restrained brand/content panel is acceptable if consistent with `ui-context.md`.

On small screens, prioritize the authentication form.

Avoid decorative dashboard mockups, fabricated statistics, and excessive marketing content.

### Account Scope

Web registration creates an online account only.

It does not register a farmer or trader.

Farmers and traders remain records created by stall staff through the desktop application.

Do not create public farmer/trader approval flows.

## 4. Implement Safe Redirect Behavior

After successful authentication:

- Return the user to an eligible protected destination when supplied.
- Otherwise use the dashboard as the default destination.

Validate any application-managed return path.

Allow only approved same-origin paths.

Reject external URLs, protocol-relative URLs, and malformed redirect targets.

Avoid redirect loops between:

- Sign-in.
- Dashboard.
- Membership-required states.

After sign-out, return to an appropriate public page and clear application-owned user-specific client state.

Use Clerk’s supported session lifecycle rather than manually deleting its cookies.

## 5. Add Server-Side Identity Helpers

Create focused helpers for:

- Requiring an authenticated web user.
- Obtaining the verified Clerk subject.
- Obtaining a current session token for Supabase access.
- Producing a safe public authentication error.

Requirements:

- Verify identity through the Clerk SDK.
- Do not accept user IDs from request bodies or query parameters.
- Do not manually decode a token and treat its contents as verified.
- Keep Clerk subjects as opaque strings.
- Do not use email addresses as authorization identifiers.
- Do not return session tokens to application pages or custom diagnostic endpoints.

For requests without a valid session:

- Pages should redirect appropriately.
- APIs should return an HTTP 401 response using the shared error convention.

Distinguish authentication failure from an upstream service outage.

## 6. Connect Clerk Identity to Supabase

Reuse phase 11’s user-context client factory.

Pass the current Clerk session token through the supported Supabase integration mechanism.

Requirements:

- Use a request-scoped client on the server.
- Acquire a fresh token through the SDK when required.
- Do not cache one user’s token globally.
- Do not use service-role or administrative credentials for dashboard reads.
- Do not fall back to privileged access when a token or policy check fails.
- Do not introduce a separate Supabase login session.

Verify that the token issuer, subject, and required claims match the configured integration and existing policies.

If phase 11’s identity assumptions conflict with the supported integration, document the mismatch and add a focused forward migration where necessary.

Do not weaken RLS to make authentication appear functional.

## 7. Implement Membership Resolution

Create a server-side helper that retrieves the authenticated user’s active memberships through the user-context Supabase client.

Return only the information needed by the current shell.

Handle:

- No active memberships.
- One active membership.
- Multiple active memberships.
- Inactive or revoked membership.
- Database or integration failure.

Do not treat an empty result and a failed query as the same condition.

### Tenant Selection

If a route or request specifies a tenant:

- Validate the identifier.
- Verify active membership.
- Apply tenant scope to the query.
- Keep RLS enforcement intact.

Do not trust a selected tenant stored in a cookie, URL, local storage, or client state without server validation.

Do not automatically select an arbitrary first tenant when several exist.

For now, a simple membership overview may link to eligible tenant contexts. Full switching and onboarding workflows belong to phase 13.

## 8. Update the Dashboard Shell

Replace the anonymous dashboard placeholder with authenticated account presentation.

Include:

- Clerk’s user/account control.
- A clear signed-in state.
- The appropriate membership state.

### No Membership

Show a straightforward message such as:

`Your account is signed in, but it is not connected to a stall yet.`

Do not display a working “Create stall” action until phase 13 implements it.

Do not silently grant owner access.

### Active Membership

Show only verified stall information permitted by the current schema.

Keep reports and operational features as clearly unavailable until implemented.

Do not fabricate financial values or synchronization status.

### Access Denied

Provide a concise access-denied state for an authenticated user who cannot access the requested tenant.

Avoid exposing whether an unrelated tenant or record exists.

## 9. Prevent Cross-User Caching

Review server rendering, data fetching, and client state.

Requirements:

- Do not put authenticated responses into a shared public cache.
- Do not memoize membership results across users.
- Do not prerender private tenant data at build time.
- Scope any legitimate cache to the user and tenant.
- Recheck authorization when accessing protected data.
- Clear application-owned user-specific client state on account changes and sign-out.

Use configuration supported by the installed Next.js version.

Do not assume request-scoped SDK usage alone makes every downstream cache safe.

## 10. Handle Errors and Session Changes

Provide clear behavior for:

- Expired sessions.
- Missing sessions.
- Invalid tokens.
- Supabase rejecting the token.
- Missing membership.
- Revoked membership.
- Temporary Clerk or Supabase unavailability.

Requirements:

- Never display protected data after a failed access check.
- Do not expose raw SDK errors, tokens, SQL, or environment values.
- Preserve protected diagnostics in server logs with sensitive fields redacted.
- Avoid infinite retries.
- Provide a reasonable retry or sign-in action where appropriate.

Document that revocation behavior depends on the actual session and authorization mechanisms. Do not claim instantaneous revocation without verifying it.

Current membership must be checked through the approved database policies.

## 11. Keep Account Lifecycle Scope Minimal

Do not add Clerk webhooks unless an implemented requirement needs persisted identity synchronization.

Authentication and membership lookup should not depend on an unnecessary duplicate user-profile table.

If an existing accepted design requires a webhook now:

- Verify its signature.
- Make event processing idempotent.
- Handle out-of-order delivery deliberately.
- Do not trust an unsigned request.
- Do not cascade-delete financial history when an online account is removed.

Otherwise, document webhook-based profile synchronization as deferred.

Tenant lifecycle and ownership transfer belong to phase 13.

## 12. Update Authentication Tests

Extend the existing test setup.

### Deterministic Tests

Test:

- Unauthenticated protected-page access.
- Unauthenticated API access.
- Safe redirect validation.
- No-membership presentation.
- Active membership resolution.
- Inactive membership denial.
- Cross-tenant access denial.
- Database failure remaining distinct from “no membership.”
- User-specific client creation.
- Absence of privileged-client fallback.

Use test adapters only within test composition.

Do not add a production authentication bypass controlled by a query parameter, header, or public environment variable.

### Web End-to-End Tests

Update the existing dashboard tests for its new protected status.

Verify:

- Public home remains accessible.
- Protected dashboard access redirects to sign-in.
- Sign-in renders with the Polivo theme.
- Signed-in users can reach the appropriate account/membership state.
- Sign-out prevents subsequent protected access.
- Untrusted redirect destinations are rejected.

Use official Clerk testing support where appropriate.

Do not remove meaningful assertions simply because authentication introduces additional setup.

## 13. Verify Real Clerk–Supabase Integration

Use dedicated development accounts and synthetic tenant fixtures.

Verify separately from mocked tests:

- A real Clerk session obtains a token accepted by the configured Supabase project.
- The token’s subject matches the membership identity.
- A user can read only authorized tenant records.
- A user with no membership receives no protected records.
- A forged or invalid token is rejected.
- An active member cannot mutate synchronized financial tables.
- Membership removal blocks subsequent protected reads.

Fixture creation may use an explicit administrative test setup.

The application requests under test must use the authenticated user’s token.

Never use administrative access as evidence that RLS works.

Do not store passwords, reusable sessions, or authentication-state files in Git.

If real integration cannot be tested, report the exact missing setup and leave that verification incomplete.

## 14. Keep CI and Secrets Separated

Maintain two clear verification categories:

1. Deterministic tests that run without external account credentials.
2. Real authentication integration tests using dedicated development resources.

Do not make untrusted pull-request jobs depend on privileged secrets.

Do not silently skip required tests while reporting the entire phase as verified.

Keep authentication traces, screenshots, and saved browser state out of public artifacts when they contain sensitive data.

Do not run live integration tests against production accounts or production financial data.

## 15. Update Documentation

Create:

`docs/operations/web-authentication.md`

Document:

- Public and protected routes.
- Clerk environment configuration.
- Native Clerk–Supabase integration requirements.
- Server identity helpers.
- Membership resolution.
- Safe redirect behavior.
- Cache boundaries.
- Sign-out behavior.
- Local and CI test commands.
- Real integration verification.
- Deferred onboarding and account lifecycle work.

Update environment examples using actual variable names from the implementation.

Keep example values sanitized.

Do not overwrite existing real environment files.

## Scope Limits

For this phase:

- Do not implement stall creation or invitations.
- Do not implement ownership transfer.
- Do not implement editable staff permissions.
- Do not implement public farmer/trader registration.
- Do not add Clerk to Electron or the stall service.
- Do not implement device provisioning or offline login.
- Do not implement dashboard financial reports.
- Do not allow cloud financial mutations.
- Do not implement synchronization.
- Do not deploy, commit, or push automatically.

## Check When Done

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:db-cloud`
- `pnpm build`
- `pnpm test:e2e:web`
- `pnpm check`

Run the existing Electron smoke test if shared dependencies or UI integration changed.

Also verify:

- Protected data access requires server-verified identity.
- Membership and RLS checks remain active.
- No privileged Supabase credential enters browser or desktop output.
- No authenticated user data is publicly cached.
- No automatic tenant or owner membership is created.
- Local stall-service operation remains independent of Clerk availability.
- Real integration results are reported separately from mocked tests.

Review `git diff` and `git status --short`.

Do not claim authentication is fully verified solely because the web build passes.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Clerk SDK and routes implemented.
- Server identity and membership helpers.
- Supabase integration behavior.
- Tests and build results.
- Real integration verification status.
- Remaining dashboard or environment setup.
- Readiness for phase 13, `13-tenant-onboarding-and-role-management.md`.

Do not mark tenant onboarding, local authentication, or permission synchronization complete.

## Completion Report

Provide:

1. Files and authentication routes created or updated.
2. Signed-in, signed-out, and no-membership behavior.
3. Clerk–Supabase integration status.
4. Automated and real integration test results.
5. Remaining manual setup or blockers.
6. Whether phase 13 can begin.