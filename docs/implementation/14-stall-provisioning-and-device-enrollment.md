# 14 — Stall Provisioning and Device Enrollment

## Goal

Let a stall owner activate one Windows host for an existing stall and enroll additional computers as terminals for that host.

At the end of this phase, the owner can authorize a host from the Polivo web dashboard, bind its local SQLite database to the correct stall, pair a terminal, and rotate or revoke device credentials. An interrupted activation can resume without creating a second host or resetting the database.

A device identity identifies a computer. Phase 15 supplies the staff identity and permissions needed to perform business operations. Phase 16 connects desktop terminals to the service over the LAN.

## 1. Read the existing implementation

1. Read `AGENTS.md`, the six files in `docs/context`, and accepted provisioning decisions.
2. Inspect the actual phase 09 database initialization and migration commands, phase 10 execution context, phase 11 RLS policies, and phase 13 owner checks and audit helpers.
3. Check whether installation identity, stall binding, or device records already exist. Reuse them where they satisfy this guide.
4. Mark phase 14 as in progress in `docs/context/progress-tracker.md`. Record any difference between local verification and the migration state of the hosted development project.

Keep migration `001` intact. Add focused forward migrations for enrollment. Use disposable databases and synthetic stalls for development tests.

## 2. Define the host and terminal roles

| Role | What enrollment establishes | Where the credential belongs |
| --- | --- | --- |
| Stall host | One installation operates the authoritative SQLite database for one stall. | Protected storage accessible to the Windows account running the Fastify service. |
| Terminal | One Electron installation is paired with a specific stall and host. | Protected storage accessible to Electron’s main process for that installation. |
| Stall owner | A verified Clerk user with current owner membership may authorize or revoke enrollment. | Existing web session and phase 13 membership checks. |

Use a stable installation ID and a distinct credential version. A computer name, IP address, device label, or installation ID alone is insufficient proof of identity.

Enforce one active host per tenant in PostgreSQL. Include pending host reservations in the concurrency design so two installations cannot both complete activation. An existing host requires a separate recovery or replacement procedure. Revoking its cloud credential must never automatically authorize a second financial writer.

## 3. Add enrollment records and access controls

Create the smallest cloud and local schemas necessary for the implemented flows.

**Cloud records** should identify the tenant, device role, intended host, installation identity, credential verifier or public key, credential version, enrollment state, and relevant timestamps. Store a digest of each short-lived, single-use enrollment secret. Record issuance, expiry, consumption, revocation, and the authorizing owner.

**Host SQLite records** should preserve the database installation identity, its stall binding, the host device ID, credential reference, activation progress, and locally accepted terminal identities. Store enough nonsecret state to resume after restart.

Apply tenant-safe foreign keys, unique constraints, grants, and RLS. Expose only the device metadata an owner needs. Keep credential verifiers, enrollment-secret digests, and internal recovery records outside ordinary user reads. Direct table writes must not let a member enroll themselves, change a terminal into a host, or move a device between stalls.

## 4. Implement owner-authorized enrollment

Add an owner-only **Devices** area to the existing stall dashboard. Reuse the phase 13 owner-authorization path for every mutation.

Support these actions:

- Reserve and authorize the first host.
- Authorize a terminal for the active host.
- View device labels, roles, and confirmed enrollment states.
- Cancel an unused enrollment.
- Revoke an enrolled device.

Issue a short-lived, single-use enrollment secret scoped to the **tenant, device role, intended host, and deployment environment**. Show it once over an authenticated connection. Keep secrets out of URLs, logs, analytics, command-line arguments, screenshots, and audit records. Bound redemption attempts and enforce expiry on the server.

Recheck the issuing owner’s authority and the stall’s eligibility at redemption. A revoked grant or removed owner must not leave a usable enrollment grant. Use a database transaction for grant consumption, device registration, and the corresponding audit record.

## 5. Activate the host and bind SQLite

Provide a working host activation entry point that can run before the installer exists. A service-side setup command with a protected interactive prompt is sufficient. Run it under the same operating-system identity that will run the service.

Implement this sequence:

1. Open the explicitly selected local database using phase 09’s initialization/opening rules. Verify schema compatibility and inspect its existing binding before contacting the cloud.
2. Reject activation if the database belongs to another stall. Stop for explicit recovery if existing business data has missing or inconsistent ownership. Preserve the file in both cases.
3. Generate the installation’s device credential locally using a supported platform/library mechanism. Persist its protected secret and the pending activation identifier before sending the redemption request.
4. Redeem the grant over authenticated TLS. Bind the request to this installation and proof of possession of its credential. Derive tenant and role from the verified grant.
5. In one cloud transaction, validate the reservation and register the intended host. Return a verifiable enrollment result tied to that installation.
6. In one SQLite transaction, persist the matching tenant, host identity, credential reference, and activation state. Verify the protected credential can be reopened under the service account.
7. Send device-authenticated confirmation. Show the host as activated only when the recorded state supports that claim.

SQLite and PostgreSQL commit separately. Persist enough progress to recover from a lost response or process restart at either boundary. A retry from the same installation must prove possession and resume its original enrollment. Reuse by a different installation must fail, even if it knows the grant or operation ID.

If protected storage fails, leave activation incomplete and present a recovery action. Never overwrite a previous binding, delete a database, or fall back to plaintext credentials to make setup succeed.

## 6. Pair a terminal with the intended host

Provide a minimal terminal enrollment action in the Electron application.

1. The owner authorizes a terminal for a specific activated host.
2. The terminal generates and stores its own credential through the Electron main process.
3. The terminal redeems its grant and receives a host-bound pairing record. Show the verified stall and host labels so the operator can identify the destination.
4. Give the host a way to verify and record that pairing. For this phase, use an authenticated enrollment-metadata exchange or a verifiable pairing artifact. Keep the existing loopback service default.
5. Mark pairing complete only after the host has durably accepted the terminal identity. If cloud registration succeeds first, show `Waiting for host confirmation`.

A paired terminal must not initialize a stall SQLite database, acquire host privileges, or inherit the owner’s web session. Expose only narrow enrollment actions through the preload bridge. Keep private keys, reusable credentials, and raw IPC out of the renderer.

Document the paired identities and host trust information that phase 16 will use to authenticate both ends of the LAN connection.

## 7. Implement rotation, revocation, and offline behavior

Use a maintained credential mechanism and document the choice against the installed Node.js, Electron, and Windows runtimes. Verify the secure-storage implementation under the actual host service account and the terminal user account.

- **Rotation:** Install and prove possession of the replacement credential before retiring its predecessor. Persist the credential version. Make an interrupted rotation recoverable without creating another device or leaving two credentials valid indefinitely.
- **Cloud revocation:** Reject subsequent device-authenticated cloud operations once revocation commits. A revoked terminal cannot renew its credential or complete a pending pairing.
- **Local revocation:** Once the host receives and persists a terminal revocation, reject that credential locally, including after a host restart. Record the last confirmed device-state revision.
- **Internet outage:** A provisioned host can reopen its local binding and credentials without a cloud call. A disconnected host cannot know about a new cloud revocation until it receives it. Display cloud revocation and host acknowledgement separately.
- **Host recovery:** Preserve operational data and the single-host reservation when credentials are lost or the host is revoked. Defer physical replacement, restore, and safe transfer of write authority to phase 39.

Use any approved offline expiry policy from the project decisions. If the duration is unresolved, record it for phase 15. Device enrollment alone must never open a billing session.

## 8. Verify the failure cases

Use real local SQLite and disposable PostgreSQL for transaction and constraint tests. Use synthetic owners, members, grants, and devices. Exercise server operations directly as well as through the UI.

| Scenario | Required result |
| --- | --- |
| Account A authorizes the host for Test Stall A | One host is registered and one local database binds to Stall A. |
| Account B calls the same owner action directly | Access is denied and no grant, device, or binding is created. |
| An owner supplies another tenant’s device ID | The operation fails without disclosing or changing that device. |
| Two hosts redeem grants concurrently for one stall | At most one can activate. The losing database remains intact. |
| The cloud commits and the response is lost | The original installation resumes after restart. A different installation cannot claim the result. |
| SQLite binding succeeds and final confirmation is lost | Confirmation can be retried without changing the binding or issuing another credential. |
| A wrong-role, expired, cancelled, or consumed grant is presented | Redemption fails safely. Replay for recovery requires proof from the original device. |
| A terminal is paired to Host A and presented to Host B | Host B rejects it, including when device labels match. |
| Rotation is interrupted or a credential is revoked | The documented recovery path works. Retired or revoked credentials fail at the enforcing boundary. |
| The host restarts while offline | Its existing stall binding remains readable. Setup does not create a new database or host identity. |

Add a Windows smoke check that closes and restarts the relevant process and verifies it can use the protected credential again. Report simulated storage tests and actual Windows results separately. Check that errors, HTTP responses, and test artifacts contain no reusable secrets.

## 9. Document and finish

Create `docs/operations/stall-provisioning-and-device-enrollment.md`. Include the exact development commands, which computer runs each command, how the owner activates one host and pairs a second computer, what each status means, and how to resume an interrupted setup. Document which revocations require host acknowledgement.

Run the repository’s lint, formatting, type-check, unit/integration, cloud database, build, web E2E, and Electron smoke checks applicable to the changes. Verify the compiled service can load its migrations and secure-storage adapter. Report hosted development migration status separately from local test results.

Update `docs/context/progress-tracker.md` with the implemented enrollment path, credential-storage decision, recovery guarantees, tested platforms, and outstanding verification. Identify readiness for `15-local-staff-authentication-and-offline-access.md`.

In the completion report, give the owner’s activation steps, the terminal pairing steps, the results of the two-host race and interrupted-activation tests, and any remaining Windows or hosted-environment checks. Keep staff login, operational LAN access, financial synchronization, installer packaging, and host replacement in their assigned phases.