# 11 — Supabase Schema and Tenant Isolation

## Goal

Implement Polivo’s cloud database foundations in Supabase PostgreSQL.

Create:

- Versioned cloud migrations.
- Minimal tenant and membership structures.
- Reporting copies of approved core operational tables.
- Tenant-isolation policies.
- Server-side database access foundations.
- Automated database isolation tests.

SQLite remains the authoritative source for stall financial operations.

Do not implement synchronization, tenant onboarding, authentication screens, or remote financial editing.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Review the domain and numeric-representation decisions.
4. Inspect the actual local migrations and phase 10 implementation.
5. Inspect `packages/db-cloud` and existing Supabase configuration.
6. Verify which development/staging resources and environment settings exist without printing secrets.

Check current official Supabase, PostgreSQL, and Clerk integration documentation before choosing configuration or authentication-policy patterns.

Do not assume Clerk identities are Supabase Auth UUIDs.

Mark this phase as in progress in the progress tracker before implementation.

## Architecture and Scope

Use these ownership rules:

| Data | Authority |
| --- | --- |
| Tenant accounts and online membership | Cloud |
| Local sales, bills, payments, and commission results | Stall SQLite |
| Synchronized operational reporting records | Cloud reporting copy |
| Device enrollment and remote permission configuration | Later dedicated phases |

The initial operational schema must follow the core tables already implemented locally.

Do not add arrivals, inventory, local staff/device management, detailed permissions, or general-ledger tables simply because earlier roadmap drafts mentioned them.

Minimal cloud membership records are required for tenant isolation. They do not implement the complete staff-permission system.

Preserve these product decisions:

- Farmers and traders are registered through the stall desktop application.
- Do not add public farmer/trader approval workflows.
- Do not add lorry-owner fields.
- Do not add cheque-clearance tracking.
- Do not introduce unapproved category-specific commission overrides.

## 1. Initialize the Cloud Database Package

Work inside:

`packages/db-cloud`

Preserve the package name:

`@polivo/db-cloud`

Create focused areas for:

- Cloud database types.
- Server-side client factories.
- Exact numeric mapping.
- Database tests or their supporting helpers.
- Public package exports.

Use the repository’s existing build and type-check conventions.

Choose one canonical location for Supabase CLI configuration and SQL migrations.

Document that location clearly.

Do not maintain duplicate migrations in both the package and another directory.

### Package Boundaries

Privileged database clients must remain server-side.

Do not import them into:

- React client components.
- Electron main, preload, or renderer.
- Shared UI.
- Domain or contracts packages.

If generated database types are needed outside server code, expose them through a separate type-only entry point.

Do not make browser bundles import a module that initializes privileged credentials.

## 2. Establish Reproducible Migrations

Use versioned SQL migrations compatible with the selected Supabase tooling.

Requirements:

- Reconstruct the schema from a clean test database.
- Track applied migrations.
- Preserve already-applied migrations.
- Add forward migrations for changes.
- Keep test fixtures separate from production migrations.
- Do not reset shared development, staging, or production databases.
- Verify the target project before any remote migration.

Prefer local or disposable test databases for implementation and verification.

If remote application has not been authorized or the intended target cannot be established, prepare and test migrations locally and report the remaining application step.

Do not require production credentials for ordinary builds or pull-request tests.

## 3. Define Minimal Tenant and Membership Tables

Create a tenant table with an internal stable identifier and the minimal lifecycle metadata needed for isolation.

Create a membership table linking:

- Tenant ID.
- External identity provider.
- External user subject.
- Membership status.
- The minimal approved access role or reporting capability.

Requirements:

- Preserve Clerk subjects as opaque strings.
- Do not cast Clerk user IDs to UUID.
- Do not use email addresses as authorization keys.
- Enforce unique membership within the chosen identity scope.
- Distinguish internal tenant IDs from any external organization IDs.
- Do not grant membership automatically because a user supplies a tenant ID.

Tenant creation, invitations, ownership transfer, and role-management workflows belong to phase 13.

Do not expose unrestricted membership mutation.

## 4. Map the Existing Local Schema to Cloud Tables

Create an explicit mapping from local tables and fields to cloud reporting structures.

Cover only the approved core data currently implemented, such as:

- Farmers and buyers/parties.
- Vegetables.
- Sales and bills.
- Sale-line and package details where present.
- Payment records and allocations where present.
- Commission bands or calculation snapshots where present.
- Approved audit metadata.

Preserve internal source IDs.

Do not generate new cloud identities for the same synchronized records.

### Tenant-Safe Relationships

Use keys and foreign keys that preserve tenant ownership.

For example, a child record must reference its parent within the same tenant, not merely reference a globally valid parent ID.

Enforce:

- Tenant identity on every tenant-owned row.
- Parent-child tenant consistency.
- Appropriate uniqueness scopes.
- Approved lifecycle constraints.
- Restrictive deletion behavior for financial history.

Do not add cascading deletion that silently removes financial records when a membership or user account is removed.

## 5. Preserve Exact Financial Values

Follow phase 08’s representation and phase 09’s persistence decisions.

Use appropriate PostgreSQL exact numeric types.

Requirements:

- Do not use floating-point columns for authoritative money or weight.
- Preserve scale, units, and supported bounds.
- Preserve calculation snapshots.
- Test conversions between SQLite representations, PostgreSQL, and JSON.
- Verify how the selected client decodes BIGINT and NUMERIC values.
- Do not assume database precision guarantees JavaScript precision.

Use explicit string transport or another verified exact mapping where required.

Reject out-of-range or excess-precision values according to the approved policy.

Do not silently round synchronized values differently from their local source.

## 6. Add Minimal Synchronization Metadata

Provide only the schema foundation needed by later ingestion work.

Where justified by existing contracts, include:

- Source record revision.
- Source occurrence/update timestamp.
- Cloud receipt timestamp.
- Event identity and schema version.
- Tenant-scoped uniqueness for received events.

Keep source timestamps distinct from cloud receipt times.

Do not use timestamps alone to decide which financial version is authoritative.

Do not mirror the local delivery queue as an independently managed cloud outbox.

Do not implement:

- Ingestion endpoints.
- Device authentication.
- Event application.
- Retry workers.
- Conflict resolution.
- Synchronization acknowledgements.

Those behaviors belong to phases 31–34.

## 7. Define the Database Access Model

Use authenticated user-context access for tenant-scoped reporting reads.

Reserve privileged access for narrowly controlled server operations implemented in later phases.

Document:

- How a verified Clerk identity reaches Supabase.
- Which verified claim contains the external subject.
- How that subject maps to active membership.
- Which database role executes authenticated requests.
- Which tables are exposed through the Data API.

Use the current supported Clerk/Supabase integration pattern.

Do not implement a custom token-signing workaround.

Do not trust a tenant claim or selected organization alone as proof of access. Check current membership or the approved equivalent.

Clerk application wiring belongs to phase 12. This phase must define and test the database-side identity boundary without pretending the real login integration is complete.

## 8. Implement Grants and Row-Level Security

Enable row-level security on every tenant-owned table exposed through the Data API.

Configure SQL grants as well as policies.

### Reporting Reads

Permit reads only when:

- The request has a verified authenticated subject.
- The subject has active membership in the row’s tenant.
- The membership has the required reporting access.

### Ordinary User Writes

Deny direct user INSERT, UPDATE, and DELETE access to synchronized financial tables.

Do not allow a stall owner to bypass this restriction merely because they own the tenant.

Remote permission administration is a separate future workflow; it does not authorize cloud editing of local bills or payments.

### Membership Access

Use a narrowly scoped membership-read policy that supports the required access check.

Prevent users from:

- Adding themselves to another tenant.
- Changing their own role.
- Reactivating suspended membership.
- Listing unrelated users’ memberships.

Avoid recursive policies that query their own protected table indefinitely.

### Default Denial

Requests with missing identity, inactive membership, or no matching membership must receive no protected data.

Do not rely on the UI to hide records.

## 9. Review Views, Functions, and Privileged Access

Do not assume table RLS automatically protects every view or function.

For each exposed view or function:

- Verify its execution security.
- Verify underlying privileges.
- Test tenant isolation through that access path.

Avoid SECURITY DEFINER helpers unless necessary.

If one is required:

- Keep it narrowly scoped.
- Fix its search path.
- Fully qualify referenced objects.
- Restrict execution grants.
- Derive identity from verified request context.
- Test it for cross-tenant access.

Document that privileged database roles and service credentials can bypass ordinary RLS protections.

Future privileged ingestion must perform its own device, tenant, and payload checks.

Never use a privileged client for ordinary dashboard reads merely to avoid policy errors.

## 10. Add Server-Side Client Foundations

Implement a user-context client factory that accepts the verified token supplied by the future authentication layer.

Requirements:

- Create request-scoped identity context.
- Do not share one user’s token through a mutable global client.
- Do not log tokens.
- Validate required configuration.
- Fail clearly when identity or configuration is missing.
- Do not fall back to privileged access.

Keep privileged client construction absent unless needed for an explicitly implemented server operation.

Migration and test administration can use separately scoped tooling credentials.

Do not add a public diagnostic route that reads tables using an administrative key.

## 11. Configure Environment Boundaries

Update sanitized environment examples and documentation using the actual supported integration names.

Separate:

- Project URL and permitted public configuration.
- User-context authentication.
- Server-only credentials, if required.
- Migration credentials.
- Local test configuration.

Requirements:

- Secret credentials never use a public frontend prefix.
- Desktop builds receive no Supabase administrative credentials.
- Environment validation reports missing names without exposing values.
- Build-time code must not contact the live database unnecessarily.
- Tests must not silently fall back to a remote project.

Document which settings are needed now and which belong to phase 12.

Do not create real credentials or copy them into documentation.

## 12. Defer Object Storage Unless Required

Do not create storage buckets merely because Supabase supports them.

This phase has no confirmed file-upload feature.

If an existing approved requirement makes a bucket necessary now:

- Use private access by default.
- Define tenant-aware storage policies.
- Test listing, reading, uploading, and deletion separately.
- Avoid assuming a tenant folder name proves authorization.

Otherwise, record storage as deferred until its consuming feature exists.

## 13. Add Database Isolation Tests

Run tests against actual PostgreSQL with the relevant Supabase roles and request-identity behavior.

Use at least:

- Tenant A and Tenant B.
- A user with active access to Tenant A.
- A user with active access to Tenant B.
- A user with no membership.
- An inactive membership.
- An unauthenticated request.

### Required Scenarios

Verify that:

- Tenant A’s user can read permitted Tenant A records.
- Tenant A’s user cannot read Tenant B records.
- Knowing a foreign record ID does not grant access.
- Filtering by another tenant ID does not grant access.
- Cross-tenant parent-child references fail.
- Anonymous requests cannot read operational data.
- Inactive membership blocks subsequent authorized reads.
- Users cannot self-create or elevate membership.
- Ordinary users cannot insert, update, or delete financial copies.
- Approved views and functions preserve isolation.
- Exact numeric values survive round trips.
- Duplicate source/event identities fail at the intended uniqueness scope.

Run RLS assertions as the actual restricted roles, not as the database owner or a service role.

Test setup may use administrative privileges to insert fixtures, but assertions must not.

For simulated JWT claims in database tests, clearly label them as policy tests. Real signature/issuer verification will be tested with phase 12’s authentication integration.

## 14. Integrate Cloud Database Testing with CI

Add an isolated cloud-database test command, such as:

`pnpm test:db-cloud`

Use a local Supabase stack or another disposable environment that faithfully supports the policies being tested.

Requirements:

- No shared staging database in pull-request tests.
- No production credentials.
- Deterministic migrations and fixtures.
- Bounded startup waits and job timeouts.
- Reliable teardown.
- Sanitized failure output.
- No silent skipping when the required database suite has zero tests.

Document local container/runtime prerequisites.

If the environment cannot run the database stack, report the limitation. Static SQL inspection is not a passing tenant-isolation test.

Keep the existing SQLite test suites intact.

## 15. Document the Cloud Foundation

Create:

`docs/operations/cloud-database-and-tenant-isolation.md`

Include:

- Canonical migration location.
- Local test setup and commands.
- Remote migration procedure and target verification.
- Local-to-cloud table mapping.
- Data ownership.
- Identity and membership model.
- Grants and RLS policy matrix.
- Privileged-role limitations.
- Exact numeric handling.
- Deferred synchronization behavior.
- Deferred storage and permission-management features.

Record architecture decisions where appropriate.

## Scope Limits

For this phase:

- Do not implement Clerk sign-in screens.
- Do not implement tenant onboarding or invitations.
- Do not implement staff permission editing.
- Do not add local arrivals/inventory tables.
- Do not implement device provisioning.
- Do not implement synchronization ingestion or workers.
- Do not implement dashboard reports.
- Do not enable remote financial editing.
- Do not add cheque tracking or unapproved commission overrides.
- Do not reset shared databases.
- Do not deploy, commit, or push automatically.

## Check When Done

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:db-cloud`
- `pnpm build`
- `pnpm check`

Verify that:

- Cloud migrations reconstruct a clean test database.
- Tenant isolation is tested under restricted roles.
- Ordinary users cannot mutate synchronized financial data.
- Numeric mappings preserve exact values.
- Server-only code is not included in browser or desktop bundles.
- Existing local operations remain independent of cloud availability.
- No credentials or database dumps are tracked.

Report remote migration status separately from local verification.

Do not claim that Clerk authentication, synchronization, or 300–500-stall capacity is proven by this phase.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Cloud migrations and tables implemented.
- Identity and tenant-isolation decisions.
- Grants and policies verified.
- Local-to-cloud mapping.
- Test and build results.
- Remote migration status.
- Outstanding manual configuration.
- Readiness for phase 12, `12-clerk-web-authentication.md`.

Do not mark authentication or synchronization complete.

## Completion Report

Provide:

1. Files, migrations, and tables created.
2. Tenant-isolation and access behavior.
3. Numeric and identity-mapping decisions.
4. Test and build results.
5. Whether migrations were applied remotely and to which environment.
6. Remaining blockers or manual steps.
7. Whether phase 12 can begin.