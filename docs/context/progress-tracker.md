# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by inspected code or verification results. Documentation progress does not establish implementation completion.

## Current Phase

- Phase 10 complete: Fastify local data access and transactions (`@polivo/db-local` repos/tx + stall-service command/HTTP foundations) implemented and locally verified on migration 001 only.
- Phase 09 complete: local SQLite schema and migrations (`@polivo/db-local`, stall-service open/verify/close) implemented and locally verified.
- Phase 08 complete: business domain and confirmed financial rules (`@polivo/domain` foundations + contracts money/weight/payment transport) implemented and locally verified.
- Phase 07 complete: brand design system and app shells (`@polivo/ui`, web dashboard shell, desktop shell) implemented and locally verified.
- Phase 06 complete: testing and continuous integration implemented and locally verified.
- Phase 05 complete: shared contracts and validation (`@polivo/contracts`) implemented and verified.
- Phase 04 complete: web, desktop, and stall-service application foundations bootstrapped.
- Phase 03 complete: monorepo tooling and environment configured.
- Phase 02 complete: project context integrated and Cursor repository instructions configured.
- Phase 01 repository skeleton verified present (`apps/`, `packages/`, `docs/`, `scripts/`, `tests/`, `.github/workflows/`).

## Current Goal

- Begin phase 11 (`11-supabase-schema-and-tenant-isolation.md`) on top of the verified local data-access foundations.
- Continue subsequent implementation units only after each prior unit is verified.

## Completed

- Finalized and applied step `01-project-folder-structure.md`.
- Created the initial monorepo layout:
  - `apps/web/`, `apps/desktop/`, `apps/stall-service/`
  - `packages/contracts/`, `packages/domain/`, `packages/ui/`, `packages/db-local/`, `packages/db-cloud/`
  - `docs/context/`, `docs/implementation/`, `docs/decisions/`, `docs/operations/`
  - `scripts/`, `tests/e2e/`, `tests/fixtures/`, `tests/integration/`, `tests/performance/`, `.github/workflows/`
- Applied step `02-project-context-and-cursor-rules.md`:
  - Reviewed all six canonical context files under `docs/context/`; existing source content preserved.
  - Created root `AGENTS.md` referencing the six context files and architecture boundaries.
  - Created `.cursor/rules/00-polivo-project.mdc` with `alwaysApply: true`.
  - Created `docs/decisions/README.md` with the lightweight decision-record format.
  - Removed `docs/context/.gitkeep` and `docs/decisions/.gitkeep`.
  - Persisted `docs/implementation/02-project-context-and-cursor-rules.md` on disk.
- Applied step `03-monorepo-tooling-and-environment.md`:
  - Configured pnpm workspaces (`apps/*`, `packages/*`) with eight private `@polivo/*` package identities.
  - Pinned Node.js `>=26.13.0 <27` (`.node-version` `26.13.0`) and pnpm `12.16.1`.
  - Added shared `tsconfig.base.json`, ESLint flat config, Prettier, EditorConfig, and `.gitignore`.
  - Added `docs/operations/local-development.md`, `docs/operations/environment-configuration.md`, and `scripts/check-dev-environment.mjs`.
  - Root scripts: `doctor`, `lint`, `format`, `format:check`, `check`.
  - Recorded `docs/decisions/0001-monorepo-tooling-foundation.md`.
  - Selected versions: TypeScript `5.9.3`, ESLint `10.13.0`, `@eslint/js` `10.0.1`, `typescript-eslint` `8.72.1`, Prettier `3.9.10`, `eslint-config-prettier` `10.1.8`, `globals` `17.13.0`.
  - Verification: `pnpm list -r --depth -1` shows eight private packages; single `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` succeeded; `pnpm run doctor`, `pnpm lint`, `pnpm format:check`, and `pnpm check` passed.
- Applied step `04-web-desktop-and-service-bootstrap.md`:
  - Initialized `@polivo/web` (Next.js App Router, `src/`, TypeScript, minimal foundation page).
  - Initialized `@polivo/desktop` (electron-vite, React renderer, main/preload/renderer separation, secure BrowserWindow defaults, empty preload bridge).
  - Initialized `@polivo/stall-service` (Fastify `app`/`config`/`server` split, loopback host/port validation, `GET /health`).
  - Wired root scripts: `dev:web`, `dev:desktop`, `dev:service`, `build`, `typecheck`; extended `check` to include typecheck.
  - Extended ESLint for Next.js, React renderer, Electron privileged code, and Node service scopes.
  - Updated `docs/operations/local-development.md` and `docs/operations/environment-configuration.md`.
  - Selected versions: Next.js `16.4.3`, React `19.3.1`, electron-vite `6.0.0`, Electron `45.1.0`, Vite `8.3.5`, `@vitejs/plugin-react` `6.1.2`, Fastify `5.12.7`, tsx `4.23.15`, `eslint-config-next` `16.4.3`.
  - Development ports: web `3000`, desktop Vite renderer `5173`, stall service `127.0.0.1:3040`.
  - Verification: `pnpm install`, `pnpm run doctor`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, and `pnpm check` passed.
  - Web smoke: production `next start` returned HTTP 200 with foundation page text.
  - Service smoke: `/health` returned expected JSON in compiled mode; invalid `PORT`/`HOST` failed clearly; process stopped cleanly.
  - Desktop smoke: `electron-vite preview` started the Electron window from built output on this Windows host. Renderer Node integration remains disabled by configuration (`nodeIntegration: false`, `sandbox: true`, `contextIsolation: true`).
- Applied step `05-shared-contracts-and-validation.md`:
  - Initialized `@polivo/contracts` as ESM with Zod `4.6.7`, `tsc` → `dist/`, root `exports`, and `build` / `typecheck` / `dev` / `smoke` scripts.
  - Added schemas: opaque identifiers, absolute timestamps, calendar dates, API errors, pagination, local API and sync protocol versions, sync envelope factory, and health response.
  - Integrated stall-service `GET /health` with `buildHealthResponse()` via `workspace:*`.
  - Root `build` / `typecheck` now include contracts first; added `dev:contracts`.
  - Documented usage in `docs/operations/contracts-and-validation.md` and updated `docs/operations/local-development.md`.
  - Recorded `docs/decisions/0002-shared-contracts-foundations.md`.
  - Transport decisions: opaque IDs max length `128`; ISO 8601 timestamps with offset; `YYYY-MM-DD` calendar dates; pagination default `20` / max `100`; `LOCAL_API_CONTRACT_VERSION` and `SYNC_PROTOCOL_VERSION` both `"1"`.
  - Deferred: money/weight/commission/payment schemas (phase 08), business endpoints, auth, sync workers, desktop/web wiring.
  - Verification: contracts smoke passed; clean rebuild without pre-existing `dist/` succeeded; compiled stall-service `/health` returned expected JSON; `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, and `pnpm check` passed.
- Applied step `06-testing-and-continuous-integration.md`:
  - Selected tools: Vitest `5.0.5`, `@vitest/coverage-v8` `5.0.5`, Playwright `@playwright/test` `1.64.1` (Electron under test remains `45.1.0`).
  - Suites: contracts unit tests colocated under `packages/contracts/src/**/*.test.ts`; stall-service integration under `tests/integration/`; web e2e under `tests/e2e/web/` (Chromium, port `3100`); desktop Electron smoke under `tests/e2e/desktop/` against `apps/desktop/out/main/index.js`.
  - Fixtures: synthetic identities under `tests/fixtures/`; `tests/performance/` left reserved with `.gitkeep`.
  - Root commands: `test:unit`, `test:integration`, `test`, `test:watch`, `test:coverage`, `test:e2e:web`, `test:e2e:desktop`; `check` now includes `pnpm test`.
  - Coverage for contracts schemas and stall-service `app.ts` / `config.ts` (text, HTML, LCOV under `coverage/`).
  - CI workflow `.github/workflows/ci.yml` with jobs `quality-and-build` (ubuntu), `web-e2e` (ubuntu), `desktop-smoke` (windows-latest); triggers on pull requests, pushes to `main`, and `workflow_dispatch`.
  - Documented in `docs/operations/testing-and-ci.md`; linked from `docs/operations/local-development.md`.
  - Local verification: `pnpm run doctor`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (45 tests), `pnpm test:coverage`, `pnpm build`, `pnpm test:e2e:web`, `pnpm test:e2e:desktop`, and `pnpm check` passed on this Windows host.
  - Deliberate temporary assertion break confirmed contracts tests fail, then restored.
  - Remote GitHub Actions status: not observed in this session (workflow not yet pushed/run on GitHub; `gh` CLI unavailable locally). Mark `quality-and-build`, `web-e2e`, and `desktop-smoke` required only after their first successful remote run.
- Applied step `07-brand-design-system-and-app-shells.md`:
  - Initialized `@polivo/ui` as ESM with `tsc` → `dist/`, React `19.3.1` peer dependencies, public CSS export `@polivo/ui/styles.css`, and `build` / `typecheck` / `dev` scripts.
  - Design tokens from `docs/context/ui-context.md` in `packages/ui/src/styles/globals.css`; Tailwind v4 (`4.3.3`) + shadcn-style new-york primitives + Lucide `0.544.0`.
  - Local fonts via `@fontsource/inter` and `@fontsource/noto-sans-sinhala` (desktop offline-safe; bundled in Electron renderer build).
  - Shared primitives: Button, Input, Label, Textarea, Checkbox, Select, Dialog, Alert Dialog, Dropdown Menu, Tabs, Tooltip, Badge, Alert, Separator, Skeleton, Scroll Area, Table, Toaster/toast.
  - Shared shells/feedback: AppShell, SidebarNav, AppHeader, PageHeader, BrandMark, SkipLink, EmptyState, LoadingState, ErrorState, StatusIndicator, TableContainer.
  - Web: public `/` foundation retained; `/dashboard` shell with unavailable planned nav (Reports, Farmers, Buyers, Settings); `/dev/ui` development preview returns 404 in production.
  - Desktop: compact shell with status label `Service connection not configured`; Electron security settings preserved.
  - Brand assets: no logo files in repository; text wordmark used. Brand Guidelines PDF/artwork not checked in.
  - Provisional tokens (not brand-approved): `--bg-secondary`, `--bg-secondary-hover`, shadow scale (`--shadow-sm/md/lg`), radius scale mapped to Tailwind rounded utilities.
  - Documented in `docs/operations/design-system.md`; local-development guide updated; root `build`/`typecheck` include `@polivo/ui`; added `dev:ui`.
  - Accessibility/visual automated coverage: skip-to-content, dialog focus restore, responsive nav open/close, planned nav not linked, production preview 404, desktop shell + security smoke.
  - Manual visual review: production web `/` and `/dashboard` probed locally; desktop production build inspected via Electron Playwright smoke (fonts bundled). Full visual QA of Sinhala glyph rendering and narrow viewport polish remains recommended before POS workflows.
  - Verification: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (45), `pnpm build`, `pnpm test:e2e:web` (4), `pnpm test:e2e:desktop` (1), and `pnpm check` passed on this Windows host.
  - Outstanding before phase 08 dependent financial work: unresolved open questions below must be confirmed.
- Applied step `08-business-domain-and-financial-rules.md` (domain foundations only):
  - Wrote the numbered implementation guide (was empty on disk) from confirmed Business Rules.
  - Recorded [0003 — Confirmed financial rules](../decisions/0003-confirmed-financial-rules.md).
  - Extended `@polivo/contracts` with money minor units, weight hundredths, payment method/status, and `F-`/`T-` bill-number schemas plus unit tests; updated `docs/operations/contracts-and-validation.md`.
  - Bootstrapped `@polivo/domain` (ESM, `tsc` → `dist/`, root exports, `build`/`typecheck`/`dev`); wired root `build`/`typecheck`/`dev:domain` and Vitest project `domain`.
  - Domain helpers: commission bands, net weight, per-bag half-up sale/commission, totals + money deductions, oldest-unpaid payment allocation, farmer advances, public price summary, bill-number format/parse, farmer cheque immediate-paid policy, permission capability constants.
  - Representation: money = integer paisa; weight = integer hundredths-kg; commission Rs. 5 / 15 / 50 per kg with inclusive 200–400 band.
  - Explicitly out of scope: DB/migrations, stall-service endpoints, billing UI, permission enforcement, trader cheque paid-immediately rule.
  - Verification: `pnpm run doctor`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (85 tests: contracts + domain + integration), and `pnpm build` passed on this Windows host. Phase 08 touched files pass `prettier --check`. Full-repo `pnpm format:check` currently fails on pre-existing files under `packages/ui`, `apps/web`, and a few ops/docs paths not modified for financial rules; not reformatted in this phase to avoid unrelated churn.
- Applied step `09-local-sqlite-schema-and-migrations.md`:
  - Bootstrapped `@polivo/db-local` (ESM, `tsc` → `dist`, SQL copy into `dist/migrations/sql`, `db:init` / `db:migrate` / `db:status`).
  - Driver: Node.js `node:sqlite` / `DatabaseSync` ([0007](../decisions/0007-local-sqlite-driver-node-sqlite.md)); FK ON, WAL, busy_timeout 5000 ms, `synchronous=FULL`.
  - Migration `001_initial_core_schema`: installation/binding, farmers/traders/vegetables, commission band sets/bands, sales/lines/package weights/farmer allocations, farmer/trader bills, bill_sequences, payments/allocations, audit_events, command_idempotency, sync_outbox + purposeful indexes.
  - Numerics: INTEGER paisa and hundredths-kg adapters; no REAL; no production commission seeds; bill sequence starting numbers not seeded.
  - Deferred tables: arrivals/inventory, staff/devices/permissions, categories/package masters, GL postings, cheque clearance (per [0004](../decisions/0004-phase-09-first-migration-schema-breadth.md)).
  - Stall service: `POLIVO_LOCAL_DB_PATH` required absolute path; openExisting + schema verify on startup; close on shutdown/failed listen; `/health` unchanged; injectable `buildApp({ database })`.
  - Docs: `docs/operations/local-database-and-migrations.md`; env + local-dev updated; cheque-lifecycle roadmap note revised (no clearance tracking).
  - Verification on Windows: `db-local` + contracts + domain + integration = 108 tests; `db:init`/`db:status` smoke; compiled service rejects missing DB; migration SQL present under `dist/`; web/desktop do not import `@polivo/db-local`. Phase-touched Prettier formatting applied. Full-repo `pnpm format:check` may still fail on pre-existing UI/web drift outside this phase.
  - Phase 10 can begin for local data-access/transactions on the core schema; arrivals/inventory/permissions remain blocked until later migrations.
- Applied step `10-fastify-local-data-access-and-transactions.md` (foundations only; migration 001 core tables only):
  - `@polivo/db-local`: `runInTransaction` (`BEGIN IMMEDIATE`, reject nested/async/closed handles), SQLite error classification, per-row mappers, tenant-scoped repositories (binding, farmers/traders, bills + revision updates, idempotency, audit, outbox, bill sequences).
  - `@polivo/stall-service`: composition root, fail-closed production authorization, execution context, idempotent command runner, Fastify validation/error mapping (`apiErrorSchema`), request IDs, 256 KiB body limit.
  - Production `buildApp` still exposes only `GET /health`; business mutation routes unregistered. Test-only `buildTestApp` + fixture routes exercise foundations and return 404 in production.
  - Docs: `docs/operations/local-data-access-and-transactions.md` (linked from local-database, local-development, testing-and-ci guides).
  - Authorization/device/permission enforcement still awaits phases 14–15; no billing/payment/sync-delivery APIs; no arrivals/inventory/permissions schema expansion; bill-number seed policy still open (sequences not seeded with 111111/444444).
  - Verification on Windows: `pnpm lint`, `pnpm typecheck`, `pnpm test` (133 tests: contracts + domain + db-local + integration), `pnpm build` passed. Phase-touched Prettier formatting applied. Compiled service `/health` returned expected JSON; fixture route absent (HTTP 404). Migration `001` checksum unchanged (`b518df58515339e1b90fbc3be4456dc58feb5908798fe75aef0204b96995f286`). Full-repo `pnpm format:check` may still fail on pre-existing UI/web drift outside this phase.
  - Phase 11 can begin for Supabase schema and tenant isolation; real auth and business APIs remain later.

## In Progress

- None.

## Next Up

- Apply phase 11 (`11-supabase-schema-and-tenant-isolation.md`).
- Later phases: billing UI, permission enforcement, arrivals/inventory migrations (consume domain helpers; do not re-implement rules).

## Open Questions

These are unresolved in the context files. Record accepted resolutions under `docs/decisions/` and link them here when decided. Block only the implementation that depends on each item.

- Trader cheque balance effects: **Proposed** immediate-paid (same pattern as farmer cheques; manual reversal with reason if it fails later). Not confirmed — do not implement as accepted rule. See [0006](../decisions/0006-trader-cheque-immediate-paid-proposed.md). Does not block phase 09 schema (no cheque-clearance tables anyway per [0004](../decisions/0004-phase-09-first-migration-schema-breadth.md)).
- Offline credential expiry and revocation policy.
- Backup retention and recovery expectations (including RTO/RPO).
- Missing brand guidance: approved logo masters (including reverse/dark-surface and monochrome thermal variants) are not in the repository; text wordmark is temporary until assets are supplied.
- Reconcile desktop billing chrome: familiar Seller Bill wireframe uses top module nav + paid/unpaid side lists + dense center workspace (`docs/context/desktop-billing-layout.md`), while Phase 07 shipped a left-rail `AppShell`. Decide the application-wide desktop chrome when billing UI is implemented and record it under `docs/decisions/` if needed.

Resolved for phase 08 (see [0003 — Confirmed financial rules](../decisions/0003-confirmed-financial-rules.md)):

- Commission units, bands, and inclusive 200/400 boundaries.
- Money and weight precision (integer paisa; integer hundredths-kg).
- Rounding (per-bag half-up) and packaging net-weight rules.
- Buyer/trader and farmer bill grouping concepts.
- Bill numbering formats `F-` / `T-` and sequence rules (assignment/persistence later).
- Payment allocation default (oldest unpaid first), partial settlement, overpay credit, farmer advances.
- Farmer cheque immediate-paid policy (no clearance workflow).
- Corrections/cancellations invariants (no silent overwrite after finalize; linked correction with reason).
- Configurable permission capability list (constants only; enforcement later).
- Public vegetable price low/high/average calculation rules.

Resolved ahead of phase 09:

- First migration schema breadth: core operational tables only; no arrivals/inventory/permissions/lorry/approval/override/cheque-tracking tables. See [0004](../decisions/0004-phase-09-first-migration-schema-breadth.md).
- Commission configuration v1: stall default bands only; no vegetable/category or per-sale overrides; store applied rate and amount on finalized sales. See [0005](../decisions/0005-commission-configuration-v1.md).

## Architecture Decisions

- Folder layout from phase 01 remains the structural baseline. Follow `architecture.md` for the intended system design.
- [0001 — Monorepo tooling foundation](../decisions/0001-monorepo-tooling-foundation.md): pnpm workspaces, Node.js 26 LTS, pnpm 12.16.1, shared TypeScript/ESLint/Prettier foundations, native workspace orchestration.
- [0002 — Shared contracts foundations](../decisions/0002-shared-contracts-foundations.md): Zod 4.6.7, ESM contracts package, opaque identifier bounds, timestamp/date transport, pagination limits, initial protocol versions `"1"`.
- [0003 — Confirmed financial rules](../decisions/0003-confirmed-financial-rules.md): integer money/weight representation, commission bands, rounding/packaging, bill-number formats, payment defaults, farmer cheque immediate-paid; trader cheques still open/proposed.
- [0004 — Phase 09 first migration schema breadth](../decisions/0004-phase-09-first-migration-schema-breadth.md): core operational tables only for the first local SQLite migration.
- [0005 — Commission configuration v1](../decisions/0005-commission-configuration-v1.md): stall default bands only; snapshot applied commission on finalize.
- [0006 — Trader cheque immediate-paid](../decisions/0006-trader-cheque-immediate-paid-proposed.md): **Proposed** only; awaiting confirmation.
- [0007 — Local SQLite driver (`node:sqlite`)](../decisions/0007-local-sqlite-driver-node-sqlite.md): built-in Node 26 driver; WAL + FK + durable pragmas; no ORM.

## Session Notes

- Phase 02 consistency review: the six context files align with Next.js web, Electron + React + Vite desktop, Fastify stall service, one SQLite authority per stall, multi-terminal LAN access, Supabase PostgreSQL sync/reporting, Clerk online auth, local staff/device offline access, transactional outbox, local retention after sync, initially read-only web financial access, and light keyboard-first UI.
- No material architecture conflicts found between the six files.
- Non-blocking note: `code-standards.md` still says follow `ui-context.md` “once defined”; `ui-context.md` is already present.
- Soft terminology note: UI context uses “buyers/traders”; overview and architecture primarily use “buyers.”
- No legacy `.cursorrules` file was present; no migration required.
- Phase 02 is documentation-only: no dependencies, application scaffolds, schemas, credentials, or env files were added.
- Phase 03 note: bare `pnpm doctor` invokes pnpm’s built-in command; use `pnpm run doctor` for the repository prerequisite script. Prettier ignores existing `docs/context/**` and `docs/implementation/**` to avoid mass-reformatting those guides.
- Environment note: host Node.js was upgraded to 26.13.0 LTS for this phase. This Node install did not expose `corepack` on PATH; pnpm `12.16.1` was available via the existing user-global pnpm shim and satisfied `packageManager`.
- Phase 04 note: pnpm `allowBuilds` in `pnpm-workspace.yaml` permits `electron`, `esbuild`, `sharp`, and `unrs-resolver` lifecycle scripts required by the application toolchains. No Tailwind/shadcn yet (design system deferred). Desktop↔service wiring remains phase 16.
- Phase 05 note: contracts consumers must build or watch `@polivo/contracts` before resolving package exports; no new build orchestrator was added.
- Phase 06 note: root `package.json` sets `"type": "module"` so Vitest configs load as ESM. Playwright Chromium must be installed once via `pnpm exec playwright install chromium`. Web e2e uses dedicated port `3100`. Desktop smoke verified locally on Windows against built electron-vite output.
- Phase 07 note: UI consumers must build or watch `@polivo/ui` before resolving package exports. Tailwind utility scanning uses `@source` into `packages/ui/src` from each app. Provisional secondary/shadow/radius tokens are implementation recommendations, not approved brand values. Unresolved financial rules still block dependent phase 08 work.
- Desktop layout inspiration: documented the older-app Seller Bill wireframe as `docs/context/desktop-billing-layout.md` (source `inspiration Layouts/Seller Bill Wireframr.png`), linked from `ui-context.md`, `design-system.md`, and `inspiration Layouts/README.md`. Documentation only — no billing UI or shell rewrite. Wireframe “Seller” maps to Polivo buyer; placeholder amounts and commission values are not approved rules.
- Phase 08 note: `@polivo/domain` has no runtime dependency on `@polivo/contracts` (avoids coupling pure math to Zod). Consumers must build or watch `@polivo/domain` before resolving package exports. Trader cheque immediate-paid behavior remains an open product question and is not implemented. Full-repo `pnpm format:check` drift outside phase 08 files should be cleaned in a dedicated formatting pass before relying on `pnpm check` in CI.
- Pre–phase 09 decisions recorded 2026-11-01: accepted schema breadth ([0004](../decisions/0004-phase-09-first-migration-schema-breadth.md)) and commission config v1 ([0005](../decisions/0005-commission-configuration-v1.md)); trader cheques recorded as Proposed only ([0006](../decisions/0006-trader-cheque-immediate-paid-proposed.md)).
- Phase 09 completed 2026-11-01: `@polivo/db-local` + stall-service lifecycle; driver [0007](../decisions/0007-local-sqlite-driver-node-sqlite.md). Cheque-lifecycle roadmap must not reintroduce clearance/rejection/banking tracking for farmer payouts. Bill-number start/rollover presentation policy remains open (sequences not seeded with 111111/444444).
- Phase 10 completed 2026-11-01: local data-access/transaction foundations on migration 001 only. Production remains health-only; fixture harness is test composition only. Auth integration points remain for phases 14–15.
- Pre–phase 11 env prep (2026-11-01): added `apps/web/.env.example` (placeholders only) and local `apps/web/.env.local` for Clerk + Supabase development credentials. Documented in `docs/operations/environment-configuration.md`. Gitignore verified: `.env` / `.env.*` ignored, `!.env.example` kept trackable; `.env.local` does not appear in `git status`. No Clerk/Supabase SDK or schema integration yet — fill real keys before those phases need them.
