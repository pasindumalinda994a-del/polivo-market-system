# Tenant Onboarding and Access Management

Phase 13 operations guide for web stall creation, memberships, invitations, and owner permission configuration. Device enrollment and local staff enforcement are out of scope.

## Tenant creation

- Any authenticated Clerk user may create a stall via `POST /api/tenants`.
- The creator becomes the sole initial **owner** membership atomically with the tenant row.
- Required fields: display name, IANA timezone. Optional: market/location, contact.
- Idempotency: clients send a stable `idempotencyKey`. Replaying the same key and payload returns the same tenant. Reusing a key with a different payload returns a conflict.
- Display name alone does not deduplicate stalls.
- Success UI states: `Stall account created. Desktop setup is not complete.`

RPC: `create_stall_with_owner` (SECURITY DEFINER, identity from `auth.jwt()->>'sub'`).

## Membership authority

| Concept              | Meaning                                              |
| -------------------- | ---------------------------------------------------- |
| Online account       | Clerk identity (`sub`)                               |
| Tenant membership    | Row in `tenant_memberships` authorizing stall access |
| Local staff identity | Separate; not created by web onboarding              |

Membership statuses: `active`, `inactive`, `suspended`. Pending access is represented by **invitation** rows, not membership rows.

Operational roles: `owner`, `billing_staff`, `cashier`.

Active members with those roles may read reporting copies via `has_active_reporting_access`. Financial tables remain SELECT-only for authenticated clients.

## Role and capability semantics

- Ownership and membership/permission administration are **owner-only**.
- Operational capabilities use the domain catalog (`PERMISSION_CAPABILITIES`). Unknown capabilities are rejected.
- Default billing-staff and cashier capability sets are **recommendations** seeded at stall creation. Owners must review selections before saving profile changes.
- Do not authorize features with bare `role === "cashier"` checks.
- Capability grants never confer ownership, membership administration, or cross-tenant access.
- Ownership transfer is unavailable.

## Invitations

- Owner creates invitations via `POST /api/tenants/:tenantId/invitations`.
- Email-bound, copyable link flow (no email delivery in this phase).
- Pending invitations appear only on the **owner** Members page. Invitees have **no inbox**; they join by opening the shared `/invitations/[token]` link while signed in as the invited email.
- Server stores a SHA-256 **token hash** only; raw token is returned once (copy from the Members UI after create).
- Default expiry: 7 days. Revocable while pending. Acceptance is single-use and atomic.
- Acceptance (`POST /api/invitations/accept`) requires a verified Clerk email matching the invitation.
- The Clerk session JWT must include `email` and `email_verified` claims configured in the **Clerk** Dashboard (not Supabase). Use `"email": "{{user.primary_email_address}}"` and `"email_verified": "{{user.email_verified}}"` — see [web-authentication.md](./web-authentication.md). Do not use `primary_email_address_verified` (invalid shortcode).
- Invite the recipient’s exact primary Clerk email. That email must be **verified** in Clerk before accept. Accept trusts Clerk `currentUser()` verification when the session `email_verified` claim is non-canonical; explicit false still blocks. Sign out/in after changing session claims or verifying email.
- Previously removed (inactive/suspended) members are not reactivated by invitations.
- Unauthorized visitors receive a generic failure; invitation details are not disclosed.
- Automated tests must not send real invitation emails.

## Owner-only operations

Server and database enforce owner checks (UI hiding is insufficient):

- Create / revoke invitations
- List peer memberships and pending invitations
- Deactivate member access / edit non-owner capabilities
- Update permission profiles

Routes:

- `/tenants/[tenantId]/members`
- `/tenants/[tenantId]/permissions`

## Ownership safeguards

- A stall must retain at least one active owner.
- Concurrent demotion/removal of the last owner fails with a conflict.
- Role editing cannot promote to owner or demote an owner (transfer unavailable).
- Tenant deletion is not implemented.

## Permission revisions

- Profiles live in `tenant_permission_profiles` with a monotonic `revision`.
- Updates require `expectedRevision` and `permissionsReviewed: true`.
- Stale revisions return a conflict; newer versions are not silently overwritten.
- Admin audit events record actor, action, before/after, and revision where applicable. Tokens are never logged.

## Cloud versus desktop enforcement

| Status                               | Meaning                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| Saved to cloud                       | Permission/membership change persisted in Postgres                  |
| Local application status unavailable | Desktop has not acknowledged the change (no delivery in this phase) |

Do not show “Applied to desktop” without a verified acknowledgement. Offline stalls cannot receive immediate remote changes.

## RLS and privileged-operation boundaries

- Ordinary dashboard reads use the user-context Supabase client (Clerk JWT).
- Mutations use narrowly scoped SECURITY DEFINER RPCs with fixed `search_path`.
- No generic privileged table-write helper is exposed to route input.
- `SUPABASE_SECRET_KEY` is not used for authenticated dashboard reads.
- Authenticated clients still cannot INSERT/UPDATE/DELETE synchronized financial rows.

## Tenant selection

- Selected stall is the `/tenants/[tenantId]` route (and nested owner pages).
- Membership is re-verified on every protected operation.
- Multiple memberships: the UI lists stalls and does not auto-select.
- A tenant ID in a URL is a selection hint, not authorization.

## Test commands

```bash
pnpm test --project contracts
pnpm test --project domain
pnpm test --project web
pnpm test:db-cloud
pnpm test:e2e:web
pnpm check
```

Isolation tests apply canonical migrations under `supabase/migrations` and run as restricted `authenticated` roles with simulated JWT claims. Real Clerk→Supabase verification remains a separate manual checklist.

## Deferred

- Device enrollment / stall provisioning (phase 14)
- Local staff credentials and offline login
- Permission synchronization and desktop acknowledgements
- Farmer/trader web membership
- Subscriptions / payment collection
- Tenant deletion and ownership transfer

## Related docs

- [web-authentication.md](./web-authentication.md)
- [cloud-database-and-tenant-isolation.md](./cloud-database-and-tenant-isolation.md)
- [0009 — Tenant onboarding and roles](../decisions/0009-tenant-onboarding-and-roles.md)
