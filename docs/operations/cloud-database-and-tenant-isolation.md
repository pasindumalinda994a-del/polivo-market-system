# Cloud Database and Tenant Isolation

Phase 11 foundations for Supabase PostgreSQL: versioned migrations, tenant membership, reporting copies of local core tables, row-level security, and `@polivo/db-cloud` server client helpers. Stall SQLite remains authoritative for financial operations. Synchronization ingestion, Clerk sign-in screens, and remote financial editing are out of scope.

## Canonical migration location

| Path                        | Role                                                                          |
| --------------------------- | ----------------------------------------------------------------------------- |
| `supabase/config.toml`      | Supabase CLI project config (local ports, Clerk third-party auth placeholder) |
| `supabase/migrations/*.sql` | **Only** cloud SQL migration source                                           |

Do not maintain duplicate migrations under `packages/db-cloud` or elsewhere. Schema changes are forward migrations only; never rewrite already-applied files.

## Package: `@polivo/db-cloud`

Server-side package for:

- User-context Supabase client factory (`createUserSupabaseClient`)
- Exact numeric adapters (BIGINT ↔ string transport)
- Hand-maintained database types (`@polivo/db-cloud/types` type-only entry)
- Isolation test helpers (not for production imports)

Do **not** import `@polivo/db-cloud` from React client components, Electron renderer/preload/main, `@polivo/ui`, `@polivo/domain`, or `@polivo/contracts`. Privileged/service-role clients are intentionally absent from the public API.

## Data ownership

| Data                                                  | Authority            |
| ----------------------------------------------------- | -------------------- |
| Tenant accounts and online membership                 | Cloud                |
| Local sales, bills, payments, commission results      | Stall SQLite         |
| Synchronized operational reporting records            | Cloud reporting copy |
| Device enrollment and remote permission configuration | Later phases         |

## Local → cloud table mapping

Reporting copies preserve source IDs, add `tenant_id` on every tenant-owned row, and use composite tenant-safe foreign keys. Money/weight columns are `BIGINT`. Deletion of membership must not cascade into financial history (`ON DELETE RESTRICT`).

| Local SQLite                                                                        | Cloud Postgres                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| farmers, traders, vegetables                                                        | same + `tenant_id`                             |
| commission_band_sets, commission_bands                                              | same + `tenant_id`                             |
| sales, sale_lines, sale_line_package_weights, sale_farmer_allocations               | same + `tenant_id`                             |
| farmer_bills, trader_bills                                                          | same + `tenant_id`                             |
| payments, payment_allocations                                                       | same + `tenant_id`                             |
| audit_events                                                                        | same + required `tenant_id`                    |
| —                                                                                   | `tenants`, `tenant_memberships`                |
| —                                                                                   | `sync_received_events` (receipt metadata only) |
| sync_outbox, bill_sequences, command_idempotency, local_installation, stall_binding | **not mirrored**                               |

`sync_received_events` stores event identity, schema version, source `occurred_at`, cloud `received_at`, and optional `source_revision`. It is not a cloud outbox. Ingestion workers belong to phases 31–34.

## Identity and membership

- Verified claim for RLS: `auth.jwt()->>'sub'` (Clerk user id as opaque text).
- Membership uniqueness: `(tenant_id, identity_provider, external_subject)`.
- Provider: `clerk`. Statuses: `active`, `inactive`, `suspended`. Access role: `reporting_reader`.
- Internal `tenants.id` is distinct from any external organization id.
- Membership is never granted merely because a client supplies a tenant id.
- Clerk application wiring and real JWT signature verification: **phase 12**.
- Local CLI config enables `[auth.third_party.clerk]` with a placeholder domain; replace before production use.

## Grants and RLS matrix

| Object                              | `anon`     | `authenticated`                                     | Notes                                         |
| ----------------------------------- | ---------- | --------------------------------------------------- | --------------------------------------------- |
| Reporting tables                    | no access  | SELECT if `has_active_reporting_access(tenant_id)`  | No INSERT/UPDATE/DELETE policies              |
| `tenant_memberships`                | no access  | SELECT own rows only (`external_subject = jwt.sub`) | No self-insert, elevate, or reactivate        |
| `tenants`                           | no access  | SELECT if active reporting membership               |                                               |
| `has_active_reporting_access(text)` | no execute | execute                                             | Narrow `SECURITY DEFINER`, `search_path = ''` |

Default denial: missing identity, inactive membership, or no matching membership yields no protected rows. UI hiding is not a security control.

**Privileged roles** (service role / database owner) bypass ordinary RLS. Never use a privileged client for ordinary dashboard reads to avoid policy errors. Future privileged ingestion must enforce device, tenant, and payload checks itself.

## Exact numeric handling

- Authoritative money: integer paisa → Postgres `BIGINT`.
- Authoritative weight: integer hundredths-kg → Postgres `BIGINT`.
- No `REAL` / floating-point columns for money or weight.
- JS adapters encode/decode via strings (`moneyMinorToPgString` / `moneyMinorFromPg`, weight equivalents). Values outside `Number.MAX_SAFE_INTEGER` are rejected until domain/contracts widen.
- Do not silently round synchronized values differently from the local source.

## Environment variables

Already documented in [environment-configuration.md](./environment-configuration.md):

| Variable                               | Phase 11 use                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | User-context client (public)                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | User-context client (public)                               |
| `SUPABASE_SECRET_KEY`                  | Server-only; not used by `@polivo/db-cloud` public factory |
| `DATABASE_URL`                         | Migration / admin tooling against a verified remote target |

Phase 12 adds Clerk SDK wiring. Desktop builds must not receive Supabase administrative credentials.

Test-only overrides (never required for app builds):

| Variable                             | Purpose                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POLIVO_CLOUD_TEST_DATABASE_URL`     | Isolation test Postgres URL (must be loopback unless `POLIVO_CLOUD_TEST_ALLOW_REMOTE=1`)                                                                                  |
| `POLIVO_CLOUD_TEST_SUPABASE_URL`     | Optional Supabase API URL override (must be loopback unless allow-remote)                                                                                                 |
| `POLIVO_CLOUD_TEST_FORCE_EMBEDDED=1` | Skip Docker Supabase; use embedded Postgres                                                                                                                               |
| `POLIVO_CLOUD_TEST_ALLOW_REMOTE=1`   | Lab only. Required before any non-loopback test database/API URL (including `supabase.co`). Destructive fixtures must never target shared staging/production by accident. |

## Local test setup and commands

Prerequisites:

- Node.js / pnpm as in [local-development.md](./local-development.md)
- For Docker-backed local Supabase: Docker Desktop
- Isolation suite always needs a disposable Postgres (Docker Supabase **or** embedded Postgres via `embedded-postgres`)

Commands:

```powershell
pnpm --filter @polivo/db-cloud build
pnpm test                 # includes db-cloud unit tests (no Postgres)
pnpm test:db-cloud         # applies supabase/migrations; runs RLS isolation suite
```

`pnpm test:db-cloud` (`scripts/test-db-cloud.mjs`):

1. Prefers local Supabase when Docker works (`supabase start` + `db reset`).
2. Otherwise starts embedded Postgres, applies `packages/db-cloud/src/test/isolation/supabase-compat.sql` (roles + `auth.jwt()`), then applies all `supabase/migrations`.
3. Runs Vitest project `db-cloud-isolation` as restricted roles with **labeled simulated JWT claims** (policy tests). Real Clerk signature/issuer checks are phase 12.

CI job `db-cloud` runs `pnpm test:db-cloud` on Ubuntu without production credentials. The suite fails if zero tests run (`passWithNoTests: false`).

## Remote migration procedure

1. Confirm the intended Supabase **project ref** and environment (development / staging / production).
2. Confirm you are not resetting a shared database that holds customer data.
3. Link or set the project (`supabase link` / CI secrets) using migration credentials only.
4. Apply forward migrations (`supabase db push` or approved pipeline equivalent).
5. Record which environment was migrated in the progress tracker.

Ordinary builds and pull-request tests must not require production credentials and must not apply to shared staging by default.

**Phase 11 status:** migrations are prepared and verified against disposable local/embedded Postgres. Remote application to a shared Supabase project was **not** performed in this phase.

## Deferred

- Clerk sign-in and session integration (phase 12)
- Tenant onboarding / invitations / role administration (phase 13+)
- Device provisioning and sync ingestion/workers (later)
- Dashboard reporting UI
- Object storage buckets (no confirmed upload feature in this phase)
- Staff permission editing and remote financial mutation

## Related docs

- [0008 — Cloud schema and tenant isolation](../decisions/0008-cloud-schema-and-tenant-isolation.md)
- [environment-configuration.md](./environment-configuration.md)
- [testing-and-ci.md](./testing-and-ci.md)
- [local-database-and-migrations.md](./local-database-and-migrations.md)
