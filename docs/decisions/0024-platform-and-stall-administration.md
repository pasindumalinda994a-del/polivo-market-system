# 0024 — Platform and Stall Administration

- Status: Accepted
- Date: 2026-11-19

## Context and source

Phase 36 (`36-platform-and-stall-administration.md`) requires separate platform and stall administration while preserving tenant isolation and local operational authority. Foundations: ADR 0009 (owner-only stall admin, no ownership transfer), Phases 13–14 (memberships/devices), Phase 33 (config delivery), Phase 35 (reporting authorization).

## Decision

1. **Platform administrator.** Authority lives in a dedicated `platform_administrators` table keyed by Clerk `external_subject` (`identity_provider = 'clerk'`). Email, display name, and client metadata are never proof of platform authority. Bootstrap is a restricted operator/SQL procedure inserting a known subject. There is no public bootstrap route and no automatic promotion of the first registered user. Migrations must not grant platform authority to existing users.

2. **Market administrator.** Not implemented. There is no market entity; `tenants.market_location` remains free text. Do not invent market-scoped roles until a market model is approved.

3. **Stall administration.** Remains owner-only per ADR 0009. There is no delegated stall-administrator role expressible as an operational capability. Ownership transfer and tenant deletion remain unavailable. Last active owner protection stays enforced at the database transaction boundary.

4. **Lifecycle transitions.** `tenants.status` continues to allow `active | inactive | suspended` in schema, but Phase 36 does **not** expose suspend, archive, or reactivate mutations. Transition effect matrices (web access, invitations, enrollment, config, upload drain, offline acknowledgement) stay unresolved; leave those actions unavailable. Do not change `has_active_reporting_access` to gate on `tenants.status` until that open question is decided.

5. **Profile administration.** Cloud-owned stall profile fields (`display_name`, `market_location`, `contact`, `timezone`, restricted `admin_notes`) use a monotonic `profile_revision` and expected-revision updates. Profile edits must not rewrite historical bill headers, payments, tenant IDs, ownership keys, or sequences. When profile data must reach the host, publish through Phase 33 and distinguish cloud publication from local application.

6. **Financial and diagnostic boundary.** Administrative surfaces add no financial write controls. Platform admin does not automatically grant Phase 35 reporting or Phase 34 recovery. Farmer and buyer records remain local business parties, not Clerk memberships. No farmer/buyer online application workflow in this phase.

7. **Audit.** Administrative mutations write `admin_audit_events` atomically. Ordinary administrators cannot edit or delete audit history. Platform admins may read audit across stalls; owners retain tenant-scoped read.

## Reasoning

Guide 36 requires platform directory and consolidated stall admin without inventing unresolved lifecycle, market, or ownership-transfer policy. A separate trusted subject store matches existing membership patterns and blocks privilege escalation through tenant permission editing. Leaving status mutations unavailable avoids silently choosing suspension effects that remain open questions.

## Consequences

- Forward cloud migration adds `platform_administrators`, tenant `profile_revision` / `admin_notes`, directory and profile RPCs, and platform audit SELECT.
- Web gains a platform workspace gated on the trusted store and an owner Profile page alongside existing Members / Permissions / Devices.
- Ops guide documents operator bootstrap SQL and unavailable lifecycle actions.
- Open questions for suspension effects, upload drain, reporting vs `tenants.status`, and market scope remain in `progress-tracker.md`.

## Related implementation phases

- Phase 13 — tenant onboarding and role management
- Phase 14 — device enrollment
- Phase 33 — cloud configuration and access sync
- Phase 34 — sync reconciliation (diagnostic links only)
- Phase 35 — read-only web reporting
- Phase 36 — platform and stall administration
