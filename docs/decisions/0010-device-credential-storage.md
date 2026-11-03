# 0010 — Device Credential Storage

- Status: Accepted
- Date: 2026-11-03

## Context and source

Phase 14 requires host and terminal device identity with proof of possession. Secrets must not live in plaintext SQLite, environment files, URLs, logs, or the Electron renderer. Source: `docs/implementation/14-stall-provisioning-and-device-enrollment.md`, `docs/context/architecture.md`, Node.js 26 / Electron 45 runtimes pinned in the monorepo.

## Decision

1. **Proof mechanism:** Each installation generates an Ed25519 keypair. The cloud stores the public key and a monotonic `credential_version`. The private key never leaves the machine that generated it. Installation ID alone is not proof of identity.
2. **Opaque references:** Local SQLite stores only a non-secret `credential_ref` (storage key) plus version and enrollment metadata. Private key material is never written to SQLite.
3. **Host (stall-service / Node.js on Windows):** Persist the private key with Windows DPAPI under the Windows account that runs the Fastify service (`CryptProtectData` / `CryptUnprotectData` via a thin native or FFI-backed adapter). Prefer Current-User scope so another Windows account cannot open the blob. Development and tests may use an in-memory or file-backed simulated adapter that is clearly labeled non-production.
4. **Terminal (Electron main):** Persist the private key with Electron `safeStorage` (OS keychain/DPAPI-backed encryption) in the main process. Expose only narrow enrollment actions through the preload bridge; never send private keys or reusable credentials to the renderer.
5. **Rotation:** Install and prove possession of the replacement key before retiring the predecessor. Persist `credential_version`. An interrupted rotation must resume without creating a second device or leaving two credentials valid indefinitely.
6. **Offline expiry:** Maximum offline duration and credential expiry remain an open product question (phase 15). Device enrollment alone must never open a billing session.

## Reasoning

Ed25519 gives compact possession proofs for grant redemption and later LAN auth without shipping shared HMAC secrets. Separating host DPAPI from Electron `safeStorage` matches the two process identities that actually hold credentials. Keeping secrets out of SQLite preserves the local-database backup/copy model without leaking device keys.

## Consequences

- Phase 14 adapters live in stall-service (host) and desktop main (terminal).
- Cloud tables store public keys and digests of one-time enrollment secrets, not private keys or plaintext grants.
- Simulated secure-storage results in tests must be reported separately from real Windows DPAPI / `safeStorage` smoke checks.
- Offline credential expiry policy still blocks production rollout claims until recorded under a later decision.

## Related implementation phases

- Phase 14 — Stall provisioning and device enrollment
- Phase 15 — Local staff authentication and offline access
- Phase 16 — Desktop-to-service LAN authentication
