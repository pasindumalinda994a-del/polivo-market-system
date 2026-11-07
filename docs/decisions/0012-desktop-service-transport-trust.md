# 0012 — Desktop Service Transport Trust

- Status: Accepted
- Date: 2026-11-05

## Context and source

Phase 14 stored terminal pairing metadata (`hostDeviceId`, stall display name) and Ed25519 device keys, but did not establish encrypted transport or a server-identity pin. Phase 16 requires desktops (host PC and LAN terminals) to connect to the stall Fastify service without silently trusting the first server that answers. Source: `docs/implementation/16-desktop-service-connection-and-lan-terminals.md`, ADR [0010](./0010-device-credential-storage.md), architecture auth invariants.

## Decision

1. **Encrypted transport:** Staff credentials and session material travel only over HTTPS. Plain HTTP is not used for `/local-auth/*` or `/connection/identity`.
2. **Host TLS material:** The stall service generates and persists a self-signed TLS certificate and private key under the service account (alongside host device credentials). LAN mode fails startup if TLS material cannot be loaded or created.
3. **Enrollment trust pins:** At successful `POST /enrollment/terminals/accept` (loopback pairing), the host returns a signed trust bundle: `hostDeviceId`, host Ed25519 `hostPublicKey`, `hostCredentialVersion`, `stallDisplayName`, and `tlsCertificateSha256`. The terminal stores these pins separately from the editable `serviceBaseUrl` / host address.
4. **Identity verification:** Before sign-in, the desktop main-process client connects with certificate pinning, calls `GET /connection/identity`, and verifies the Ed25519 signature with the pinned host public key and matching TLS fingerprint. `/health` alone is never sufficient.
5. **Reject unsafe links:** Certificate mismatch, host-identity mismatch, HTTP downgrade, and redirects to another origin are rejected. A reachable address or familiar display name is not trust.
6. **Interface scoping:** Loopback-only provisioning routes (`/enrollment/terminals/accept`, `/local-auth/setup-owner`) reject non-loopback clients even when the LAN listener is enabled.
7. **Re-pair for legacy pins:** Terminals paired before this decision without trust pins must re-pair on the host. Trust is not bootstrapped over an unverified LAN.

## Reasoning

Ed25519 already authenticates devices to the service (Phase 14/15). Transport trust needs the reverse direction: the terminal must know it is speaking to its paired host. Binding a self-signed TLS certificate fingerprint to a host-signed identity message reuses the existing host key without introducing a separate PKI, while HTTPS provides confidentiality on the LAN.

## Consequences

- Stall-service config gains explicit listen mode (`loopback` default, `lan` opt-in), TLS paths, and HTTPS listen.
- Desktop main owns the pinned HTTPS client, device proofs, and staff session secrets; the renderer never receives them.
- Ops documentation must describe firewall scope for the service port, trust re-pair, and safe address changes for the same host.
- Physical two-PC LAN acceptance remains a separate verification step from loopback HTTPS tests.

## Related implementation phases

- Phase 14 — Stall provisioning and device enrollment
- Phase 15 — Local staff authentication and offline access
- Phase 16 — Desktop service connection and LAN terminals
