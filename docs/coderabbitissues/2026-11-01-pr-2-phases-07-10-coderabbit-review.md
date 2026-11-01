# CodeRabbit — PR #2 (Phases 07–10)

## Metadata

| Field          | Value                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date           | 2026-11-01                                                                                                                                                   |
| Branch         | PR head for `#2`                                                                                                                                             |
| Phase          | Cross-cutting review of phases 07–10 work on the PR                                                                                                          |
| PR             | [#2](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/2)                                                                                  |
| Source         | [Review 5727180312](https://github.com/pasindumalinda994a-del/polivo-market-system/pull/2#pullrequestreview-5727180312) (CodeRabbit, 18 actionable comments) |
| Overall status | `resolved`                                                                                                                                                   |

## Summary

| ID    | Severity | Category                       | Location                                                     | Disposition |
| ----- | -------- | ------------------------------ | ------------------------------------------------------------ | ----------- |
| CR-01 | Major    | Functional Correctness         | `apps/desktop/src/renderer/src/styles.css`                   | `fix`       |
| CR-02 | Major    | Functional Correctness         | `package.json` e2e scripts; `.github/workflows/ci.yml`       | `fix`       |
| CR-03 | Minor    | Functional Correctness         | `apps/stall-service/src/http/error-handler.ts`               | `fix`       |
| CR-04 | Minor    | Functional Correctness         | `apps/stall-service/src/commands/command-runner.ts`          | `fix`       |
| CR-05 | Minor    | Functional Correctness         | `packages/domain/src/payments.ts` (`finalizedAt` sort)       | `fix`       |
| CR-06 | Minor    | Functional Correctness         | `packages/domain/src/payments.ts` (duplicate `billId`)       | `fix`       |
| CR-07 | Minor    | Data Integrity & Integration   | `docs/decisions/0005-commission-configuration-v1.md`         | `fix`       |
| CR-08 | Minor    | Maintainability & Code Quality | `docs/operations/local-data-access-and-transactions.md`      | `fix`       |
| CR-09 | Minor    | Maintainability & Code Quality | `docs/operations/testing-and-ci.md` (phase references)       | `fix`       |
| CR-10 | Minor    | Maintainability & Code Quality | `docs/operations/testing-and-ci.md` (unit/coverage projects) | `fix`       |
| CR-11 | Minor    | Maintainability & Code Quality | `inspiration Layouts/README.md`                              | `fix`       |
| CR-12 | Minor    | Functional Correctness         | `packages/db-local/package.json` (`dev` / `watch`)           | `fix`       |
| CR-13 | Minor    | Data Integrity & Integration   | `packages/db-local/src/connection.ts`                        | `fix`       |
| CR-14 | Minor    | Functional Correctness         | `packages/db-local/src/mapping/errors.ts`                    | `fix`       |
| CR-15 | Minor    | Data Integrity & Integration   | `packages/db-local/src/migrations/runner.ts`                 | `fix`       |
| CR-16 | Minor    | Functional Correctness         | `packages/ui/src/components/app-shell.tsx`                   | `fix`       |
| CR-17 | Minor    | Functional Correctness         | `packages/ui/src/components/button.tsx`                      | `fix`       |
| CR-18 | Minor    | Functional Correctness         | `packages/ui/src/components/sidebar-nav.tsx`                 | `fix`       |

Nitpick comments from the same review (fixture result Zod parse, renaming sequential “competing” tests, sale-line rounding inputs) were left out of this triage pass unless reopened.

## Findings

### CR-01 — Desktop Tailwind `@source` path escapes the repository

- **Severity:** Major
- **Category:** Functional Correctness
- **Location:** `apps/desktop/src/renderer/src/styles.css`
- **Summary:** Six `../` segments resolve above the repo root; shared UI utilities are not scanned.
- **Recommendation:** Use five `../` segments to reach `packages/ui/src`.
- **Disposition:** `fix`
- **Resolution:** Updated `@source` to `../../../../../packages/ui/src/**/*.{ts,tsx}`.

### CR-02 — CI / e2e builds miss `@polivo/ui` dist

- **Severity:** Major
- **Category:** Functional Correctness
- **Location:** Root `package.json` `test:e2e:*`; `.github/workflows/ci.yml` `web-e2e` / `desktop-smoke`
- **Summary:** App builds without building workspace deps leave `@polivo/ui` `exports` pointing at missing `dist/`.
- **Recommendation:** Build with `pnpm --filter @polivo/web...` / `@polivo/desktop...`.
- **Disposition:** `fix`
- **Resolution:** Root e2e scripts and CI build steps use the `...` workspace dependency selector.

### CR-03 — Map Fastify 4xx client errors to 4xx responses

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `apps/stall-service/src/http/error-handler.ts`
- **Summary:** Only some 400 bodies were remapped; other Fastify 4xx (for example 413) became `INTERNAL_ERROR`.
- **Recommendation:** Treat any Fastify `statusCode` in 400–499 as a client error via `AppError` / `VALIDATION_ERROR`.
- **Disposition:** `fix`
- **Resolution:** Handler maps 400–499 with status-preserving `httpStatus` (413 uses a dedicated message).

### CR-04 — Do not map unrelated unique constraints to `CONFLICT`

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `apps/stall-service/src/commands/command-runner.ts`
- **Summary:** After idempotency re-read, a uniqueness failure with no matching record was returned as HTTP 409.
- **Recommendation:** Use `INTERNAL_ERROR` for unexpected uniqueness; keep fingerprint conflict / replay paths.
- **Disposition:** `fix`
- **Resolution:** Fallback throws `internalError("Unexpected uniqueness violation during command execution.", error)`.

### CR-05 — Compare `finalizedAt` as instants

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/domain/src/payments.ts`
- **Summary:** Lexicographic string sort mis-orders ISO timestamps with different offsets.
- **Recommendation:** Sort by `Date.parse` epoch milliseconds; reject invalid timestamps.
- **Disposition:** `fix`
- **Resolution:** Instant-based sort plus offset-aware unit test.

### CR-06 — Reject duplicate `billId` values

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/domain/src/payments.ts`
- **Summary:** Duplicate ids overwrite outstanding map entries and under-allocate.
- **Recommendation:** Throw `INVALID_BILL` when a bill id repeats.
- **Disposition:** `fix`
- **Resolution:** Pre-check for duplicate ids; unit test added.

### CR-07 — Record commission snapshots per sale line

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `docs/decisions/0005-commission-configuration-v1.md`
- **Summary:** Decision text said “each finalized sale”; schema stores applied rate/amount on sale lines.
- **Recommendation:** Wording should say “sale line”.
- **Disposition:** `fix`
- **Resolution:** Decision bullet updated to “each finalized sale line”.

### CR-08 — Document `allocateNextBillSequence` with `tx` first

- **Severity:** Minor
- **Category:** Maintainability & Code Quality
- **Location:** `docs/operations/local-data-access-and-transactions.md`
- **Summary:** Doc omitted the executor/`tx` argument used by the real API and tests.
- **Recommendation:** Document `allocateNextBillSequence(tx, stallId, billType)`.
- **Disposition:** `fix`
- **Resolution:** Ops doc signature updated.

### CR-09 — Refresh stale phase references in testing guide

- **Severity:** Minor
- **Category:** Maintainability & Code Quality
- **Location:** `docs/operations/testing-and-ci.md`
- **Summary:** Intro still framed as “after phase 06”; future-work listed financial tests already covered by later phases.
- **Recommendation:** Refresh intro and remove obsolete “financial tests still future” bullets.
- **Disposition:** `fix`
- **Resolution:** Intro covers phases 06–10; future-work list no longer claims financial unit tests are outstanding.

### CR-10 — Align unit/coverage descriptions with configured projects

- **Severity:** Minor
- **Category:** Maintainability & Code Quality
- **Location:** `docs/operations/testing-and-ci.md`
- **Summary:** `test:unit` / coverage include contracts, domain, and db-local; docs omitted some.
- **Recommendation:** Document all three unit projects and coverage targets; note e2e builds workspace deps.
- **Disposition:** `fix`
- **Resolution:** Ownership table, commands, tooling, and coverage sections updated.

### CR-11 — Prettier formatting in inspiration README table

- **Severity:** Minor
- **Category:** Maintainability & Code Quality
- **Location:** `inspiration Layouts/README.md`
- **Summary:** `pnpm format:check` failed on unpadded markdown table columns.
- **Recommendation:** Run Prettier on the file.
- **Disposition:** `fix`
- **Resolution:** Formatted with Prettier.

### CR-12 — Copy migrations in `dev` / `watch`

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/db-local/package.json`
- **Summary:** Watch mode compiled TS without copying SQL into `dist/migrations/sql`.
- **Recommendation:** Run `copy-migrations.mjs` before `tsc --watch`.
- **Disposition:** `fix`
- **Resolution:** `dev` and `watch` scripts run the copy step first.

### CR-13 — Clean up DB file when init fails after creation

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-local/src/connection.ts`
- **Summary:** Failed init left a file on disk so retry hit “already exists”.
- **Recommendation:** After close on failure, delete DB and WAL/SHM sidecars.
- **Disposition:** `fix`
- **Resolution:** `removeDatabaseArtifacts` on init failure; connection test covers cleanup.

### CR-14 — Fix `requireAbsoluteTimestamp` regex grouping

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/db-local/src/mapping/errors.ts`
- **Summary:** `$` bound only the offset alternative; mid-string `z` could pass.
- **Recommendation:** Use `/(?:[zZ]|[+-]\d{2}:\d{2})$/`.
- **Disposition:** `fix`
- **Resolution:** Regex grouped; mapping unit test added.

### CR-15 — Make `getMigrationStatus` read-only

- **Severity:** Minor
- **Category:** Data Integrity & Integration
- **Location:** `packages/db-local/src/migrations/runner.ts`
- **Summary:** Status/verify paths created `schema_migrations` via `CREATE TABLE IF NOT EXISTS`.
- **Recommendation:** Read `sqlite_master` only; create the table inside `applyPendingMigrations` after `BEGIN IMMEDIATE`.
- **Disposition:** `fix`
- **Resolution:** `readApplied` returns `[]` when the table is absent; `ensureMigrationsTable` only in apply path; runner test asserts no DDL on verify/status.

### CR-16 — `aria-controls` target missing

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/ui/src/components/app-shell.tsx`
- **Summary:** Open-nav button referenced `app-shell-sidebar` but the aside had no `id`.
- **Recommendation:** Set `id="app-shell-sidebar"` on the aside.
- **Disposition:** `fix`
- **Resolution:** Id added on the aside.

### CR-17 — `Button asChild` throws with two children

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/ui/src/components/button.tsx`
- **Summary:** Loading spinner plus children violated Radix `Slot`’s single-child rule.
- **Recommendation:** Render spinner only on the native button path.
- **Disposition:** `fix`
- **Resolution:** `asChild` renders only `children`.

### CR-18 — Compact-nav label logic inverted

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/ui/src/components/sidebar-nav.tsx`
- **Summary:** Labels were `sr-only` in the mobile drawer and visible on the compact `md` rail.
- **Recommendation:** Use `md:sr-only` when compact so drawer shows labels and the rail hides them.
- **Disposition:** `fix`
- **Resolution:** Label and “Soon” badge use `cn(compact && "md:sr-only")`.

## Follow-ups

- Nitpicks from the same review remain optional: fixture result Zod schema on replay, rename sequential contention tests, strengthen sale-line rounding test inputs.
- Confirm remote CI `quality-and-build`, `web-e2e`, and `desktop-smoke` succeed after these fixes land on the PR.
- No new product open questions; commission snapshot wording was a documentation alignment only (decision [0005](../decisions/0005-commission-configuration-v1.md)).
