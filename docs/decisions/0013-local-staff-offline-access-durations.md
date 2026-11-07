# 0013 — Local Staff Offline Access Durations

- Status: Accepted
- Date: 2026-11-07

## Context and source

ADR [0011](./0011-local-staff-offline-policy-fail-closed.md) kept production offline staff access fail-closed until product durations were approved. Desktop owner/cashier sign-in under normal `pnpm dev:service` therefore always returned `Stall access needs an online refresh.` Source: Phase 15 guide, progress-tracker open question, operator acceptance for Phases 14–16.

## Decision

1. **Production policy values** (wall-clock milliseconds from trusted instants):
   - Session **idle timeout:** 2 hours. Idle is measured from `last_activity_at` updated only by authenticated, meaningful staff activity (command write-boundary authorization with `touchActivity: true`). Health checks, `GET /local-auth/session`, background polling, and automatic retries must **not** extend idle.
   - Session **absolute lifetime:** 12 hours from `issued_at`. Busy activity does not extend absolute expiry.
   - **Max capability snapshot age** while offline: 7 days (168 hours) from `authority_verified_at`. Age at or beyond the limit is expired (`age >= limit` → deny).
   - **First-ever staff login offline:** **Allowed** when the staff member has a local capability snapshot within max age, active credentials, and an accepted/activated device. No separate “must have signed in online once” gate.

2. **Composition default:** Stall-service production composition uses `createProductionOfflineAccessPolicy` with the values above (`label: "production"`). `productionFailClosedOfflineAccessPolicy` remains available for explicit tests only. TEST-ONLY injectable policy stays tests-only and must not be selectable via ordinary production environment configuration.

3. **Independent clocks (unchanged from 0011):** Session lifetime and snapshot age are independent. Signing in again starts a new session but must not renew `authority_verified_at`. Service or desktop restart must not extend existing deadlines; if sessions are not available after restart, require a fresh sign-in.

4. **Protected-path enforcement:** Snapshot freshness, absolute lifetime, and idle timeout are checked on protected operations via `allowProtectedAccess`, not only at sign-in. When any deadline is reached, protected work stops.

5. **Online refresh (trusted authority):** Until Phase 33 automated sync, recovering from snapshot expiry requires an **owner-authorized, single-use permission refresh grant** redeemed by the host. Redeem reads **live** cloud membership capabilities and `capabilities_revision` and applies them locally. Reapplying operator-typed capability lists or bumping timestamps without cloud verification is **not** a successful authority refresh. Internet alone is insufficient.

6. **Offline revocation limitation:** Locally applied device revoke, staff deactivate, credential reset, and capability reductions take effect immediately on the host. Cloud-only membership or device changes do **not** take effect locally until received and applied. During an outage, staff may retain last-known permissions until the snapshot expires (up to 7 days after last trusted verification). Do not describe offline cloud revocation as immediate.

7. **Deferred:** Fresher-auth capability subsets (stricter snapshot age for sensitive ops) and staff secret TTL/rotation remain open. All capabilities share the 7-day max for now.

## Reasoning

Vegetable-market shifts often run from early morning through afternoon; 12-hour absolute and 2-hour idle balance unattended-terminal risk against mid-shift friction. Seven-day snapshot trust covers multi-day connectivity gaps common at stalls while still bounding how long last-known permissions survive without a cloud-confirmed refresh. First login offline after online activate/setup matches real outage timing. Trusted refresh grants close the argv-only refresh hole so duration policy cannot be bypassed by re-stamping stale local caps.

## Consequences

- Desktop owner/cashier sign-in works under production policy when credentials, device, and snapshot checks pass.
- Ops must document grant authorize → host redeem for refresh; CLI no longer accepts free-form capability JSON as authority proof.
- Cloud memberships gain `capabilities_revision`, bumped on access updates.
- Phase 15 login blocker is resolved; full production readiness still requires real secure-storage reopen verification and operator confirmation of the refresh procedure. Offline revocation lag remains an accepted limitation until Phase 33.

## Related implementation phases

- Phase 15 — Local staff authentication and offline access
- Phase 16 — Desktop service connection and LAN terminals
- Phase 33 — Automated permission distribution (future)
