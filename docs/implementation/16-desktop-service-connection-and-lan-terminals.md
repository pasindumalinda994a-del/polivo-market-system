# 16 — Desktop Service Connection and LAN Terminals

## Goal

Connect the Electron desktop application to the stall’s Fastify service. The desktop on the host PC and desktops on additional terminals must use the same service and the same authoritative SQLite database.

The acceptance scenario is a cashier at a second Windows PC. They connect to the paired host, sign in, and see their verified stall and staff identity. If the internet goes down, they continue using the host under phase 15’s offline policy. If the host itself becomes unreachable, the desktop blocks operations that require it and offers a safe reconnect.

## 1. Inspect the existing implementation

1. Read `AGENTS.md`, the six context files, and `docs/context/progress-tracker.md`.
2. Inspect phase 14’s actual pairing records, credential storage, and host identity verification. Identify what the terminal already trusts about its host.
3. Inspect phase 15’s actual sign-in, current-session, and sign-out contracts. Record how the service authenticates the device and binds the staff session to it.
4. Inspect the Electron main, preload, and renderer boundaries, the current Fastify listener, and the phase 07 desktop status area.
5. Mark phase 16 as in progress. Use the actual routes and package exports in the repository.

If a required device proof or staff-session check is missing, identify the specific gap. Keep protected LAN access disabled until the real check works. A test adapter belongs only in test composition.

## 2. Implement the connection path

Use this path for both host and terminal desktops:

    Electron renderer
      → narrow preload methods
      → Electron main-process service client
      → authenticated Fastify service
      → host SQLite database

The host desktop may connect through a configured local endpoint. A terminal connects through the host’s configured LAN endpoint. Both use the same authorization rules.

Keep `@polivo/db-local` inside the stall service. Launching a terminal must never initialize SQLite, create a second stall service, or start a replacement host when the configured host is unavailable.

## 3. Configure the host listener and trust

Preserve loopback as the default. Add an explicit LAN mode for a provisioned host, with a validated bind address, fixed port, and protected transport configuration. Fail startup with an actionable error if required configuration is missing or the selected port is occupied.

Before transmitting staff credentials or session material:

- Establish encrypted transport and verify the server identity against the trust established during enrollment. Use the repository’s approved certificate or public-key trust mechanism.
- Verify that the responding host belongs to the paired stall. A reachable address, a familiar display name, or an HTTP 200 from `/health` is insufficient.
- Keep private host keys accessible only to the service account. Use the phase 14 terminal credential from Electron’s protected storage.
- Reject certificate errors, identity mismatches, protocol downgrades, and redirects to another origin. Keep the trusted identity separate from the editable network address.
- Keep provisioning, maintenance, and diagnostic routes scoped to their intended interfaces. Enabling the LAN listener must not accidentally publish loopback-only setup or reset operations.

If phase 14 stored a host identity but did not establish transport trust, implement and document the authenticated link between the two. Never silently trust the first server that answers. Verify driver and framework configuration against the installed versions’ official documentation.

## 4. Add the Electron main-process client

Create one service client per active desktop connection. It owns the selected endpoint, device proof, request timeouts, staff session secret, and connection lifecycle.

Expose a small typed preload API for these actions:

| Action | Renderer-visible result |
| --- | --- |
| Read connection status | Safe state, verified host/stall label when available, and last successful check. |
| Configure or test a host address | Validation result and host verification outcome. |
| Sign in | Verified staff display information and allowed presentation capabilities. |
| Read current session | Current staff identity or a sign-in/refresh requirement. |
| Sign out or lock the terminal | Cleared local staff state and the actual server revocation outcome. |
| Retry connection | Result of reconnecting to the configured, paired host. |

Accept fixed operations and validated arguments. Keep arbitrary URLs, headers, IPC channels, raw HTTP clients, filesystem access, device credentials, and reusable staff tokens out of the renderer. Validate the IPC sender and payload in the main process. Redact passwords, PINs, session tokens, and device proofs from logs and traces.

Configure client calls with bounded timeouts and cancellation. Cancel outstanding requests when the endpoint or staff context changes. A late response from a previous connection must never restore the previous cashier or overwrite the new connection state.

## 5. Build the desktop connection and sign-in flow

Use the shared Polivo UI components. Keep the workflow usable by keyboard.

1. **Configure:** Show the paired host label and an editable address or hostname where appropriate. Validate the address before connecting. Keep configuration free of embedded credentials.
2. **Verify:** Test reachability, transport trust, and paired-host identity. Display the verified stall name before requesting staff credentials.
3. **Sign in:** Submit the entered staff credential through the narrow IPC method. Clear the secret input after submission. Prevent duplicate submissions and restore focus to the appropriate field on failure.
4. **Enter the workspace:** Display the verified staff name, stall, and connection state. Use capabilities to control presentation. Fastify remains responsible for enforcing them.
5. **Switch staff:** Clear the previous person’s session and private screen state before displaying the sign-in form. Keep device pairing intact.

Use service responses to distinguish an incorrect credential, revoked device, expired session, and offline-policy refresh requirement. Preserve phase 15’s generic sign-in failure where revealing more would disclose staff-account information.

## 6. Handle outages and reconnects explicitly

| Observed condition | Required behavior |
| --- | --- |
| Internet unavailable, paired host reachable | Continue eligible local operations under phase 15 policy. A cloud outage alone must not sign the cashier out. |
| Host unreachable or restarting | Show `Stall host unavailable`, block host-dependent actions, and offer retry. |
| Host reachable, identity verification fails | Stop before sending credentials. Show `Host identity could not be verified` and direct the operator to pairing or recovery. |
| Verified host returns after interruption | Revalidate the device and current staff session before enabling the workspace. |
| Session expired or permission refresh required | Show the service’s required next action. Reconnecting must not extend session or policy validity. |
| User signs out while the host is unreachable | Lock the desktop immediately and clear access to the previous user’s data. Report local sign-out accurately. Claim server revocation only after acknowledgement. |

Use bounded backoff for background reconnects and allow a manual retry. Keep one reconnect attempt active at a time. Health checks must not count as staff activity or keep an idle session alive.

A timeout after submitting a command can leave its outcome unknown. For future mutations, preserve the original idempotency key and use phase 10’s durable result semantics before replay. Never treat a lost response as proof of failure or generate a fresh key for an automatic retry. Keep durable financial writes on the host.

## 7. Verify the connection at three levels

### Service and client integration

Use a real listener on an isolated test interface and disposable identities. Verify a valid paired connection, wrong-host rejection before credential transmission, invalid device proof, bounded timeout, session expiry, and successful reconnect after a service restart. Verify that a delayed response cannot restore a signed-out session.

### Electron smoke test

Launch the built desktop application and exercise the real preload boundary. Verify keyboard sign-in, truthful status updates, staff switching, and renderer isolation. Confirm that an unpaired terminal cannot reach an authenticated workspace and that no terminal database is created.

### Two-PC acceptance test

Use a synthetic stall and dedicated test accounts. Record the outcome of each step separately:

1. Start the service on the host PC. Connect the host desktop and the paired terminal desktop. Confirm both display the same verified stall.
2. Sign in on the terminal. Confirm Fastify sees the correct device and staff identity. An owner-only request from a cashier must still be denied.
3. Disconnect internet access while preserving the LAN. Verify a permitted service-backed action, such as current-session retrieval. If policy allows a new offline shift, sign out and sign in again.
4. Stop the host service. Confirm the terminal blocks protected actions and shows the host outage.
5. Restart the host. Confirm the terminal reconnects to the same identity and either restores a valid session or requests sign-in according to phase 15.
6. Point the terminal at a different test host. Confirm verification fails before staff credentials are sent.
7. Sign out on one terminal. Confirm the other terminal’s independent session is unaffected.

If a second Windows PC is unavailable, report the real-socket and Electron results separately and leave physical LAN acceptance pending. A loopback test does not verify Windows firewall configuration or communication between two machines.

## 8. Document and finish

Create `docs/operations/desktop-service-connection-and-lan-terminals.md`. Include the exact host and terminal startup commands, configuration names, service port, trust setup, and firewall scope used by the implementation. Add a short troubleshooting table for host unreachable, wrong host identity, revoked pairing, and expired staff session. Explain how to change the address of the same host safely and when a replacement requires recovery.

Run applicable repository checks, including `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e:desktop`, and `pnpm check`. Run the web smoke suite if shared UI or contracts changed. Verify the compiled desktop and service together.

Update `docs/context/progress-tracker.md` with the working connection path, trust mechanism, outage behavior, checks run, and any pending physical LAN verification. Keep billing, printing, financial synchronization, installers, and host replacement in their assigned phases.

In the completion report, provide the exact steps to connect the first terminal, the observed results for loss of internet versus loss of host, and readiness for phase 17, `17-farmer-management.md`.