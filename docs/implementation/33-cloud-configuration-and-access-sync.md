# 33 — Cloud Configuration and Access Sync

## Objective

Implement secure delivery of cloud-authoritative configuration and access changes to the stall host.

This phase must deliver:

- An explicit configuration ownership map.
- Versioned cloud configuration snapshots.
- Authenticated host pull and application acknowledgements.
- Atomic local application.
- Owner-managed permission updates reaching local authorization.
- Protection against stale, replayed, or incompatible configuration.
- Accurate “saved,” “pending delivery,” and “applied” states.
- Safe offline behavior under the approved access policy.
- Automated and live development verification.

Reuse the enrolled host identity and transport foundations from Phases 31–32.

Configuration delivery must not overwrite locally authoritative financial transactions.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 13 membership and owner permission management.
- Phase 14 enrollment, device authority, and revocation.
- Phase 15 local staff authentication and authorization adapters.
- Phase 16 LAN session handling.
- Phase 20 commission configuration ownership.
- Phases 31–32 host authentication and sync transport.
- Existing access-policy ADRs and unresolved decisions.

Inspect:

1. Cloud role and capability definitions.
2. Local staff identities and capability snapshots.
3. Existing trusted permission-refresh mechanisms.
4. Session expiry and revocation checks.
5. Host credential loading and request signing.
6. Configuration revisions already stored locally and in Supabase.
7. Current configuration authority boundaries.

Mark Phase 33 as `IN_PROGRESS`.

Do not assume unresolved production offline-access decisions have been approved.

---

## 2. Preserve Identity Boundaries

Keep these identities distinct:

- Clerk-authenticated web user.
- Cloud tenant membership.
- Local staff account.
- Enrolled host.
- Enrolled LAN terminal.

A web cashier membership is not automatically a local cashier login.

Do not create local staff credentials from a Clerk session or membership record.

Use existing explicit provisioning and identity-linking workflows.

If cloud administration targets an individual local staff account, require a stable, verified mapping to that account.

If it changes a role’s capabilities, deliver the role-policy update without inventing individual identity links.

Never match identities by display name or email alone.

---

## 3. Define Configuration Ownership

Create a configuration ownership matrix.

For every supported setting, record:

- Authoritative location.
- Allowed editor.
- Target scope.
- Revision model.
- Local application behavior.
- Whether it affects active sessions.
- Whether offline expiry applies.

Include relevant existing settings such as:

| Setting | Required treatment |
|---|---|
| Owner-managed role permissions | Cloud-authoritative where already approved |
| Local staff access assignments | Deliver only through verified mappings |
| Device revocations | Follow enrollment authority |
| Access-policy validity | Use approved policy only |
| Stall display settings | Follow existing ownership decision |
| Commission configuration | Preserve Phase 20 ownership |
| Terminal printer selection | Preserve terminal-local configuration |
| Sales, payments, ledger records | Local operational authority |

Do not make every setting cloud-editable.

Do not introduce two independent writers for the same setting.

If commission configuration is local-authoritative, cloud reporting copies must not overwrite it.

If an approved decision makes it cloud-authoritative, use immutable versions and local application acknowledgements. Do not silently change its authority in this phase.

---

## 4. Resolve the Supported Access Policy

Inspect the existing security decision register.

The previously approved approach allows mechanics to be implemented while production access remains fail-closed until required policy values are approved.

Preserve that requirement.

Identify the approved or unresolved values for:

- Access-snapshot validity.
- Local session lifetime.
- Offline credential validity.
- Permission-refresh timing.
- Behavior after policy expiry.
- Clock-skew tolerance.
- Required revocation response.

Do not replace unresolved production values with test defaults.

Use clearly labeled TEST-ONLY values in automated fixtures.

Implement independent transport, validation, revisioning, and application mechanics even when a production policy remains unresolved.

Receiving a new snapshot must not automatically grant indefinite offline access.

---

## 5. Design Versioned Configuration Snapshots

Use shared contracts.

Prefer complete snapshots within a clearly defined configuration domain where that simplifies atomic replacement.

Each envelope should identify:

- Protocol and schema version.
- Tenant and stall.
- Target host or approved target scope.
- Configuration domain.
- Monotonic revision.
- Publication identity.
- Issued time.
- Validity metadata where approved.
- Required compatibility version.
- Payload.
- Integrity information required by the trust model.

Define whether an envelope is:

- A complete replacement for its domain.
- A delta requiring a specific base revision.

Do not mix those meanings.

For complete access snapshots, define how removed grants and disabled accounts are represented.

For deltas, require the expected base revision and an explicit fallback to a complete snapshot.

Related settings that must change together must share an atomic bundle or explicit dependency contract.

---

## 6. Secure Cloud Publication

Reuse the existing owner-facing role and permission management workflow.

On cloud mutation:

1. Authenticate the Clerk user.
2. Verify current tenant membership and management capability.
3. Validate the requested configuration.
4. Check the expected revision.
5. Persist the new immutable published version.
6. Record audit metadata.
7. Make the version available to the authorized host.

Keep publication and revision advancement transactional.

Reject concurrent edits with a clear conflict.

Do not allow an owner to grant platform-level privileges or capabilities outside the approved tenant-management scope.

Do not expand roles with arbitrary client-supplied capability strings.

Use the canonical capability registry and existing escalation restrictions.

A successful cloud save means published in cloud. It does not mean applied locally.

---

## 7. Authenticate Configuration Delivery

Use the existing enrolled host authentication mechanism.

Provide a bounded host pull endpoint through the established cloud API.

Verify:

- Activated host identity.
- Tenant and stall assignment.
- Current host authority.
- Requested configuration scope.
- Protocol compatibility.
- Revocation state.

Do not send configuration to a terminal impersonating the host.

Use authenticated HTTPS and the existing request-signing conventions.

Define how the host verifies the authenticity and integrity of returned configuration.

If configuration uses signed envelopes:

- Use server-held signing keys.
- Pin or securely distribute trusted verification keys.
- Validate key identifiers and allowed algorithms.
- Define key rotation without trusting an arbitrary key supplied in the same response.

If authenticated transport is the approved trust model, document its limits, especially for cached or relayed configuration.

Do not accept access snapshots from unsigned local files, browser messages, or arbitrary renderer input.

---

## 8. Implement a Bounded Pull Worker

Run configuration polling inside the stall service.

Reuse Phase 32 transport, scheduling, secure key loading, and safe diagnostics where appropriate.

Keep upload and configuration delivery as separate responsibilities.

An operational outbox event blocked by schema incompatibility must not prevent an otherwise authorized host from receiving access changes.

Provide:

- Poll on startup when eligible.
- Periodic bounded polling.
- Backoff with jitter for transient errors.
- A permission-controlled refresh request.
- Cancellation during shutdown.
- One active application operation per configuration domain.

Do not hold SQLite transactions open during network requests.

Do not require an active desktop staff session for the host to receive configuration.

Interactive controls still require the appropriate staff permission.

---

## 9. Validate Before Local Application

Before applying a snapshot, verify:

- Authenticity under the approved trust model.
- Target tenant, stall, and host.
- Supported schema and protocol.
- Revision ordering.
- Payload integrity.
- Publication identity.
- Required dependencies.
- Validity metadata.
- Capability allowlist.
- Local staff identity mappings.
- Numeric and structural bounds.

For the same revision:

- Identical content is an idempotent replay.
- Different content is an integrity conflict.

Reject lower revisions.

Do not use timestamps alone to decide which configuration wins.

Unknown security capabilities or incompatible access schemas must not be silently treated as granted.

Reject or block the affected domain according to an explicit compatibility rule.

Keep previously applied policy only while its own approved validity permits it.

---

## 10. Apply Configuration Atomically

Use one local SQLite transaction for each atomic configuration bundle.

The application flow must:

1. Acquire the appropriate application lock or revision guard.
2. Reload current domain revision.
3. Revalidate dependencies and target identity.
4. Persist the accepted immutable snapshot.
5. Update the effective local configuration projection.
6. Apply required access invalidations.
7. Record local application audit metadata.
8. Persist a durable acknowledgement to be sent.
9. Commit.

A failed application must not leave mixed old and new permissions.

Do not mark a revision applied before the transaction commits.

Configuration application must not:

- Recalculate historical commission.
- Rewrite issued bills.
- Change posted payment amounts.
- Alter ledger entries.
- Reset bill sequences.
- Replace terminal-local printer settings without an approved rule.

Avoid creating an upload/download feedback loop. Cloud-originated changes must not be republished as new locally authoritative configuration.

---

## 11. Make Authorization Changes Effective

Update the existing authorization adapter rather than adding a parallel permission checker.

Define how active sessions observe the new access revision.

Use a durable authorization epoch, revision check, or equivalent existing mechanism so stale session claims cannot retain removed capabilities.

On permission removal or account disablement:

- Invalidate or restrict affected sessions according to the approved policy.
- Ensure subsequent protected service requests use the new effective access state.
- Clear related cached authorization data.
- Notify the desktop through existing session-refresh behavior.

For financial operations, recheck authorization at the protected write boundary.

Serialize the authorization decision with configuration application where required:

- An operation committed before revocation application remains a valid historical operation.
- An operation authorized after revocation application must observe the new restrictions.

Do not promise to undo transactions already committed.

For permission additions, follow the trusted session-refresh policy. Do not let the renderer grant itself capabilities from a cloud response.

---

## 12. Preserve Credential Security

Configuration delivery must not transmit:

- Local staff plaintext passwords or PINs.
- Local password hashes as general configuration.
- Active session secrets.
- Host private keys.
- Terminal private keys.
- Supabase privileged credentials.

Account provisioning and credential reset must use their established dedicated workflows.

A role update must not reset a local staff password.

A disabled account must remain historically identifiable in audit and financial records.

Do not delete staff history when access is revoked.

---

## 13. Handle Offline Access and Expiry

Use only approved production policy.

Clearly distinguish:

- Cloud configuration published.
- Host unreachable.
- Snapshot received.
- Snapshot applied.
- Snapshot expired.
- Application blocked.

Offline hosts cannot receive immediate remote revocation.

Document that exposure is bounded only by the approved local expiry and access rules.

Do not display remote revocation as locally enforced before acknowledgement.

Do not extend snapshot expiry because:

- A poll timed out.
- The service restarted.
- A cached snapshot was replayed.
- A user pressed Refresh.

Use the established trusted-time strategy.

If clock rollback or uncertain time prevents safe validation, apply the approved fail-closed behavior.

Do not silently change the operating-system clock.

---

## 14. Handle Host and Terminal Revocation

Integrate with Phase 14’s authority model.

For terminal revocation delivered to the host:

- Update the authoritative local terminal-access projection.
- Deny subsequent protected requests from that terminal.
- Apply existing session invalidation rules.
- Preserve historical device references.

For host revocation:

- Follow the existing trusted revocation response and local security policy.
- Stop unauthorized cloud operations.
- Do not automatically re-enroll or generate a new host identity.

A generic network failure or untrusted error body is not proof of revocation.

Ensure the delivery protocol can convey the permitted trusted revocation state without granting a revoked host general configuration access.

Record unresolved host-revocation/offline behavior explicitly.

---

## 15. Acknowledge Application Durably

Send an authenticated acknowledgement after local commit.

Include:

- Target identity.
- Domain and revision.
- Publication/payload identity.
- Applied timestamp as host-reported metadata.
- Application result.
- Safe error code for failed application where supported.

The cloud must record:

- Published revision.
- Last acknowledged applied revision.
- Server receipt time.
- Target host identity.

Treat host application time as reported metadata, not independently verified time.

Make acknowledgements idempotent.

If acknowledgement delivery fails:

- Keep the local configuration applied.
- Retain the pending acknowledgement.
- Retry without reapplying side effects.

Do not advance cloud “applied” status from a download request alone.

Late acknowledgements must not overwrite newer progress or apply to a replacement host incorrectly.

---

## 16. Build Accurate Web and Desktop Status

Extend existing configuration screens.

### Web owner view

Show:

- Current published revision.
- Last host-acknowledged revision.
- Pending application.
- Last acknowledgement time.
- Application failure or compatibility blocker.
- Offline/unreachable state where supported by actual observations.

Use clear language:

“Saved in cloud; waiting for stall host.”

Do not say “Permissions updated on all terminals” solely because publication succeeded.

### Desktop view

Show authorized details such as:

- Effective local revision.
- Last successful refresh.
- Snapshot validity status.
- Pending acknowledgement.
- Safe error message.
- Refresh action.

When access changes invalidate the current session, use the established sign-in/refresh flow.

Clear protected UI state after logout or permission loss and ignore late responses.

Keep detailed reconciliation tools for Phase 34.

---

## 17. Add Forward Migrations and Security Boundaries

Inspect existing tables before adding new structures.

Add only necessary support for:

- Published configuration versions.
- Host delivery/application acknowledgements.
- Local effective revision.
- Trusted snapshot metadata.
- Authorization epochs.
- Pending acknowledgement state.

Use forward-only cloud and local migrations.

Preserve current memberships, local staff credentials, sessions under their existing policy, and financial data.

Restrict cloud reads and writes through existing tenant isolation and owner-management permissions.

Privileged delivery functions must validate host scope explicitly.

Do not expose access snapshots or acknowledgement diagnostics to anonymous users.

Do not permit ordinary desktop clients to write applied revisions directly.

---

## 18. Add Automated Tests

### Publication tests

Cover:

- Authorized owner update.
- Unauthorized member denial.
- Cross-tenant mutation denial.
- Unknown capability rejection.
- Concurrent revision conflict.
- Atomic publication and audit.

### Delivery and validation tests

Cover:

- Correct host receives its configuration.
- Wrong tenant/stall/host rejected.
- Identical replay.
- Lower revision rejected.
- Same revision with changed content rejected.
- Unsupported schema.
- Invalid signature or trust proof.
- Missing delta base.
- Expired access snapshot.
- Clock rollback behavior.
- Missing local staff mapping.

### Application tests

Cover:

- Atomic configuration replacement.
- Failure before effective revision update.
- Failure during session invalidation.
- No partial permission application.
- Duplicate application without repeated side effects.
- No financial mutation.
- No sync feedback loop.

### Authorization tests

Cover:

- Removed capability denied on the next protected request.
- Disabled staff session denied.
- Trusted refresh for new grants.
- Financial commit racing with access removal.
- Terminal revocation.
- Existing production fail-closed behavior.

### Acknowledgement and lifecycle tests

Cover:

- Local apply followed by lost acknowledgement.
- Restart before acknowledgement retry.
- Late acknowledgement.
- Replacement-host scope.
- Upload backlog blocked while configuration polling still works.
- Logout and stale desktop responses.

Use TEST-ONLY policy values only in isolated tests.

---

## 19. Complete a Live Development Flow

Prepare a controlled test with an enrolled host and mapped test staff.

1. Verify Phase 32’s real host credential-loading and signing path.
2. Sign in on the web as the authorized stall owner.
3. Change one approved test role permission.
4. Confirm the web shows saved but not yet applied.
5. Let the host poll.
6. Verify the local revision changes atomically.
7. Verify the application acknowledgement reaches cloud.
8. Confirm the web shows the applied revision.
9. Verify the affected local staff authorization.
10. Remove the permission while a test staff session exists.
11. Confirm the next protected operation is denied under the approved policy.
12. Disconnect internet and publish another test change.
13. Confirm the web shows pending delivery.
14. Confirm the local host retains only access permitted by its existing valid policy.
15. Restore internet.
16. Verify application and acknowledgement.
17. Restart after local application but before acknowledgement.
18. Verify acknowledgement recovery without repeated side effects.
19. Test invalid/replayed configuration using controlled fixtures.
20. Verify no sales, bills, payments, or balances changed.

If production expiry values remain unresolved, use the designated test environment and report production access readiness as blocked.

Do not weaken authentication to complete the demonstration.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/cloud-configuration-and-access-sync.md`

Document:

- Identity boundaries.
- Configuration ownership matrix.
- Supported domains.
- Publication and revision rules.
- Host authentication and response trust.
- Local atomic application.
- Active-session behavior.
- Offline validity and expiry.
- Revocation limitations.
- Acknowledgement semantics.
- Status labels.
- Live test procedure.
- Remaining policy decisions.

Update context files and the progress tracker.

Apply required local migrations using:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset an existing database.

Apply cloud migrations only to the explicitly selected development/staging project during verification.

Run applicable formatting, lint, type, authentication, authorization, database, cloud API, worker, UI, integration, and build checks.

Report:

1. Files and migrations changed.
2. Supported configuration domains.
3. Ownership and trust model.
4. Permission/session invalidation behavior.
5. Offline and expiry behavior.
6. Acknowledgement guarantees.
7. Automated test results.
8. Live verification completed or pending.
9. Unresolved production policy decisions.
10. Readiness for Phase 34.

## Acceptance Criteria

- Cloud configuration has an explicit authoritative owner.
- Only authorized cloud users can publish access changes.
- Only the intended enrolled host can receive and acknowledge them.
- Snapshots are versioned, validated, and protected against rollback.
- Local application is atomic.
- Removed access cannot survive through stale local session claims.
- Cloud publication and local application are displayed separately.
- Offline expiry follows approved policy without invented extensions.
- Credentials and locally authoritative financial records remain protected.
- Failed acknowledgements recover without reapplying changes.
- Upload failures do not unnecessarily block access refresh.
- Tests pass and remaining production-policy or live acceptance work is documented.