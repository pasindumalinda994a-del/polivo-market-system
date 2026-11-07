# 0011 — Local Staff Offline Policy Fail-Closed

- Status: Accepted (default production durations superseded by [0013](./0013-local-staff-offline-access-durations.md); fail-closed object retained for tests)
- Date: 2026-11-04

## Context and source

Phase 15 requires local staff authentication, sessions, and offline authorization at the stall-service boundary. Production values for session idle/absolute lifetime, maximum trusted capability-snapshot age while disconnected, first-login-offline rules, and credential expiry remain open product questions (see `docs/context/progress-tracker.md` and ADR 0010 §6). Source: `docs/implementation/15-local-staff-authentication-and-offline-access.md`.

## Decision

1. **Production fail-closed:** Until an approved production offline access policy is recorded, production composition must refuse new local staff sessions and protected offline access that depend on product session lifetimes or snapshot max-age. Callers receive an actionable message such as `Stall access needs an online refresh.` Device enrollment alone never grants staff permissions.
2. **Injectable TEST-ONLY policy:** Automated tests may inject an explicitly labeled `createTestOnlyOfflineAccessPolicy` with synthetic lifetimes and snapshot max-age. Test-only policies and simulated secure storage must never become production defaults or be selectable through ordinary production environment configuration.
3. **Independent clocks:** Session lifetime and offline authorization deadline are independent. Signing in again may start a new session but must not extend the age limit of an old permission snapshot. Service restart or workstation clock changes must not renew offline access authority.
4. **Credential mechanics:** Staff codes are login identifiers, distinct from secrets, device credentials, Clerk subjects, and party codes. Staff secrets use a versioned salted adaptive verifier (`scrypt$v1$…` via Node.js `crypto.scrypt`). Exact production PIN/password length and complexity remain open.
5. **Unresolved product numbers:** Production session idle timeout, absolute session lifetime, max snapshot age while offline, fresher-auth capability list, and whether first login is allowed offline remain open. Phase 15 must not be marked production-ready until those are approved and verified.

## Reasoning

The acceptance scenario needs enforceable boundaries in tests without inventing a market-shift outage duration that could lock cashiers out in production. Fail-closed production behavior preserves safety while the full Phase 15 authentication machinery is built and verified.

## Consequences

- Production `AuthorizationAdapter` and offline policy refuse offline staff access until a later ADR records approved durations.
- Integration tests use TEST-ONLY policy injection through test composition (`buildTestApp` / dedicated helpers), matching simulated secure-storage practice from Phase 14.
- Progress tracker continues to list offline credential expiry and revocation as open questions blocking operational rollout.

## Related implementation phases

- Phase 14 — Stall provisioning and device enrollment
- Phase 15 — Local staff authentication and offline access
- Phase 16 — Desktop-to-service LAN authentication
