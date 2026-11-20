# Platform and Stall Administration

Phase 36 operations guide for platform directory, stall profile administration, and reuse of membership/device/config workflows. Financial writes remain out of scope.

Canonical decision: [ADR 0024](../decisions/0024-platform-and-stall-administration.md).

## Role matrix

| Role                                       | Authority store                                 | Admin powers                                                                                    |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Platform administrator                     | `platform_administrators` (Clerk `sub`)         | Stall directory, scoped operational detail, profile edit, audit read across stalls              |
| Market administrator                       | —                                               | **Not implemented** (`market_location` is free text only)                                       |
| Stall owner                                | Active `tenant_memberships.access_role = owner` | Profile, members, invitations, permissions publish, devices, config delivery view, tenant audit |
| Delegated stall administrator              | —                                               | **Not implemented** (owner-only per ADR 0009)                                                   |
| Billing staff / cashier / reporting member | Membership + capabilities                       | No administrative mutations                                                                     |
| Local billing staff / cashier              | Local staff identity                            | Desktop only; not a cloud admin role                                                            |

Platform authority is never inferred from email, display name, or client metadata. Stall owners cannot grant themselves platform access through tenant permission editing.

## Trusted platform-admin bootstrap

There is no public bootstrap route and no first-user promotion.

Operator procedure (development/staging):

1. Sign in once with the intended Clerk user and copy the Clerk user `sub` (JWT `sub` claim).
2. Against the linked Supabase project, as a privileged operator:

```sql
INSERT INTO public.platform_administrators
  (identity_provider, external_subject, status, created_by_subject, notes)
VALUES
  ('clerk', '<CLERK_SUB>', 'active', 'operator', 'bootstrap')
ON CONFLICT (identity_provider, external_subject) DO UPDATE
SET status = 'active', updated_at = now();
```

3. Sign out and sign in again, then open `/platform`.

Migrations never backfill platform administrators. Automated tests may insert synthetic subjects via `seedPlatformAdministrator` only.

To revoke:

```sql
UPDATE public.platform_administrators
SET status = 'inactive', updated_at = now()
WHERE identity_provider = 'clerk' AND external_subject = '<CLERK_SUB>';
```

## Scope and delegation

- Platform APIs: `/api/platform/directory`, `/api/platform/stalls/:tenantId`, `/api/platform/audit`.
- Stall profile API: `GET|PATCH /api/tenants/:tenantId/profile` (owner or platform admin).
- Stall audit API: `GET /api/tenants/:tenantId/audit` (owner).
- Membership, invitations, permissions, and devices reuse Phase 13–14 RPCs (owner-only).
- Tenant APIs cannot assign platform roles.
- Expected `profile_revision` is required for profile updates; stale revisions return conflict.

## Stall lifecycle

Schema statuses remain `active | inactive | suspended`. **Suspend, archive, and reactivate mutations are unavailable** until a transition-effect ADR exists.

Directory and profile screens show status as read-only. Do not invent subscription or licence enforcement. Cloud suspension cannot instantly stop an unreachable local host (ADR 0013 offline lag).

Open questions remain in `docs/context/progress-tracker.md` for reporting gating by `tenants.status` and upload drain during suspension.

## Owner continuity

- Active stalls must retain at least one active owner (ADR 0009).
- Ownership transfer is unavailable.
- Role editing cannot promote to owner or demote the last owner.
- Emergency owner recovery is an operator procedure outside the ordinary UI.

## Invitations and membership

Reuse Phase 13 behaviour: hashed invitations, verified recipient email, no reactivation of removed members via old invitations, last-owner protection. See [tenant-onboarding-and-access-management.md](./tenant-onboarding-and-access-management.md).

## Local staff versus web identities

- Inviting a web member does not create a desktop login.
- Local staff mappings and permission publication use Phase 33.
- Never display passwords, PINs, hashes, session secrets, or device private keys.
- UI must distinguish published vs host-applied access (`pending_delivery` until acknowledgement).

## Device administration

Reuse Phase 14 enrollment and Phase 33 revocation delivery. Expired authorizations must not appear active. Host replacement remains a later recovery phase.

## Offline enforcement

Cloud publication ≠ local enforcement. Profile display fields are cloud-web authoritative and do not rewrite historical bill headers. Access/device changes require host pull/ack.

## Audit access

- Mutations write `admin_audit_events` atomically.
- Owners: tenant-scoped SELECT.
- Platform admins: cross-stall SELECT.
- No UPDATE/DELETE for ordinary administrators.

## Recovery and support boundaries

- Do not expose SQL execution, credential dumps, remote shell, or balance overrides.
- Platform role does not auto-grant Phase 35 reporting or Phase 34 recovery.
- Link to existing sync diagnostics instead of duplicating repair tools.
- Farmer/buyer records remain local business parties — not Clerk memberships. No online farmer/buyer application workflow in this phase.

## Migrations

Forward migration: `supabase/migrations/20261119180000_platform_and_stall_administration.sql`.

Apply to the selected development/staging project before live verification. Do not grant platform authority during migrate.

## Acceptance notes

Use synthetic development accounts only. Live enrolled-host checks for Phases 31–35 remain PENDING and are not claimed by Phase 36 local verification.
