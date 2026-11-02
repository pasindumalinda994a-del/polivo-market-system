# 0008 — Cloud Schema and Tenant Isolation Foundation

- Status: Accepted
- Date: 2026-11-01

## Context and source

Phase 11 requires versioned Supabase PostgreSQL migrations, minimal tenant/membership structures, reporting copies of the local core schema, RLS for Data API reads, and server-side client foundations. Source: `docs/implementation/11-supabase-schema-and-tenant-isolation.md`, Clerk/Supabase third-party auth documentation, phase 08/09 numeric decisions.

## Decision

1. **Canonical migrations** live only under repository-root `supabase/migrations` with `supabase/config.toml`. Do not duplicate SQL under `packages/db-cloud`.
2. **Clerk subjects** are stored and matched as opaque `TEXT` via `auth.jwt()->>'sub'`. Do not cast Clerk user IDs to UUID. Do not authorize by email or by a bare tenant claim.
3. **Membership** uses `identity_provider = 'clerk'`, statuses `active|inactive|suspended`, and minimal access role `reporting_reader` for cloud reporting reads only.
4. **Money and weight** use PostgreSQL `BIGINT` (integer paisa / hundredths-kg). TypeScript transports BIGINT as strings; reject floating-point and excess precision.
5. **Authenticated users** receive SELECT-only grants on tenant-owned reporting tables, gated by `has_active_reporting_access(tenant_id)` (narrow `SECURITY DEFINER`, fixed `search_path`). No authenticated INSERT/UPDATE/DELETE on synchronized financial copies.
6. **User-context clients** in `@polivo/db-cloud` require an access-token provider and public URL/publishable key. Privileged/service-role clients are not part of the public package API in this phase.

## Reasoning

Canonical Supabase CLI layout keeps one migration source for local, CI, and remote apply. Opaque Clerk subjects match current third-party auth guidance and avoid false UUID assumptions. BIGINT + string transport preserves phase 08 exactness across SQLite INTEGER, Postgres, and JSON. Read-only RLS preserves local financial authority and the product rule that the web dashboard starts read-only for synced finances.

## Consequences

- Phase 12 wires real Clerk tokens and project third-party auth configuration; isolation tests may continue using labeled simulated JWT claims until then.
- Remote migration to a shared Supabase project requires explicit target verification and is not part of ordinary builds.
- Future ingestion (phases 31–34) must use privileged paths with explicit device/tenant checks; never for ordinary dashboard reads.
- Storage buckets remain deferred until a consuming feature exists.

## Related implementation phases

- Phase 11 — Supabase schema and tenant isolation
- Phase 12 — Clerk web authentication
- Phases 31–34 — Synchronization ingestion
