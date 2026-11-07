# 0009 — Tenant Onboarding and Role Management

- Status: Accepted
- Date: 2026-11-02

## Context and source

Phase 13 requires web stall onboarding, membership lifecycle, invitations, and owner-configurable operational capabilities. Source: `docs/implementation/13-tenant-onboarding-and-role-management.md`, domain capability constants (ADR 0003), cloud membership foundation (ADR 0008).

## Decision

1. **Tenant creation:** Any authenticated Clerk user may create a stall. The creator becomes the sole initial owner membership. Creation does not grant access to any other stall. Ownership is never inferred from stall name, email domain, phone, or physical stall number.
2. **Operational roles:** Cloud membership `access_role` values are `owner` | `billing_staff` | `cashier`. The former cloud-only `reporting_reader` role is replaced; any active membership with these roles may read reporting copies via `has_active_reporting_access`.
3. **Capabilities:** Operational authorization uses the domain `PERMISSION_CAPABILITIES` catalog. Unknown capabilities are rejected. Do not authorize features with bare `role === "cashier"` checks. Owner administration (membership, invitations, permission profiles, ownership) is granted by active ownership only and is not expressible as an operational capability grant.
4. **Default profiles:** `BILLING_STAFF_DEFAULT_CAPABILITIES` and `CASHIER_DEFAULT_CAPABILITIES` are recommendations seeded at stall creation. The owner must review selected permissions before saving profile changes.
5. **Invitations:** One Polivo-table invitation mechanism (not Clerk Organizations). Email-bound copyable links; store token hash only; 7-day expiry; revocable; single-use atomic acceptance using verified provider email. Removed members are not reactivated by old invitations.
6. **Ownership transfer:** Not available. Role editing must not demote or remove the last active owner. Tenant deletion is not implemented.
7. **Mutations:** Narrow `SECURITY DEFINER` RPCs with fixed `search_path`, deriving actor identity from `auth.jwt()`. No generic privileged table-write helper. Ordinary dashboard reads continue to use the user-context client only.
8. **Cloud vs local:** Permission profile revisions are cloud configuration. Saving to cloud does not imply desktop application. Local enforcement and sync acknowledgements belong to later phases.

## Reasoning

Phase 11 established read-only membership for reporting. Phase 13 must add write paths without weakening financial RLS or inventing dual membership systems. Capability-based profiles match confirmed business rules while keeping administrative powers distinct from operational staff profiles. Hashed invitation tokens and last-owner guards protect tenant integrity.

## Consequences

- Forward migration extends `tenants` / `tenant_memberships` and adds profiles, invitations, onboarding idempotency, and admin audit tables.
- Isolation fixtures and web membership filters must use the new roles.
- Device provisioning, local staff credentials, and permission synchronization remain deferred (phase 14+).
- Remote application of the new migration to a shared Supabase project still requires explicit operator verification.

## Related implementation phases

- Phase 13 — Tenant onboarding and role management
- Phase 14 — Stall provisioning and device enrollment
- Later local-authentication and permission-sync phases
