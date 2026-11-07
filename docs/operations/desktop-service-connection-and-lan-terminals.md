# Desktop Service Connection and LAN Terminals

Phase 16 operations guide for connecting Electron desktops (host PC and additional terminals) to the stall Fastify service over HTTPS with enrollment-pinned host identity.

## Concepts

| Concept          | Meaning                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stall host       | Windows machine running `@polivo/stall-service` and the authoritative SQLite database                                                             |
| Terminal desktop | Electron app paired in Phase 14; never opens SQLite                                                                                               |
| Trust pins       | `hostDeviceId`, host Ed25519 public key, TLS certificate SHA-256, stall display name — stored at pairing, separate from the editable host address |
| Session secret   | Staff session token kept only in Electron main process memory                                                                                     |

Transport trust is recorded in [ADR 0012](../decisions/0012-desktop-service-transport-trust.md).

## Configuration

| Name                                           | Default                                  | Purpose                                                                                 |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `POLIVO_LOCAL_DB_PATH`                         | (required)                               | Absolute path to the stall SQLite file                                                  |
| `POLIVO_LISTEN_MODE`                           | `loopback`                               | `loopback` or `lan`                                                                     |
| `HOST`                                         | `127.0.0.1`                              | Bind address. Loopback mode requires loopback. LAN mode requires a non-loopback address |
| `PORT`                                         | `3040`                                   | Fixed HTTPS listen port                                                                 |
| `POLIVO_HOST_CREDENTIAL_ROOT`                  | `%USERPROFILE%\.polivo\host-credentials` | Host device keys, TLS material, stall display meta                                      |
| `POLIVO_TLS_KEY_PATH` / `POLIVO_TLS_CERT_PATH` | auto under credential root               | Optional explicit PEM paths (both required together)                                    |

Protocol: **HTTPS only** for `/connection/identity` and `/local-auth/*`. Loopback-only routes: `POST /enrollment/terminals/accept`, `POST /local-auth/setup-owner`.

## Host startup (PowerShell)

```powershell
$env:POLIVO_LOCAL_DB_PATH = "C:\PolivoData\stall.sqlite"
# Optional LAN exposure after firewall rules are ready:
# $env:POLIVO_LISTEN_MODE = "lan"
# $env:HOST = "192.168.1.10"

pnpm --filter @polivo/stall-service start
```

Development:

```powershell
pnpm --filter @polivo/stall-service dev
```

On first start (or after `activate-host`), the service creates `tls/server-key.pem` and `tls/server-cert.pem` under the credential root if missing. Startup fails with an actionable error if TLS material cannot be loaded or if `PORT` is occupied (`EADDRINUSE`).

### Firewall scope (LAN mode)

Allow inbound TCP **only** to the stall service port (default `3040`) from the stall LAN, for the service account process. Do not expose provisioning ports beyond the host. Windows Firewall example (adjust address/scope):

```powershell
New-NetFirewallRule -DisplayName "Polivo Stall Service HTTPS" -Direction Inbound -Protocol TCP -LocalPort 3040 -Action Allow -Profile Private
```

## Terminal / host desktop startup

```powershell
pnpm --filter @polivo/desktop build
pnpm --filter @polivo/desktop preview
# or during development:
pnpm dev:desktop
```

### First terminal connect steps

1. On the **host PC**, start the stall service (HTTPS on `127.0.0.1:3040` by default).
2. Pair the terminal on the host PC (Phase 14 secret) so accept runs over loopback HTTPS and stores trust pins. Existing terminals without pins must **re-pair**.
3. Open desktop → **Configure host** with `127.0.0.1` (host desktop) or the host LAN IP (second PC) and port `3040`.
4. **Verify host** — desktop checks TLS pin + signed `/connection/identity` and shows the verified stall name.
5. Sign in with staff code + secret. Session secret never enters the renderer.
6. For a second PC: enable `POLIVO_LISTEN_MODE=lan` with the host’s LAN `HOST`, open firewall for port `3040`, point the terminal at that address. Do not re-bootstrap trust over the LAN.

## Changing the host address safely

- Same physical host, new IP/hostname: edit the address in desktop configure, verify again. Trust pins stay; no re-pair if the TLS cert and host Ed25519 key are unchanged.
- Host replacement or credential rotation that changes TLS or host keys: use the recovery/re-pair path (Phase 14 enrollment + host accept). Do not paste staff secrets at an unverified address.

## Troubleshooting

| Symptom                                | Likely cause                               | Action                                                                             |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Stall host unavailable                 | Service down, wrong address/port, firewall | Confirm service log listening HTTPS; retry; check LAN firewall                     |
| Host identity could not be verified    | Wrong host, MITM, stale pins, cert rotated | Stop before credentials; re-pair on the real host or restore TLS material          |
| Revoked pairing / device not enrolled  | Terminal revoked locally or not accepted   | Owner Devices revoke/authorize; host accept; re-pair                               |
| Expired staff session / online refresh | Session or offline policy (ADR 0013)       | Sign in again if absolute/idle expired; for snapshot age, owner-authorize permission refresh then `staff-cli refresh-permissions` |
| Trust pins missing                     | Paired before Phase 16                     | Re-pair on the host PC over loopback HTTPS                                         |

## Outage behavior

| Condition                | Behavior                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| Internet down, host up   | Keep local session; cloud outage alone does not sign out                     |
| Host unreachable         | Show stall host unavailable; block host-dependent actions; retry             |
| Host returns             | Revalidate identity and session before enabling workspace                    |
| Sign out while host down | Lock locally immediately; claim server revocation only after acknowledgement |

## Verification notes

- Automated: HTTPS identity + local-auth integration tests; Electron smoke for shell/preload isolation.
- Physical two-PC LAN + Windows firewall acceptance may remain pending when a second machine is unavailable. Loopback HTTPS does not prove cross-machine firewall behavior.

## Related docs

- [Stall provisioning and device enrollment](./stall-provisioning-and-device-enrollment.md)
- [Local staff authentication and offline access](./local-staff-authentication-and-offline-access.md)
- [Environment configuration](./environment-configuration.md)
- [Local development](./local-development.md)
