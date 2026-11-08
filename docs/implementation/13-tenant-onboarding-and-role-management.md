# 13 — Tenant Onboarding and Role Management

## Goal

Implement web-based stall onboarding and tenant access management.

Allow an authenticated user to:

- Create a stall account.
- Access stalls they belong to.
- Select an active stall.
- Manage authorized members as the stall owner.
- Configure billing-staff and cashier permissions from the web application.

Preserve tenant isolation and clearly distinguish cloud configuration from permissions actually applied to a local stall service.

Do not implement device provisioning, offline staff login, or permission synchronization yet.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect phase 11’s tenant, membership, and RLS implementation.
4. Inspect phase 12’s authentication and membership helpers.
5. Review approved role and permission decisions.
6. Inspect existing domain contracts, database clients, and tests.
7. Mark phase 13 as in progress.

Use the actual repository implementation rather than assuming all earlier proposed structures exist.

Check current official SDK and database documentation before introducing integrations or security-sensitive database functions.

## Product Rules

Preserve these requirements:

- Each stall is a separate tenant.
- The stall owner controls permissions for billing staff and cashiers.
- Permissions can be configured from the web application.
- Farmers and traders are business records created through the desktop application.
- Farmers and traders are not automatically web members.
- Web users cannot directly edit synchronized financial records.
- Local billing must continue according to the approved offline-access policy.

An online account, tenant membership, and local staff identity are different concepts.

Do not automatically treat a Clerk user as an enrolled local staff member.

## 1. Define Tenant and Membership Behavior

Reuse the existing tenant and membership structures.

Document:

- Who can create a stall.
- Who becomes its initial owner.
- How a user accesses multiple stalls.
- What active, inactive, and pending membership mean.
- Which operations require ownership.
- How member access is removed without deleting historical records.

For the initial onboarding flow, an authenticated user may create a new stall and becomes its owner unless an existing approved policy restricts tenant creation.

Creating a new stall must not grant access to an existing stall.

Do not infer ownership from a matching stall name, email domain, phone number, or physical stall number.

Do not add subscriptions, payment collection, or licensing rules in this phase.

## 2. Establish Role and Capability Boundaries

Use the approved roles:

- Stall owner.
- Billing staff.
- Cashier.

Treat billing staff and cashier as understandable starting profiles, with owner-configurable permissions.

Do not scatter checks such as `role === "cashier"` across application features.

Use explicit capabilities for operations.

### Capability Catalog

Create a typed, documented catalog covering approved operations, such as:

- View reports.
- Manage farmer/buyer records.
- Prepare and edit draft bills.
- Finalize bills.
- Record receipts.
- Record farmer payouts.
- Reprint bills.
- Perform approved corrections.
- Configure business settings.

Use only capabilities supported by confirmed requirements.

A capability may describe a future feature, but granting it must not make that feature appear implemented.

Unknown capabilities must be rejected.

### Owner Administration

Keep tenant ownership and permission administration separate from operational profiles.

Billing-staff or cashier permissions must not accidentally grant:

- Ownership.
- Membership administration.
- Permission administration.
- Access to another stall.

If delegation of these administrative powers is not already approved, leave it unavailable.

Document default profiles as recommendations unless they have been approved. Require the owner to review the selected permissions before saving.

## 3. Add Focused Cloud Migrations

Extend the cloud schema only as needed for:

- Tenant profile information.
- Membership lifecycle.
- Permission assignments.
- Permission configuration revisions.
- Secure invitation records, if invitations are used.
- Administrative audit records.
- Idempotent onboarding requests where needed.

Preserve existing identifiers and policies.

Use forward migrations.

Do not modify applied migration history.

Do not add local SQLite staff or permission tables in this phase. Their implementation belongs to the local-authentication and synchronization phases.

## 4. Implement Atomic Stall Creation

Create a server-authorized onboarding operation.

It must:

1. Verify the current Clerk identity.
2. Validate the submitted stall information.
3. Apply the approved tenant-creation policy.
4. Create the tenant.
5. Create the initial owner membership.
6. Record the administrative audit event.
7. Return the new tenant identity.

Tenant creation and owner membership must commit atomically.

Do not implement this as several independent database requests that can leave an ownerless tenant.

Use a narrowly scoped database transaction or RPC consistent with the existing architecture.

### Duplicate Submission

Support a stable onboarding idempotency key.

Repeated submission of the same successful request must return the same tenant rather than create duplicates.

Reusing the key for different input must return a conflict.

Do not deduplicate solely by stall display name.

## 5. Build the Stall Onboarding Interface

Replace phase 12’s no-membership placeholder with a working onboarding entry point.

Use the existing design system.

Collect only necessary information, such as:

- Stall display name.
- Market/location description where required.
- Contact information where required.
- Approved business timezone.

Distinguish optional fields from required fields.

Do not collect payment details, printer settings, device credentials, or opening balances here.

Provide:

- Inline validation.
- Clear submission feedback.
- Duplicate-submit protection.
- A recoverable error state.
- Navigation to the new stall after success.

Do not claim that the desktop system is installed or provisioned after account creation.

Show an accurate state such as:

`Stall account created. Desktop setup is not complete.`

## 6. Implement Tenant Selection

Add an accessible stall selector for users with multiple active memberships.

Requirements:

- List only permitted stalls.
- Preserve the selected stall through a documented route or session preference.
- Verify membership on every protected data operation.
- Clear stale tenant state when switching.
- Prevent shared caching across users or tenants.
- Handle removed or inactive memberships without redirect loops.

A tenant ID in a URL, cookie, or client store is a selection, not authorization.

Do not choose an arbitrary first stall when a user needs to select between several.

## 7. Implement Owner-Only Member Management

Provide an owner-accessible members page.

Support:

- Viewing eligible membership information.
- Adding members through the approved invitation flow.
- Assigning billing-staff or cashier profiles.
- Editing permitted operational capabilities.
- Deactivating or removing access.
- Viewing pending invitations.

Enforce these permissions on the server and database boundary.

Do not rely on hiding controls in the UI.

Do not expose a global user directory or allow searching unrelated accounts by partial email.

Removing access must not delete:

- Bills.
- Payments.
- Audit records.
- Historical actor references.

## 8. Implement Secure Invitations

Use one invitation mechanism consistent with the existing membership authority.

Do not maintain competing membership systems in Clerk Organizations and Polivo tables without an accepted mapping.

A minimal copyable invitation-link flow is sufficient unless email delivery is already configured and approved.

### Invitation Requirements

- An authenticated owner creates the invitation.
- The invitation is bound to one tenant and intended recipient.
- Its role/capabilities are explicitly recorded.
- The token is cryptographically random.
- Store a token hash rather than the reusable raw token.
- Apply a documented expiration.
- Support revocation.
- Make acceptance single-use and atomic.
- Do not include administrative credentials in the link.

After the recipient signs in, verify the intended identity using trusted provider data, including verified email where email-bound invitations are used.

Never match against an unverified client-supplied email.

Do not reveal invitation details to an unauthorized visitor.

### Acceptance

Invitation acceptance must atomically:

- Validate the invitation.
- Verify recipient eligibility.
- Create or update the intended membership safely.
- Mark the invitation accepted.
- Record an audit event.

Handle simultaneous acceptance and repeated requests without duplicate memberships.

Do not reactivate a previously removed member through an old invitation unless an approved policy explicitly permits it.

Do not send real invitations during automated tests.

## 9. Build Owner-Editable Permission Settings

Provide a clear permission editor for billing staff and cashiers.

Requirements:

- Group capabilities by understandable business task.
- Show the current selection.
- Explain important dependencies.
- Reject unknown or invalid combinations.
- Use a revision to prevent silent overwrites.
- Record the actor and change reason where required.
- Show save success only after durable persistence.

Do not assume that a role label grants permissions independently of the stored capability configuration.

Do not allow users to edit their own authority through unrestricted table updates.

Preserve existing read-only financial policies.

## 10. Distinguish Cloud Permissions from Local Enforcement

Cloud membership changes govern online access according to the implemented policy.

Desktop permissions require later synchronization and local enforcement.

Store a monotonically advancing configuration revision or equivalent accepted version.

Present truthful status, such as:

- Saved to cloud.
- Local application status unavailable.
- Pending delivery, only when an actual delivery mechanism exists.

Do not mark a change “Applied to desktop” without a verified acknowledgement.

Do not create fake delivery acknowledgements in this phase.

Document that an offline stall cannot receive an immediate remote change. Local offline expiry and revocation behavior will follow the approved policy in later phases.

Do not implement a second source of financial authority while adding configuration ownership.

## 11. Protect Ownership and Membership Invariants

Prevent operations that leave an active tenant without an active owner.

Check this invariant transactionally.

Two concurrent requests must not both remove or demote the last owners.

If ownership transfer is not yet approved, leave it unavailable and explicitly prevent accidental transfer through role editing.

Do not implement tenant deletion or cascading data deletion.

Any future tenant closure must preserve the approved retention and recovery behavior.

## 12. Secure Administrative Mutations

For every mutation:

- Verify the Clerk session.
- Resolve the internal user subject.
- Verify current active owner membership.
- Validate tenant and target identity.
- Validate the input schema.
- Enforce capability and lifecycle constraints.
- Apply changes atomically.
- Record an administrative audit event.

Use the framework’s supported request-origin and CSRF protections for cookie-authenticated mutations.

Do not implement state changes through GET requests.

### Database Functions and Privileged Access

Prefer narrowly scoped operations.

If a SECURITY DEFINER function is required:

- Restrict execution grants.
- Fix its search path.
- Fully qualify referenced objects.
- Derive identity from verified request context.
- Check owner membership inside the operation.

If a privileged server client is used, perform explicit authorization before every operation and keep its interface narrow.

Never expose a generic privileged table-write helper to route input.

## 13. Add Audit and Concurrency Behavior

Record administrative changes including:

- Tenant creation.
- Invitation creation, acceptance, and revocation.
- Membership changes.
- Permission updates.

Include safe metadata:

- Tenant.
- Verified actor.
- Target membership or invitation.
- Action.
- Timestamp.
- Configuration revision.
- Relevant before/after changes.

Do not log invitation tokens, session tokens, or full unrestricted request bodies.

Use expected revisions for permission changes.

Return an understandable conflict when another owner has changed the configuration.

Do not silently overwrite a newer version.

## 14. Test the Complete Access Lifecycle

Extend the existing tests using synthetic tenants and dedicated test identities.

Cover:

### Onboarding

- Unauthenticated creation is rejected.
- Successful creation produces a tenant and owner atomically.
- Failure rolls back partial creation.
- Duplicate submission does not create another tenant.
- A mismatched idempotency payload returns a conflict.

### Membership

- Members see only eligible stalls.
- Nonowners cannot administer members.
- A forged tenant ID does not grant access.
- Deactivation blocks subsequent online access.
- Historical financial records remain intact.

### Invitations

- Invalid, expired, revoked, or reused tokens fail safely.
- Wrong recipients cannot accept.
- Concurrent acceptance produces one valid membership.
- Acceptance does not elevate beyond the recorded invitation.
- Old invitations cannot bypass later removal decisions.

### Permissions

- The owner can edit billing-staff and cashier capabilities.
- Staff cannot edit their own capabilities.
- Unknown capabilities are rejected.
- Stale revisions return conflicts.
- Cloud saves are not shown as locally applied.

### Ownership

- The last active owner cannot be removed accidentally.
- Concurrent removal/demotion requests preserve the owner invariant.

Run database authorization assertions as restricted users, not only through administrative clients.

## 15. Update Web End-to-End Tests

Verify:

- A signed-in user with no stall can enter onboarding.
- A new stall appears after successful creation.
- Tenant switching clears the previous tenant’s presentation.
- Owner controls are available only to authorized users.
- Permission changes persist.
- Access-denied and empty states are clear.
- Protected financial data remains read-only.

Keep deterministic tests separate from real Clerk integration tests.

Do not introduce authentication bypasses into production code.

## Documentation

Create:

`docs/operations/tenant-onboarding-and-access-management.md`

Document:

- Tenant creation.
- Membership authority.
- Role/capability semantics.
- Invitation creation and acceptance.
- Owner-only operations.
- Ownership safeguards.
- Permission revisions.
- Cloud versus desktop enforcement.
- RLS and privileged-operation boundaries.
- Test commands.
- Deferred device and local-staff setup.

Update relevant context decisions without duplicating the full specification across files.

## Scope Limits

For this phase:

- Do not register farmers or traders as web users.
- Do not implement device enrollment.
- Do not implement local staff credentials or offline login.
- Do not implement permission synchronization or acknowledgements.
- Do not add arrivals/inventory workflows.
- Do not implement billing or payment features.
- Do not permit remote financial edits.
- Do not add subscriptions or payment collection.
- Do not implement tenant deletion.
- Do not send real invitations during testing.
- Do not commit, push, or deploy automatically.

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

Verify:

- Tenant creation is atomic and idempotent.
- Membership and permission administration are owner-authorized.
- Cross-tenant access is denied.
- Last-owner invariants survive concurrent requests.
- Invitation tokens and secrets are not logged or committed.
- Financial data remains read-only from the web.
- Desktop application status is represented truthfully.

Report local tests, real authentication verification, and remote migration status separately.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Onboarding implemented.
- Membership and invitation behavior.
- Role/capability decisions.
- Permission configuration revisions.
- Ownership safeguards.
- Test and build results.
- Deferred local enforcement and synchronization.
- Readiness for phase 14, `14-stall-provisioning-and-device-enrollment.md`.

Do not mark desktop provisioning or offline access complete.

## Completion Report

Provide:

1. Onboarding and member-management features implemented.
2. Role and permission behavior.
3. Invitation and ownership safeguards.
4. Cloud versus local enforcement status.
5. Test and build results.
6. Remaining blockers or manual steps.
7. Whether phase 14 can begin.