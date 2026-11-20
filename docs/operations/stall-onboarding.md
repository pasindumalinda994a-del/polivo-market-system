# Stall Onboarding

## Scope

Guided web onboarding and readiness overview introduced in Phase 37. Reuses Phase 12–16 and 33 services — it does not create a second enrollment backend.

Related guides:

- [tenant-onboarding-and-access-management.md](./tenant-onboarding-and-access-management.md)
- [stall-provisioning-and-device-enrollment.md](./stall-provisioning-and-device-enrollment.md)
- [local-staff-authentication-and-offline-access.md](./local-staff-authentication-and-offline-access.md)
- [desktop-service-connection-and-lan-terminals.md](./desktop-service-connection-and-lan-terminals.md)
- [cloud-configuration-and-access-sync.md](./cloud-configuration-and-access-sync.md)
- [public-website-and-downloads.md](./public-website-and-downloads.md)

## Entry paths

| Path                   | Behavior                                                      |
| ---------------------- | ------------------------------------------------------------- |
| New user               | `/sign-up` → `/dashboard` (none) → `/onboarding` create stall |
| Invited user           | `/invitations/[token]` with invited account                   |
| Existing member        | `/dashboard` stall selector (no auto-pick)                    |
| Owner continuing setup | `/tenants/[tenantId]/setup`                                   |
| Configured workspace   | `/tenants/[tenantId]` reporting / admin                       |

Stall creation remains `POST /api/tenants` → `create_stall_with_owner` (tenant + owner in one transaction). Creation permission is re-checked server-side; direct navigation does not grant it.

## Authoritative evidence model

Milestones are derived in [`apps/web/src/lib/onboarding/readiness.ts`](../../apps/web/src/lib/onboarding/readiness.ts).

| Milestone                   | Evidence                                                 |
| --------------------------- | -------------------------------------------------------- |
| Web authenticated           | Clerk session                                            |
| Stall membership            | `tenant_memberships` via membership helpers              |
| Stall profile               | `get_stall_admin_profile` (owners)                       |
| Host authorized / completed | `list_tenant_devices` host states                        |
| Local owner setup           | **Unknown** from cloud — redeem + local sign-in required |
| Host connection             | **Unknown** from website — desktop LAN verification only |
| Configuration delivery      | `get_access_config_delivery_status`                      |
| Additional terminals        | terminal device rows                                     |
| Cloud sync                  | Unknown / reporting freshness when data exists           |

Status values: `confirmed_complete`, `action_required`, `awaiting_host_confirmation`, `blocked`, `unknown`.

Rules:

- Refreshing reloads server records; no duplicate stall creation (idempotency key on create).
- Convenience checklist (“I downloaded it”) is client-only and never marks enrollment complete.
- Host enrolled previously is not proof the host is online now.
- Cloud receipt of a setup event does not prove every terminal is connected.

## Host enrollment and local owner setup

1. Owner opens Devices → authorize host → one-time enrollment secret (shown once).
2. Redeem on the host via existing stall-service / desktop enrollment.
3. After host `activated`, owner opens Setup → **Issue local owner setup grant** (`POST /api/tenants/[tenantId]/local-staff/setup-grant`).
4. Redeem on the host via existing setup-owner flow.
5. Additional computers use terminal authorization + desktop connection — not a second host.

Sensitive grants must not appear in analytics, public pages, or persistent browser storage beyond the one-time display.

If an authoritative host already exists, direct additional computers to terminal setup. Host replacement belongs to Phase 39.

## Support content ownership

Public support copy lives on `/support` and must stay aligned with verified contacts. Until contacts and legal pages are approved, those pages explicitly state the dependency (see progress tracker open questions).

## Pending real-host acceptance

Live enrolled-host smoke (Phases 14–16, 33–36) remains operator-run. Phase 37 web checks can pass without a physical installer when downloads are unavailable; do not mark physical installation or secure host credential handling verified from mocked browser tests alone.
