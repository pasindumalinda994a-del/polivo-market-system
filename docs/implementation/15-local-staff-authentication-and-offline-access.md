# 15 — Local Staff Authentication and Offline Access

## Goal

Let an authorized staff member sign in to a provisioned stall host and work with the permissions assigned by the stall owner, including during an internet outage.

The acceptance scenario is a cashier starting a new shift after the internet goes down. On an enrolled terminal, the cashier can sign in if their local credential, device, and last verified access policy are still valid. The stall service allows the cashier’s assigned actions and rejects an owner-only action. Signing out leaves the terminal enrolled and ready for the next staff member.

Phase 15 implements and tests this behavior at the stall-service boundary. Phase 16 connects the desktop interface to that boundary over the LAN.

## 1. Inspect prerequisites and mark the phase in progress

1. Read `AGENTS.md`, the six files in `docs/context`, and the accepted access-policy decisions.
2. Inspect phase 10’s execution context, authorization adapter, transaction executor, and idempotency handling.
3. Inspect phase 13’s membership identities, capability catalog, and permission revisions.
4. Inspect phase 14’s stall binding, host activation, terminal pairing, credential verification, and local revocation state.
5. Mark phase 15 as in progress in `docs/context/progress-tracker.md`. Record which prerequisites are implemented and which have only been documented.

Reuse the actual verification and repository interfaces. If device verification is missing, continue independent local-auth work and identify the blocked integration. Keep any test identity injection inside test composition.

## 2. Establish the local identity and policy boundaries

| Identity or record | What it establishes |
| --- | --- |
| Bound stall | The tenant this host is authorized to serve. |
| Verified device | The enrolled host or paired terminal making the request. |
| Local staff identity | The person who authenticated for this shift. |
| Effective capabilities | The operations that person may perform at this stall. |
| Local session | Time-limited access for one person on one device at this stall. |

Derive tenant, device, and actor identity on the server. Treat a staff code as a login identifier. Keep it distinct from a password, device credential, Clerk subject, and farmer or trader code.

Web membership alone cannot issue a local session. Device enrollment alone cannot grant staff or owner permissions. Farmers and traders remain business records.

## 3. Make offline policy explicit

Read existing decisions first. Document the production policy for:

- The credential staff use to sign in and how it is initially issued or reset.
- Session idle timeout and absolute lifetime.
- Maximum age of the last trusted authorization snapshot while disconnected.
- Which capabilities, if any, require fresher authorization than ordinary billing.
- Whether first login is allowed offline and which enrollment steps must already be complete.
- What happens after restart, clock rollback, staff deactivation, device revocation, or credential reset.

Keep the session lifetime and offline authorization deadline independent. Signing in again may start a new session. It must not extend the age limit of an old permission snapshot. Restarting the service or changing the workstation clock must not renew offline access.

Inject a clock for testing. Use explicitly labeled test values to exercise the boundaries. Where production policy is unresolved, fail closed for the affected operation and record the missing decision. Do not choose an arbitrary outage duration that could lock every cashier out during a market shift.

## 4. Add local staff and session persistence

Add focused forward migrations in `packages/db-local`. Preserve existing migration checksums and financial records.

Store the minimum records needed for:

- Stable local staff ID, tenant binding, login identifier, and active/disabled state.
- Credential verifier, verifier format/version, and credential-change revision.
- Explicit association with an authorized cloud membership where applicable.
- Last trusted capability snapshot, its source revision, and the time its authority was verified.
- Session verifier, staff/device/tenant references, issue time, expiry, last activity, and revocation state.
- Bounded login-attempt tracking and redacted security audit events.

Enforce tenant-consistent relationships. Disabling a staff identity must preserve historical actor references. Store credential and session verifiers separately from business records. Exclude them from financial outbox events, reporting copies, logs, and diagnostic exports.

## 5. Implement first-owner setup and staff credential management

Provide a documented setup path that works before the installer and LAN interface exist.

### First owner

Require an activated host and fresh proof that the person performing setup is an active owner of that host’s bound tenant. Reuse the verified online ownership boundary or an owner-authorized, short-lived, single-use setup grant specific to this purpose. A phase 14 device enrollment grant must not double as a staff credential.

Create the local owner and consume the setup authorization safely. Handle simultaneous attempts and interrupted setup without creating a second owner or leaving an unrecoverable half-created identity. An empty staff table must never allow the first person reaching the service to claim ownership.

### Billing staff and cashiers

Implement owner-authorized local staff activation, credential reset, and deactivation. Link staff to their intended membership or approved local assignment through stable identities. A matching email, display name, or role label is insufficient proof of that link.

Use the approved password or PIN policy and a maintained password-hashing implementation with salted, adaptive verifiers. Verify library support on the selected Node.js and Windows runtime. Prompt for secrets through protected input. Keep credentials out of command-line arguments and shell history.

A credential reset must invalidate existing sessions for that staff member. A deactivated account must fail both new login and subsequent session validation. Audit who performed each administrative action without recording secret values.

## 6. Apply a trustworthy initial permission snapshot

Reuse phase 13’s owner-managed capability assignments. Establish a narrow, authenticated way to initialize the correct staff member’s local snapshot before offline use. An explicit online initialization or refresh for that member is sufficient for this phase. Automated background distribution belongs to phase 33.

Verify the source, tenant, staff association, membership state, capabilities, and revision before committing a snapshot. Reject an older revision or an attempt to apply another stall’s assignment. An unsuccessful refresh must not advance the last-verified time or replace a valid snapshot with an empty permission list.

A successful authoritative check may confirm an unchanged revision and refresh its verification time. Reading the same data from SQLite cannot do that.

When the host learns of a permission reduction, enforce it on the next protected request, including for an existing session. Display the last verified time where it matters. A web change made while the host is disconnected becomes locally enforceable when the host receives it or the applicable offline authorization expires.

## 7. Implement local login, session validation, and logout

Add narrow Fastify operations for local sign-in, current-session lookup, and sign-out. Use shared transport contracts and the existing public error format. Preserve loopback binding during this phase.

### Sign-in

1. Verify the host is activated for the bound stall.
2. Verify the caller using phase 14’s device identity and locally known revocation state.
3. Validate the login input, rate-limit repeated attempts, and verify the local staff credential.
4. Check account status and whether the access policy permits a new session at the current time.
5. Issue a fresh, cryptographically random session secret bound to this tenant, staff member, and device. Store only its verifier. Return the secret only through the intended credential channel.

Give a generic response for invalid credentials. Record enough protected audit information to diagnose abuse. Scope throttling so an attacker on one terminal cannot easily block every cashier in the stall.

### Session use and logout

Require both the verified device and its matching staff session for protected commands. Reject expired, revoked, wrong-device, and wrong-tenant sessions. Ignore actor, role, and capability claims supplied by the renderer.

Check the current staff state, credential revision, effective capabilities, and offline deadline. Update activity only for qualifying user activity. Background polling must not keep an unattended terminal signed in indefinitely.

Logout must invalidate the server-side session and be safe to repeat. Staff switching on a shared terminal must clear the previous person’s session state before the next login. Device enrollment survives logout.

Document the credential handoff expected by phase 16. Keep reusable session secrets out of renderer local storage, URLs, logs, and shared UI state.

## 8. Connect authorization to the phase 10 command executor

Replace the deny-by-default placeholder with the real local authorization adapter wherever its prerequisites are present.

For every protected operation:

1. Resolve the bound stall, verified device, and valid staff session.
2. Determine the capability required by the server-side command definition.
3. Evaluate that capability against the current locally trusted assignment and offline policy.
4. Populate the execution context with the verified actor and device.
5. Recheck mutable authorization state at the write boundary so a concurrent deactivation cannot authorize a later write.
6. Apply the same authorization checks before returning a stored idempotent result.

Use `401` for missing or invalid authentication and `403` for an authenticated caller lacking access. Give policy expiry an actionable message such as `Stall access needs an online refresh.` Keep an internet outage distinct from an incorrect password.

Roles may supply starting profiles. The owner’s effective capability assignment determines what billing staff and cashiers can actually do.

## 9. Verify real offline behavior and failure cases

Use a migrated, temporary, file-backed SQLite database. Exercise Fastify through its actual authentication handlers. For offline scenarios, explicitly disable or fail outbound cloud access and verify the successful local path makes zero cloud calls.

| Scenario | Expected result |
| --- | --- |
| Provisioned cashier starts a shift during an internet outage | Login succeeds while all approved local validity conditions hold. |
| Valid device has no staff session | A protected operation is denied. |
| Valid staff credential is presented from an unknown or revoked device | Login is denied. |
| A cashier’s session secret is copied to another paired terminal | The second terminal cannot use it. |
| Cashier calls an owner operation directly | The service denies the operation and writes no business changes. |
| Cashier signs out and another staff member signs in on the same terminal | The old session fails and the new actor is recorded correctly. |
| An owner resets a credential or disables a staff member locally | Existing sessions lose access and the previous credential cannot start a session. |
| A newer snapshot removes a capability during an active session | The next request and an idempotent replay both enforce the reduction. |
| A refresh fails, the host restarts, or the clock moves backward | None extends the trusted offline deadline. |
| The offline deadline or absolute session expiry is reached exactly | The documented boundary is enforced, including after restart. |
| An old snapshot, wrong-stall assignment, or duplicate owner setup is submitted | The request fails safely and the original binding and permissions remain intact. |

Test successful allowed operations as well as denials. Use a test-only command registered solely in test composition if a suitable business feature does not exist yet. Run at least one restart check that reopens the database and verifies the documented session behavior.

## 10. Document the operator workflow and finish

Create `docs/operations/local-staff-authentication-and-offline-access.md`. Include the exact development commands or local actions for first-owner setup, staff activation, sign-in, sign-out, credential reset, deactivation, permission refresh, and recovery from offline expiry. State which steps require internet and which a stall can complete during an outage.

Run the repository’s lint, formatting, type-check, unit/integration, build, and `pnpm check` commands. Run cloud database tests if cloud operations or policies changed. Verify the compiled stall service can load the credential library on Windows, or record that platform check as pending.

Update `docs/context/progress-tracker.md` with the enforced policy, tested outage behavior, remaining decisions, and readiness for `16-desktop-service-connection-and-lan-terminals.md`.

In the completion report, give one reproducible cashier shift walkthrough, the results of the wrong-device and permission-revocation tests, and any unverified prerequisites. State whether phase 16 can connect to the local authentication interface and which policy decisions still block operational rollout.