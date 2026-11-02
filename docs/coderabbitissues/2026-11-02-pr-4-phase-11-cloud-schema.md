# CodeRabbit — PR #4 (Phase 11 cloud schema)

## Metadata

| Field          | Value                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date           | 2026-11-02                                                                                                                                                                                                                                          |
| Branch         | `development`                                                                                                                                                                                                                                       |
| Phase          | Phase 11 — Supabase schema and tenant isolation                                                                                                                                                                                                     |
| PR             | [#4](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4)                                                                                                                                                                         |
| Source         | [Review 5733764677](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#pullrequestreview-5733764677), follow-up [5734130351](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#pullrequestreview-5734130351) |
| Overall status | `partially-resolved` (CR-01–04, CR-08–14 fixed; CR-03/05/06 deferred; CR-07 wontfix)                                                                                                                                                                |

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
| CR-08 | Minor    | Data Integrity & Integration | `packages/db-cloud/src/test/isolation/env.ts` (IPv6)             | `fix`       |
| CR-09 | Major    | Data Integrity & Integration | `packages/db-cloud/src/test/isolation/env.ts` (`?host=`)         | `fix`       |
| CR-10 | Minor    | Stability & Availability     | `scripts/test-db-cloud.mjs` (`initialise`)                       | `fix`       |
| CR-11 | Major    | Stability & Availability     | `scripts/test-db-cloud.mjs` (default embedded)                   | `fix`       |
| CR-12 | Trivial  | Functional Correctness       | `packages/db-cloud/src/test/isolation/isolation.test.ts`         | `fix`       |
| CR-13 | Major    | Data Integrity & Integration | `packages/db-cloud/src/test/isolation/env.ts` (duplicate `host`) | `fix`       |
| CR-14 | Trivial  | Documentation Accuracy       | `docs/operations/cloud-database-and-tenant-isolation.md`         | `fix`       |

## Findings

### CR-01 — Remote DB guard too narrow (destructive tests)

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/test/isolation/env.ts` (also ops doc `POLIVO_CLOUD_TEST_ALLOW_REMOTE`)
- **Summary:** Guard only rejects hosts containing `supabase.co`. A direct Vitest run with `POLIVO_CLOUD_TEST_DATABASE_URL` pointing at another remote host can still run `TRUNCATE … CASCADE`.
- **Recommendation:** When `POLIVO_CLOUD_TEST_ALLOW_REMOTE` is not `1`, require loopback hosts for database and Supabase URLs.
- **Disposition:** `fix`
- **Resolution:** `resolveCloudTestEnv` requires loopback hosts unless `POLIVO_CLOUD_TEST_ALLOW_REMOTE=1`. CodeRabbit marked addressed in `6ff3414`; further hardened in CR-08/CR-09.

### CR-02 — Embedded Postgres leak on schema failure

- **Severity:** Minor
- **Category:** Stability & Availability
- **Location:** `scripts/test-db-cloud.mjs` (`startEmbeddedStack`)
- **Summary:** After `pgServer.start()`, `applyCanonicalSchema` can throw without `stop()` / temp-dir cleanup; CI `db-cloud` can hang.
- **Recommendation:** Clean up on any failure after `start()`.
- **Disposition:** `fix`
- **Resolution:** Cleanup after `start()` on schema failure. CodeRabbit marked addressed in `6ff3414`; CR-10 extends cleanup to `initialise()`.

### CR-03 — Tenant `status` vs reporting access

- **Severity:** Minor
- **Category:** Security & Privacy
- **Location:** `has_active_reporting_access` in `20251101120000_tenants_and_memberships.sql`
- **Summary:** Helper checks membership status only, not `tenants.status`. Active membership on a suspended/inactive tenant may still read reporting data.
- **Recommendation:** Do not change SQL until product decides; record an open question.
- **Disposition:** `defer`
- **Resolution:** Open question recorded in `docs/context/progress-tracker.md`. No SQL change. CodeRabbit marked addressed for documentation.

### CR-04 — Allocation sale ↔ line integrity

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `sale_farmer_allocations` in `20251101120100_reporting_core_tables.sql`
- **Summary:** Separate FKs on `(tenant_id, sale_id)` and `(tenant_id, sale_line_id)` do not ensure the line belongs to that sale.
- **Recommendation:** Add `UNIQUE (tenant_id, sale_id, id)` on `sale_lines` and reference it from allocations.
- **Disposition:** `fix`
- **Resolution:** Composite FK folded into `20251101120100_reporting_core_tables.sql` (`UNIQUE (tenant_id, sale_id, id)` on `sale_lines`; named `sale_farmer_allocations_sale_line_fk`). Forward migration `20251102140000_sale_farmer_allocation_sale_line_fk.sql` is idempotent for DBs that already applied the earlier upgrade. Isolation test asserts FK constraint (CR-12). Thread [r4440221486](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#discussion_r4440221486).

### CR-05 — RLS helper performance

- **Severity:** Trivial
- **Category:** Performance & Scalability
- **Location:** Policies calling `has_active_reporting_access(tenant_id)`
- **Summary:** Repeated membership lookups may cost on broad scans; measure before changing the RLS contract.
- **Recommendation:** `EXPLAIN (ANALYZE, BUFFERS)` on representative queries before replacing the helper.
- **Disposition:** `defer`
- **Resolution:** No code change. Revisit when reporting query volume exists.

### CR-06 — Payments BIGINT → exact string transport

- **Severity:** Trivial / Minor (follow-up reword)
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/types.ts` (`amount_minor: string`)
- **Summary:** Uncast Supabase/JSON reads may decode BIGINT as number. Follow-up suggested typing as `number` for raw table rows.
- **Recommendation:** Text-casting view/RPC when payment reporting reads are implemented; do not flip the type alone.
- **Disposition:** `defer`
- **Resolution:** Keep string intent until a text-cast read path exists. No payment read path yet.

### CR-07 — Docstring coverage bot threshold

- **Severity:** Warning (external check)
- **Category:** Maintainability
- **Location:** PR diff docstring coverage (~36–46% vs 80% bot threshold)
- **Summary:** CodeRabbit finishing-touches check wants more docstrings on complex functions.
- **Recommendation:** Mass-add docstrings to satisfy the bot.
- **Disposition:** `wontfix`
- **Resolution:** Not a Polivo project gate. Do not mass-add docstrings for coverage percentage alone.

### CR-08 — IPv6 loopback hostname mismatch (follow-up)

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/test/isolation/env.ts`
- **Summary:** `URL.hostname` for IPv6 loopback is `"[::1]"` but the allow-set had `"::1"`, so valid loopback URLs were rejected.
- **Recommendation:** Accept `"[::1]"` (and normalize brackets).
- **Disposition:** `fix`
- **Resolution:** Loopback set includes both forms; hostname normalization strips brackets.

### CR-09 — Postgres `?host=` query override (follow-up)

- **Severity:** Major
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/test/isolation/env.ts`
- **Summary:** A URL like `postgresql://postgres@127.0.0.1:5432/db?host=db.example.com` can pass a hostname check on authority while the driver connects to the query `host`.
- **Recommendation:** For database URLs, use effective hostname from `host` query param when present.
- **Disposition:** `fix`
- **Resolution:** `effectivePostgresHostname()` prefers `searchParams.host`; unit tests cover the bypass.

### CR-10 — `initialise()` outside try (follow-up)

- **Severity:** Minor
- **Category:** Stability & Availability
- **Location:** `scripts/test-db-cloud.mjs` (`startEmbeddedStack`)
- **Summary:** Failure in `initialise()` skipped temp-dir cleanup.
- **Recommendation:** Move `initialise()` into the existing `try`.
- **Disposition:** `fix`
- **Resolution:** `initialise()` and `start()` share the cleanup `try`/`catch`.

### CR-11 — Default runner must not `supabase db reset` (follow-up)

- **Severity:** Major
- **Category:** Stability & Availability
- **Location:** `scripts/test-db-cloud.mjs`
- **Summary:** Preferring local Supabase + `db reset` can wipe a developer’s local project data.
- **Recommendation:** Use embedded Postgres by default.
- **Disposition:** `fix`
- **Resolution:** Embedded is default. Local Supabase only with `POLIVO_CLOUD_TEST_USE_LOCAL_SUPABASE=1` (and not when `FORCE_EMBEDDED=1`).

### CR-12 — Tighten allocation FK assertion (follow-up)

- **Severity:** Trivial
- **Category:** Functional Correctness
- **Location:** `packages/db-cloud/src/test/isolation/isolation.test.ts`
- **Summary:** Bare `catch` accepts any error for the cross-sale allocation insert.
- **Recommendation:** Assert Postgres FK violation code/constraint.
- **Disposition:** `fix`
- **Resolution:** Expect `code: "23503"` and constraint `sale_farmer_allocations_sale_line_fk`.

### CR-13 — Duplicate Postgres `host` query bypass (follow-up)

- **Severity:** Major
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-cloud/src/test/isolation/env.ts` ([discussion r4440630702](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#discussion_r4440630702))
- **Summary:** `searchParams.get("host")` returns the first value; libpq uses the last. `?host=127.0.0.1&host=db.example.com` could pass the loopback guard then connect remotely.
- **Recommendation:** Reject duplicate `host` parameters or validate the last value.
- **Disposition:** `fix`
- **Resolution:** `effectivePostgresHostname` rejects duplicate `host` query params (always, including allow-remote). Counts raw `getAll("host")` before trimming empties so `?host=127.0.0.1&host=` cannot collapse to a single loopback. Unit tests cover non-empty and empty duplicates. Thread [r4440843776](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#discussion_r4440843776).

### CR-14 — `POLIVO_CLOUD_TEST_DATABASE_URL` vs `pnpm test:db-cloud`

- **Severity:** Trivial
- **Category:** Documentation Accuracy
- **Location:** `docs/operations/cloud-database-and-tenant-isolation.md` ([discussion r4440843765](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#discussion_r4440843765))
- **Summary:** Ops table implied the env var drives managed isolation runs; the runner always overwrites it with the selected stack URL.
- **Recommendation:** Document that the variable applies only to direct Vitest / isolation-helper runs.
- **Disposition:** `fix`
- **Resolution:** Ops doc clarifies `pnpm test:db-cloud` ignores a pre-set `POLIVO_CLOUD_TEST_DATABASE_URL`. Prettier table padding applied for CI / [r4441183489](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/4#discussion_r4441183489).

## Follow-ups

- Decide whether inactive/suspended `tenants.status` must deny reporting reads (CR-03) and record under `docs/decisions/` when accepted.
- When implementing cloud payment reads, add exact-string transport (CR-06); do not retype as `number` alone.
- Benchmark RLS helper under realistic reporting load before changing policies (CR-05).
- Manually resolve open GitHub review threads after this push lands on the PR head.
