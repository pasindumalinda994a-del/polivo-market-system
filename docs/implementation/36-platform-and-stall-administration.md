# 36 — Platform and Stall Administration

## Objective

Implement the administrative workflows needed to operate Polivo across multiple stalls while preserving tenant isolation and local operational authority.

This phase must deliver:

- Separate platform and stall administration interfaces.
- Explicit administrative roles and permission boundaries.
- Stall directory and lifecycle management.
- Owner and membership administration.
- Device and local-access administration using existing workflows.
- Configuration delivery status.
- Auditable, concurrency-safe administrative actions.
- Restricted operational diagnostics.
- Tests for privilege escalation, isolation, and lifecycle transitions.

Reuse the administration foundations from Phases 13–14 and 33–35.

Administrative access must not provide a hidden route for editing financial transactions or bypassing local authorization.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 13 tenant onboarding, invitations, and roles.
- Phase 14 enrollment and device authority.
- Phase 15 local staff identity and authentication.
- Phase 33 configuration and access delivery.
- Phase 34 reconciliation and recovery permissions.
- Phase 35 web reporting authorization.
- Existing platform-role, stall-status, and approval decisions.

Inspect:

1. The relationship between tenant and stall.
2. Existing administrative routes.
3. Cloud membership and owner invariants.
4. Platform/market administrator identity.
5. Local staff identity mappings.
6. Device enrollment and revocation operations.
7. Administrative audit structures.
8. Unresolved lifecycle or access-policy decisions.

Do not assume one tenant always means one stall unless the schema guarantees it.

Mark Phase 36 as `IN_PROGRESS`.

Preserve earlier pending live acceptance checks.

---

## 2. Define Administrative Roles Explicitly

Create a role/action/scope matrix from approved requirements.

Distinguish:

- Platform administrator.
- Market administrator, if implemented as a separate scoped role.
- Stall owner.
- Delegated stall administrator.
- Reporting member.
- Local billing staff.
- Local cashier.

A stall owner must not become a platform administrator through tenant permission editing.

A market administrator must remain restricted to the assigned market scope.

Do not treat a user’s email address, display name, or client-supplied metadata as proof of platform authority.

Use the existing trusted role store.

If platform-admin bootstrap is missing, provide a restricted deployment/operator procedure using a stable identity-provider subject.

Do not add a public bootstrap route or automatically promote the first registered user.

---

## 3. Preserve Administrative Scope

Define supported actions separately.

### Platform administration

May include, where approved:

- View stall directory.
- Review onboarding requests.
- Manage approved stall lifecycle transitions.
- Inspect enrollment and synchronization metadata.
- Manage explicitly authorized administrative assignments.
- View administrative audit history.

### Stall administration

May include:

- Edit cloud-owned stall profile fields.
- Invite and manage permitted members.
- Configure approved staff permissions.
- Manage verified local staff mappings.
- Authorize and revoke devices.
- View configuration application status.
- Access permitted diagnostics.

Platform operational visibility does not automatically include farmer, buyer, payment, or financial-report access.

Financial data access requires its own approved authorization.

Do not implement administrator impersonation or unrestricted “log in as owner” functionality.

---

## 4. Build an Administrative Capability Matrix

For every action, define:

- Required capability.
- Scope.
- Allowed target.
- Revision precondition.
- Required reason or confirmation.
- Audit event.
- Offline-host consequence.

Cover at least:

- View administrative directory.
- Edit stall profile.
- Review onboarding.
- Change stall status.
- Invite/revoke membership.
- Change member role.
- Transfer ownership, if supported.
- Authorize/revoke a device.
- Publish local access changes.
- View operational diagnostics.
- Export administrative audit data, if supported.

Reuse existing capabilities where their semantics match.

Do not allow arbitrary capability names from the client.

Enforce delegation limits so administrators cannot grant powers they are not authorized to assign.

---

## 5. Implement the Platform Stall Directory

Provide a paginated directory within the platform/market administrator’s scope.

Show only necessary operational metadata:

- Stall identity and code.
- Market association, where implemented.
- Owner/contact information permitted for administration.
- Lifecycle status.
- Enrollment status.
- Last host contact.
- Last applied upload observation.
- Pending configuration delivery.
- Known operational blockers.

Support bounded search and filters.

Distinguish:

- No enrolled host.
- Host contact stale.
- Upload blocked.
- Configuration pending.
- Reconciliation issue.

Do not label a stall “offline” solely because no financial upload recently occurred.

Do not expose financial totals by default in the directory.

---

## 6. Implement Stall Profile Administration

Reuse the existing stall profile model.

Allow edits only to fields whose authority belongs in the cloud.

Examples may include:

- Display name.
- Address.
- Approved contact details.
- Market association where the role permits it.
- Administrative notes with restricted visibility.

Validate field lengths, formats, and uniqueness where required.

Use expected revisions to prevent silent overwrites.

Preserve historical issued-document snapshots.

Changing the stall name must not rewrite old bill headers or payment records.

If profile changes must reach the local host, publish them through Phase 33.

Show cloud publication and local application separately.

Do not allow arbitrary changes to tenant IDs, source-stream identities, bill sequences, or ownership keys through the profile form.

---

## 7. Implement Approved Stall Lifecycle Transitions

Inspect existing states before adding new ones.

Define a transition table for the supported lifecycle, such as onboarding, active, suspended, or archived.

For each transition, specify its effect on:

- Web access.
- Reporting access.
- Invitations.
- New device enrollment.
- Configuration delivery.
- Operational upload.
- Local operation after delivery.
- Data retention.

Do not use one status flag to imply all these effects.

Do not invent subscription, billing-plan, or licence-enforcement behavior.

If suspension behavior remains unresolved, continue independent directory and profile work while leaving that transition unavailable.

Preserve the established offline-access policy.

A cloud suspension cannot instantly stop an unreachable local host.

Display the actual enforcement state and pending acknowledgement.

---

## 8. Preserve Data During Suspension and Archival

Lifecycle changes must preserve:

- Sales.
- Bills.
- Ledger history.
- Payments and allocations.
- Audit records.
- Source streams and receipts.
- Device history.

Do not cascade-delete financial data.

Archival is not database deletion.

Reactivation must follow the approved transition rules. It must not automatically restore:

- Revoked devices.
- Revoked memberships.
- Old session secrets.
- Expired access snapshots.

Determine whether uploads remain allowed for draining already-committed local events during suspension.

Follow the approved policy explicitly rather than accidentally blocking the only path for pending financial data.

Destructive tenant deletion and retention enforcement require a dedicated later policy and workflow.

---

## 9. Complete Membership and Invitation Administration

Reuse Phase 13’s invitation and membership implementation.

Provide:

- Member list.
- Invitation status.
- Allowed role changes.
- Invitation cancellation.
- Membership revocation.
- Safe invitation resend where supported.

Validate permissions at the time of mutation and invitation acceptance.

An old invitation must not grant authority that the inviter can no longer delegate.

Use the established verified-recipient identity rules.

Protect against:

- Cross-stall role changes.
- Self-escalation.
- Assigning platform roles through tenant APIs.
- Concurrent removal of all owners.
- Reuse of revoked invitations.

Do not rebuild account registration or duplicate invitation infrastructure.

---

## 10. Protect Owner Continuity

Enforce the existing owner invariant at the database transaction boundary.

Ordinary administration must not leave an active stall without its required owner.

If ownership transfer is approved:

1. Select an eligible verified member.
2. Show the resulting roles.
3. Verify the initiating user’s authority.
4. Require the approved confirmation or reauthentication.
5. Transfer ownership atomically.
6. Record the before/after identities and reason.
7. Invalidate affected authorization caches.

Do not silently remove the former owner’s unrelated access.

Do not allow concurrent transfers or removals to violate owner continuity.

If emergency owner recovery is required, document a separately authorized operator procedure. Do not create an unrestricted UI bypass.

---

## 11. Integrate Local Staff Access Administration

Use Phase 33’s identity mappings and permission publication.

Show separately:

- Web members.
- Local staff accounts.
- Verified mappings between them, where present.
- Role-policy revisions.
- Published and locally applied access.

Do not imply that inviting a web member creates a desktop login.

Allow supported local access changes through existing trusted workflows.

Never display or distribute:

- Local staff passwords or PINs.
- Password hashes.
- Session secrets.
- Host/device private keys.

Credential setup or reset must use dedicated provisioning mechanisms.

On staff disablement, preserve historical actor references.

Show “Waiting for host application” until the local acknowledgement arrives.

---

## 12. Consolidate Device Administration

Reuse Phase 14 enrollment and Phase 33 revocation delivery.

Provide device lists showing:

- Host or terminal type.
- Device label.
- Enrollment state.
- Activation/revocation metadata.
- Last observed contact.
- Applicable delivery/application state.

Support existing authorized actions:

- Create enrollment authorization.
- Cancel unused authorization.
- Revoke an eligible terminal.
- Revoke a host under approved rules.

Do not expose private credentials or reusable enrollment secrets in ordinary lists.

Do not show expired authorization as active.

Prevent multiple authoritative hosts where the architecture permits only one.

Host replacement must follow the dedicated recovery phase. Do not turn “Add host” into a silent replacement operation.

---

## 13. Keep Business Parties Separate from Login Accounts

Farmer and buyer/trader records remain local business records managed by stall staff.

Do not convert those records into Clerk users or cloud memberships.

Inspect approved requirements for any separate online application/approval workflow.

If such a workflow is explicitly approved:

- Keep applicant identity separate from local party identity.
- Define who approves and what approval grants.
- Use an explicit mapping or provisioning handoff.
- Prevent duplicate or guessed identity matches.
- Preserve local data ownership.

Do not add an approval gate to existing desktop farmer/buyer registration by assumption.

If earlier documents conflict, record the unresolved scope and complete the independent administrative functionality.

Do not silently claim the separate application workflow is complete when only member invitations exist.

---

## 14. Implement Transactional Administrative Mutations

For each administrative mutation:

1. Authenticate the current user.
2. Load current authority from the trusted store.
3. Validate target scope and delegation limits.
4. Check the expected revision.
5. Validate lifecycle invariants.
6. Apply changes atomically.
7. Publish required configuration in the same transaction where appropriate.
8. Record the audit event.
9. Return the committed result.

Use idempotency for retry-sensitive operations.

For external effects such as invitation delivery, use the existing durable delivery mechanism so a database commit is not confused with message delivery.

Recheck authorization at the write boundary.

Do not rely on a stale page-load permission check.

Provide clear conflict responses instead of silent last-write-wins behavior.

---

## 15. Build Separate Administrative Interfaces

Use the existing web design system.

### Platform/market workspace

- Stall directory.
- Scoped stall details.
- Approved onboarding/lifecycle actions.
- Enrollment and sync overview.
- Administrative audit history.

### Stall administration

- Profile.
- Members and invitations.
- Permissions/local staff access.
- Devices.
- Configuration delivery status.
- Authorized diagnostic links.

Keep the selected scope visible.

Use clear action summaries for status changes, membership removal, device revocation, and ownership transfer.

Require a reason for impactful actions under the approved policy.

Do not ask for confirmation for every harmless profile edit.

Support keyboard navigation, responsive tables, accessible forms, and clear loading/error states.

Clear stale data when switching stalls or losing access.

---

## 16. Preserve Financial and Diagnostic Boundaries

Administrative pages must not add financial write controls.

Reuse Phase 35 for separately authorized reporting access.

Reuse Phase 34 for scoped diagnostics and bounded recovery.

Do not expose:

- Arbitrary SQL execution.
- Raw credential stores.
- Full environment-variable dumps.
- Generic remote shell commands.
- Unrestricted cross-stall exports.
- Manual balance overrides.

Platform role does not automatically authorize every recovery action.

Link to existing workflows instead of creating duplicate repair mechanisms.

Keep cloud observation times visible. Do not present old host-reported status as a live local observation.

---

## 17. Add Audit History and Cache Invalidation

Record administrative mutations with:

- Actor identity.
- Actor scope.
- Target tenant/stall.
- Action.
- Previous and resulting values, with sensitive fields redacted.
- Expected and resulting revision.
- Reason where required.
- Timestamp and correlation ID.
- Configuration publication reference where applicable.

Store audit records atomically with mutations.

Prevent ordinary administrators from editing or deleting their audit history.

Restrict audit visibility by role and scope.

Invalidate or version relevant authorization caches after:

- Role change.
- Membership revocation.
- Ownership transfer.
- Administrative privilege removal.
- Stall status change.

Reauthorize protected reads and exports.

Do not assume signing out of the UI is the only way to remove access.

---

## 18. Add Migrations and Security Tests

Use forward-only migrations for required:

- Administrative roles or scoped assignments.
- Lifecycle metadata.
- Revision checks.
- Audit structures.
- Publication links.

Reuse existing tables where possible.

Do not grant platform authority to existing users during migration.

Provide synthetic role assignments only in isolated test fixtures.

Test:

- Stall owner cannot access platform administration.
- Scoped market administrator cannot access another market.
- Reporting member cannot mutate administration.
- Owner cannot grant platform privileges.
- Delegated administrator cannot exceed delegation limits.
- Direct API requests cannot bypass hidden controls.
- Cross-tenant IDs are rejected.
- Last-owner protection under concurrent requests.
- Ownership-transfer races.
- Revoked administrator cannot complete a stale mutation.
- Invitation acceptance after inviter permission changes.
- Device revocation and reactivation boundaries.
- RLS and privileged function grants.
- Audit persistence and rollback.
- Configuration publication without false local-applied status.
- No financial changes from administrative operations.

---

## 19. Complete Development Acceptance

Prepare a checklist using synthetic development accounts and stalls.

1. Configure the test platform administrator through the trusted bootstrap procedure.
2. Sign in and verify the permitted stall directory.
3. Sign in as an ordinary stall owner and verify platform access is denied.
4. Edit an allowed stall profile field.
5. Verify revision conflict handling from two browser sessions.
6. Confirm historical bill snapshots remain unchanged.
7. Invite a permitted test member and accept the invitation.
8. Change the member’s role and verify access updates.
9. Revoke the membership and verify subsequent requests are denied.
10. Attempt removal of the last owner and verify rejection.
11. Test ownership transfer if implemented.
12. Publish a local staff permission change.
13. Verify published, pending, and applied states through Phase 33.
14. Revoke a test terminal and verify local enforcement after delivery.
15. Test an approved stall lifecycle transition.
16. Verify offline-host effects are represented accurately.
17. Reactivate under the approved policy and confirm revoked access is not silently restored.
18. Inspect audit history.
19. Verify platform diagnostics do not expose unauthorized financial details.
20. Confirm all financial records and balances remain unchanged.

Use development data for suspension, revocation, and ownership tests.

Do not modify a live stall to demonstrate these workflows.

Record unresolved lifecycle policies and unavailable live checks as pending.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/platform-and-stall-administration.md`

Document:

- Administrative role matrix.
- Scope and delegation rules.
- Trusted platform-admin bootstrap.
- Stall lifecycle transitions and effects.
- Owner-continuity rules.
- Invitation and membership behavior.
- Local staff versus web identities.
- Device administration.
- Offline enforcement limitations.
- Audit access.
- Recovery and support boundaries.

Update context files and the progress tracker.

Apply reviewed migrations only to the selected development/staging environment during verification.

Run applicable formatting, lint, type, database, RLS, authorization, API, UI, end-to-end, and build checks.

Report:

1. Administrative pages and operations implemented.
2. Roles, capabilities, and scope boundaries.
3. Lifecycle and ownership behavior.
4. Configuration/device integration.
5. Migrations.
6. Automated test results.
7. Live checks completed or pending.
8. Unresolved approval or lifecycle requirements.
9. Readiness for Phase 37.

## Acceptance Criteria

- Platform, market, and stall authority are explicitly separated.
- Administrative actions enforce current scope and delegation limits.
- Stall owners cannot grant themselves platform authority.
- Active stalls retain required owner continuity.
- Membership, device, and access changes reuse existing trusted workflows.
- Cloud publication is distinguished from local enforcement.
- Suspension and archival preserve operational and financial history.
- Farmer/buyer business records remain separate from login identities.
- Administrative actions are transactional, revision-safe, and auditable.
- Financial data remains protected from administrative shortcuts.
- Tests pass and pending live acceptance or policy decisions are documented.