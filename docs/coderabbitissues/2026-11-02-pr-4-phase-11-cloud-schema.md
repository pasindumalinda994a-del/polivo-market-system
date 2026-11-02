# CodeRabbit — PR #4 (Phase 11 cloud schema)

## Metadata

| Field          | Value                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Date           | 2026-11-02                                                                                                                           |
| Branch         | `development` (head `f592413` at review time)                                                                                        |
| Phase          | Phase 11 — Supabase schema and tenant isolation                                                                                      |
| PR             | [#4](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4)                                                          |
| Source         | [Review 5733764677](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#pullrequestreview-5733764677) (CodeRabbit) |
| Overall status | `partially-resolved` (CR-01/02/04 fixed; CR-03/05/06 deferred; CR-07 wontfix)                                                        |

## Summary

| ID    | Severity | Category                     | Location                                                         | Disposition |
| ----- | -------- | ---------------------------- | ---------------------------------------------------------------- | ----------- |
| CR-01 | Minor    | Data Integrity & Integration | `packages/db-cloud/src/test/isolation/env.ts`                    | `fix`       |
| CR-02 | Minor    | Stability & Availability     | `scripts/test-db-cloud.mjs`                                      | `fix`       |
| CR-03 | Minor    | Security & Privacy           | `supabase/migrations/20251101120000_tenants_and_memberships.sql` | `defer`     |
| CR-04 | Minor    | Data Integrity & Integration | `supabase/migrations/20251101120100_reporting_core_tables.sql`   | `fix`       |
| CR-05 | Trivial  | Performance & Scalability    | `supabase/migrations/20251101120300_grants_and_rls.sql`          | `defer`     |
| CR-06 | Trivial  | Data Integrity & Integration | `packages/db-cloud/src/types.ts` (`PaymentRow.amount_minor`)     | `defer`     |
| CR-07 | Warning  | Maintainability              | Diff docstring coverage check                                    | `wontfix`   |

## Findings

### CR-01 — Remote DB guard too narrow (destructive tests)

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/test/isolation/env.ts` (also ops doc `POLIVO_CLOUD_TEST_ALLOW_REMOTE`)
- **Summary:** Guard only rejects hosts containing `supabase.co`. A direct Vitest run with `POLIVO_CLOUD_TEST_DATABASE_URL` pointing at another remote host can still run `TRUNCATE … CASCADE`.
- **Recommendation:** When `POLIVO_CLOUD_TEST_ALLOW_REMOTE` is not `1`, require loopback hosts for database and Supabase URLs.
- **Disposition:** `fix`
- **Resolution:** `resolveCloudTestEnv` now requires loopback hosts (`127.0.0.1`, `localhost`, `::1`) unless `POLIVO_CLOUD_TEST_ALLOW_REMOTE=1`. Unit tests in `packages/db-cloud/src/cloud-test-env.test.ts`. Ops doc updated.

### CR-02 — Embedded Postgres leak on schema failure

- **Severity:** Minor
- **Category:** Stability & Availability
- **Location:** `scripts/test-db-cloud.mjs` (`startEmbeddedStack`)
- **Summary:** After `pgServer.start()`, `applyCanonicalSchema` can throw without `stop()` / temp-dir cleanup; CI `db-cloud` can hang.
- **Recommendation:** Clean up on any failure after `start()`.
- **Disposition:** `fix`
- **Resolution:** `startEmbeddedStack` cleans up embedded Postgres and temp dir on any failure after `start()`; successful starts still expose `cleanup`.

### CR-03 — Tenant `status` vs reporting access

- **Severity:** Minor
- **Category:** Security & Privacy
- **Location:** `has_active_reporting_access` in `20251101120000_tenants_and_memberships.sql`
- **Summary:** Helper checks membership status only, not `tenants.status`. Active membership on a suspended/inactive tenant may still read reporting data.
- **Recommendation:** Do not change SQL until product decides; record an open question.
- **Disposition:** `defer`
- **Resolution:** Open question recorded in `docs/context/progress-tracker.md`. No SQL change in this pass.

### CR-04 — Allocation sale ↔ line integrity

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `sale_farmer_allocations` in `20251101120100_reporting_core_tables.sql`
- **Summary:** Separate FKs on `(tenant_id, sale_id)` and `(tenant_id, sale_line_id)` do not ensure the line belongs to that sale.
- **Recommendation:** Add `UNIQUE (tenant_id, sale_id, id)` on `sale_lines` and reference it from allocations.
- **Disposition:** `fix`
- **Resolution:** Forward migration `supabase/migrations/20251102140000_sale_farmer_allocation_sale_line_fk.sql` adds `UNIQUE (tenant_id, sale_id, id)` on `sale_lines` and composite FK from allocations. Isolation test rejects cross-sale line pairing.

### CR-05 — RLS helper performance

- **Severity:** Trivial
- **Category:** Performance & Scalability
- **Location:** Policies calling `has_active_reporting_access(tenant_id)`
- **Summary:** Repeated membership lookups may cost on broad scans; measure before changing the RLS contract.
- **Recommendation:** `EXPLAIN (ANALYZE, BUFFERS)` on representative queries before replacing the helper.
- **Disposition:** `defer`
- **Resolution:** No code change. Revisit when reporting query volume exists.

### CR-06 — Payments BIGINT → exact string transport

- **Severity:** Trivial
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/types.ts` (`amount_minor: string`)
- **Summary:** Uncast Supabase/JSON reads may decode BIGINT as number and lose precision for large values.
- **Recommendation:** Text-casting view/RPC when payment reporting reads are implemented — not a type-union-only change.
- **Disposition:** `defer`
- **Resolution:** No payment read path yet. Revisit with dashboard/reporting reads.

### CR-07 — Docstring coverage bot threshold

- **Severity:** Warning (external check)
- **Category:** Maintainability
- **Location:** PR diff docstring coverage (~46% vs 80% bot threshold)
- **Summary:** CodeRabbit finishing-touches check wants more docstrings on complex functions.
- **Recommendation:** Mass-add docstrings to satisfy the bot.
- **Disposition:** `wontfix`
- **Resolution:** Not a Polivo project gate. Do not mass-add docstrings for coverage percentage alone.

## Follow-ups

- Decide whether inactive/suspended `tenants.status` must deny reporting reads (CR-03) and record under `docs/decisions/` when accepted.
- When implementing cloud payment reads, add exact-string transport (CR-06).
- Benchmark RLS helper under realistic reporting load before changing policies (CR-05).
