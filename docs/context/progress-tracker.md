# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by inspected code or verification results. Documentation progress does not establish implementation completion.

## Current Phase

- Phase 16 complete (local verification + **operator single-PC acceptance 2026-11-08**): desktop service connection and LAN terminals (`16-desktop-service-connection-and-lan-terminals.md`, ADR [0012](../decisions/0012-desktop-service-transport-trust.md), ops guide). HTTPS listener (loopback default + explicit LAN), enrollment trust pins, main-process pinned client, configure/verify/sign-in/outage UI. **Physical two-PC LAN / Windows firewall acceptance still pending** (does not block Phase 17).
- Phase 15 mechanics complete; **durations approved** via ADR [0013](../decisions/0013-local-staff-offline-access-durations.md) (2h idle / 12h absolute / 7d snapshot / first login offline allowed). Production composition uses `createProductionOfflineAccessPolicy`; trusted permission-refresh grants added. **Not full operational production-ready** until real DPAPI/`safeStorage` reopen is verified and refresh procedure is confirmed on target env; fresher-auth subset and Phase 33 sync remain open.
- Phase 14 complete (implementation): stall provisioning and device enrollment (`14-stall-provisioning-and-device-enrollment.md`, ADR 0010, ops guide). Development dashboard confirmed: host Activated, terminal Activated, terminal Revoked, additional terminal authorization Pending activation. Outstanding platform verification (real Windows DPAPI reopen, Electron `safeStorage` reopen, offline-restart enrollment evidence) remains recorded below — not claimed passed.
- Phase 13 complete: tenant onboarding and role management (`@polivo/web` onboarding/members/permissions UI, SECURITY DEFINER RPCs, invitations, permission profile revisions, ADR 0009, ops guide) implemented and locally verified.
- Phase 12 complete: Clerk web authentication (`@polivo/web` Clerk SDK, `proxy.ts`, sign-in/up, server identity + membership helpers, user-context Supabase client, protected dashboard/tenant states, auth tests, `docs/operations/web-authentication.md`) implemented and locally verified for deterministic + web e2e checks. Real Clerk→Supabase RLS live verification remains environment-dependent (see Session Notes).
- Phase 11 complete: Supabase schema and tenant isolation (`@polivo/db-cloud`, `supabase/migrations`, RLS isolation tests) implemented and locally verified.
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

- **Ready for Phase 17** farmer-management foundations after operator-reported single-PC Phase 14–16 acceptance (2026-11-08). Obtain or add `docs/implementation/17-farmer-management.md` before coding Phase 17 (file not yet in repo).
- Keep physical two-PC LAN / formal DPAPI–`safeStorage` evidence / terminal-revoke refresh as **outstanding acceptance** — they do **not** block starting Phase 17, and Phases 14–16 remain **not production-ready**.
- Complete remaining real Clerk–Supabase integration verification and pre–phase 12 environment items listed in Session Notes as capacity allows.
- Continue subsequent implementation units only after each prior unit is verified. Do not mark synchronization complete until its dedicated phases.

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
- Applied step `11-supabase-schema-and-tenant-isolation.md`:
  - Canonical cloud migrations under `supabase/migrations` only (`config.toml` + four forward SQL migrations). Documented in [cloud-database-and-tenant-isolation.md](../operations/cloud-database-and-tenant-isolation.md); ADR [0008](../decisions/0008-cloud-schema-and-tenant-isolation.md).
  - Tables: `tenants`, `tenant_memberships`, reporting copies of farmers/traders/vegetables/commission bands/sales/lines/packages/allocations/bills/payments/audit_events, plus `sync_received_events` receipt metadata (not a cloud outbox).
  - Identity: Clerk `auth.jwt()->>'sub'` as opaque TEXT; membership `(tenant_id, identity_provider, external_subject)` unique; `reporting_reader` + active status required for reporting SELECT via `has_active_reporting_access`.
  - Grants/RLS: authenticated SELECT-only on reporting tables; own-row membership SELECT; no authenticated financial INSERT/UPDATE/DELETE; FORCE RLS enabled.
  - Numerics: Postgres `BIGINT` paisa/hundredths-kg; `@polivo/db-cloud` string transport adapters.
  - `@polivo/db-cloud`: user-context client factory (access token required; no privileged fallback), types entry, unit tests; root `build`/`typecheck`/`test` wired; `pnpm test:db-cloud` + CI job `db-cloud`.
  - Isolation suite (13 tests) against disposable embedded Postgres applying canonical migrations (Docker Supabase preferred when available). Simulated JWT claims labeled as policy tests.
  - Storage buckets deferred. Remote migration to a shared Supabase project **not applied** in this phase (pending explicit target verification).
  - Verification on Windows: `pnpm lint`, `pnpm typecheck`, `pnpm test` (147 tests), `pnpm test:db-cloud` (13), `pnpm build` passed. Phase-touched Prettier formatting applied. Full-repo `pnpm format:check` may still fail on pre-existing UI/web drift outside this phase.
  - Phase 12 can begin for Clerk web authentication. Synchronization ingestion remains phases 31–34.
- Applied step `12-clerk-web-authentication.md`:
  - Installed `@clerk/nextjs` `7.9.23` in `@polivo/web`; wired `ClerkProvider`, Next.js 16 `src/proxy.ts` (`clerkMiddleware`), `/sign-in` and `/sign-up` Clerk components with Polivo appearance, env example URLs.
  - Server helpers under `apps/web/src/lib/auth/`: safe redirects, require-user (page redirect / API 401), request-scoped `createRequestUserSupabaseClient` via `(await auth()).getToken()` into `@polivo/db-cloud` (no JWT template, no privileged fallback), membership list/tenant access resolution.
  - Protected `GET /api/auth/session` (no tokens returned); authenticated `/dashboard` membership states (none / active / unavailable) and `/tenants/[tenantId]` access-denied without Create-stall or auto tenant pick.
  - Deterministic Vitest project `web` (22 tests); web e2e updated for public home, dashboard→sign-in redirect, sign-in theme, untrusted redirect rejection, API 401, `/dev/ui` 404 (6 passed). Signed-in Playwright + live RLS integration not claimed complete.
  - Docs: `docs/operations/web-authentication.md`; env/local-dev/testing-and-ci links updated. Webhooks/onboarding deferred.
  - Verification on Windows: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (177), `pnpm test:db-cloud` (14), `pnpm build`, `pnpm test:e2e:web` (6), `pnpm check` passed. Web e2e host must be `localhost` (not `127.0.0.1`) with Clerk + Next 16 proxy.
  - Phase 13 can begin for tenant onboarding/roles. Do not mark onboarding, local auth, or permission sync complete.
- Applied step `13-tenant-onboarding-and-role-management.md`:
  - ADR [0009](../decisions/0009-tenant-onboarding-and-roles.md): create-stall→owner, roles `owner|billing_staff|cashier`, capability catalog, hashed invitations, no ownership transfer, cloud≠local enforcement.
  - Forward migration `supabase/migrations/20261102180000_tenant_onboarding_and_roles.sql`: tenant profile fields, membership roles/capabilities, permission profiles, invitations, onboarding idempotency, admin audit, SECURITY DEFINER RPCs, owner RLS for admin reads; `has_active_reporting_access` accepts active operational roles.
  - Contracts tenant-access schemas; domain capability validation/groups; `@polivo/db-cloud` types updated.
  - Web APIs: `POST /api/tenants`, invitations create/revoke/accept, membership patch, permission-profile put (owner-gated, user JWT RPCs, SHA-256 invitation tokens).
  - UI: `/onboarding`, dashboard create-stall entry, stall selector by display name (no auto-pick), owner `/members` + `/permissions`, `/invitations/[token]` accept; truthful “Saved to cloud / Local application status unavailable”.
  - Docs: `docs/operations/tenant-onboarding-and-access-management.md`; web-auth + cloud-isolation links updated.
  - Verification on Windows: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (188), `pnpm test:db-cloud` (25), `pnpm build`, `pnpm test:e2e:web` (7) passed. Remote migration apply and real Clerk→Supabase live onboarding not claimed complete.
  - Deferred: device enrollment, local staff credentials, permission sync/acks, ownership transfer, tenant deletion. Phase 14 can begin.
- Applied step `14-stall-provisioning-and-device-enrollment.md` (implementation complete; platform reopen smoke still outstanding):
  - Local SQLite `002_host_and_terminal_enrollment` (`host_enrollment`, `accepted_terminals`); migration `001` checksum unchanged (`b518df58515339e1b90fbc3be4456dc58feb5908798fe75aef0204b96995f286`).
  - Cloud migration `20261103180000_device_enrollment.sql` (devices, grants, owner + redeem/confirm/rotate RPCs, deny-direct RLS); follow-up `20261104120000_fix_device_enrollment_state_revision_ambiguity.sql`.
  - Owner Devices UI/APIs; machine redeem/confirm/rotate via privileged server client; stall-service `activate-host` + DPAPI/simulated secure storage; desktop `safeStorage` terminal enroll + loopback pairing accept.
  - ADR [0010](../decisions/0010-device-credential-storage.md); ops [stall-provisioning-and-device-enrollment.md](../operations/stall-provisioning-and-device-enrollment.md).
  - Development dashboard confirmed (operator): one host **Activated**, one terminal **Activated**, one terminal **Revoked**, one additional terminal authorization **Pending activation**.
  - Local verification earlier session: `pnpm lint`, `pnpm test` (218), `pnpm test:db-cloud` (28), stall-service/desktop builds; simulated secure-storage in automated tests.
  - Hosted: `20261103180000_device_enrollment` applied to **polivo-dev** (`jvwjhvouhuvqujuinuoc`).
  - Outstanding verification (explicitly not claimed passed): real Windows DPAPI credential reopen smoke; Electron `safeStorage` persistence reopen; offline-restart enrollment evidence; optional web e2e for Devices page. These must not block Phase 15 independent local-auth work.
- Applied step `15-local-staff-authentication-and-offline-access.md` (mechanics complete; **not production-ready**):
  - Local SQLite `003_local_staff_and_sessions` (staff, credentials, capability snapshots, sessions, login attempts, security audit); migrations `001`/`002` checksums unchanged.
  - Stall-service: scrypt$v1 staff verifiers, SHA-256 session digests, device Ed25519 proof, sign-in/session/sign-out routes, first-owner setup + staff CLI, real `createLocalStaffAuthorizationAdapter`, production fail-closed offline policy + TEST-ONLY injectable policy ([0011](../decisions/0011-local-staff-offline-policy-fail-closed.md)).
  - Command runner rechecks authorization before writes and before idempotent replay.
  - Cloud: `20261104180000_local_staff_setup_grants.sql` + owner authorize / machine redeem web APIs (distinct from device enrollment grants). Remote apply to polivo-dev **not claimed** in this session.
  - Ops: [local-staff-authentication-and-offline-access.md](../operations/local-staff-authentication-and-offline-access.md).
  - Verification on Windows: `pnpm typecheck`, `pnpm test` (225), `pnpm build` passed; phase-touched ESLint clean. Full-repo `pnpm lint` still fails on pre-existing desktop/web Devices issues outside this phase. Automated tests use TEST-ONLY policy + memory secure storage (not real DPAPI/`safeStorage`).
  - Phase 16 can connect to `/local-auth/*`. Operational offline rollout blocked until product session/snapshot durations are approved.
- Applied step `16-desktop-service-connection-and-lan-terminals.md` (local verification; physical two-PC pending):
  - Stall-service: `POLIVO_LISTEN_MODE` loopback|lan, HTTPS with auto-managed self-signed TLS under host credential root, `GET /connection/identity` (Ed25519-signed host trust), loopback-only guards on `/enrollment/terminals/accept` and `/local-auth/setup-owner`, accept response returns trust pins.
  - Contracts + ADR [0012](../decisions/0012-desktop-service-transport-trust.md): connection/identity schemas; host-accept trust fields.
  - Desktop: main-process pinned HTTPS client, device proofs + session secret in main only, `polivoConnection` preload IPC, configure/verify/sign-in/switch-staff/sign-out/retry UI; enrollment stores trust pins over loopback HTTPS.
  - Ops: [desktop-service-connection-and-lan-terminals.md](../operations/desktop-service-connection-and-lan-terminals.md); env + local-dev + Phase 14 trust section updated.
  - Outage: host unreachable → block + retry; identity fail → stop before credentials; local sign-out without claiming server revocation until ack; internet-only outage must not force sign-out.
  - Verification on Windows: `pnpm typecheck` (service+desktop), `pnpm test` (234), `pnpm build` (service+desktop), `pnpm test:e2e:desktop` (1) passed. Physical two-PC LAN/firewall not claimed. Production offline policy still fail-closed (ADR 0011).
  - Phase 17 (`17-farmer-management.md`) may begin for farmer management foundations.

## In Progress

- Outstanding Phase 14–16 acceptance (does not block Phase 17 start): physical two-PC LAN + Windows firewall; formal confirmation that host reopen used real Windows DPAPI and terminal reopen used Electron `safeStorage` (not simulated); terminal revocation enforcement under implemented refresh policy.
- Pre–phase 12 / phase 12 live-environment follow-ups remain open where not terminal-confirmed (Docker local Supabase stack, GitHub Actions green observation, Vercel staging env mirroring, optional dedicated Clerk testing-token signed-in e2e, invitation-accept live smoke after Clerk session email claims are added). Remote cloud migrations through **`20261103180000`** confirmed applied on **polivo-dev** (`jvwjhvouhuvqujuinuoc`, matches `NEXT_PUBLIC_SUPABASE_URL`). Keep CLI linked to the same project as `.env.local`. Confirm remote apply of `20261104180000_local_staff_setup_grants` and `20261107200000_local_staff_permission_refresh` on the linked project when operating trusted refresh.

## Next Up

- Add `docs/implementation/17-farmer-management.md`, then mark Phase 17 in progress and implement per that guide.
- Later phases: billing UI, permission enforcement, arrivals/inventory migrations (consume domain helpers; do not re-implement rules).

## Open Questions

These are unresolved in the context files. Record accepted resolutions under `docs/decisions/` and link them here when decided. Block only the implementation that depends on each item.

- Trader cheque balance effects: **Proposed** immediate-paid (same pattern as farmer cheques; manual reversal with reason if it fails later). Not confirmed — do not implement as accepted rule. See [0006](../decisions/0006-trader-cheque-immediate-paid-proposed.md). Does not block phase 09 schema (no cheque-clearance tables anyway per [0004](../decisions/0004-phase-09-first-migration-schema-breadth.md)).
- Fresher-auth capability subset (stricter snapshot age for sensitive ops) and staff secret TTL/rotation — deferred in [0013](../decisions/0013-local-staff-offline-access-durations.md). Session idle/absolute/snapshot age and first-login-offline are **resolved** by 0013.
- Offline cloud→local revoke lag until Phase 33 automated permission sync (accepted limitation in 0013).
- Revoked-after-activation host slot: whether a revoked host continues to block a second financial writer until Phase 39 recovery (CodeRabbit PR #5 CR-11). Do not invent recovery in Phases 14–16.
- SQL `polivo_jwt_verified_email` softness vs strict Clerk session `email_verified` claim (CodeRabbit PR #5 CR-10); web accept already cross-checks `currentUser`.
- Rate-limit / short-lived cache for stall-service `GET /connection/identity` (CodeRabbit PR #5 CR-21).
- Backup retention and recovery expectations (including RTO/RPO).
- Missing brand guidance: approved logo masters (including reverse/dark-surface and monochrome thermal variants) are not in the repository; text wordmark is temporary until assets are supplied.
- Reconcile desktop billing chrome: familiar Seller Bill wireframe uses top module nav + paid/unpaid side lists + dense center workspace (`docs/context/desktop-billing-layout.md`), while Phase 07 shipped a left-rail `AppShell`. Decide the application-wide desktop chrome when billing UI is implemented and record it under `docs/decisions/` if needed.
- Cloud reporting access vs tenant lifecycle status: should inactive or suspended `tenants.status` deny reporting SELECT even when the caller has an active membership? Current `has_active_reporting_access` checks membership role/status only (CodeRabbit CR-03 on PR #4; roles are now `owner|billing_staff|cashier`). Do not change the SQL helper until this is decided and recorded under `docs/decisions/`.

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
- [0008 — Cloud schema and tenant isolation](../decisions/0008-cloud-schema-and-tenant-isolation.md): canonical `supabase/migrations`, Clerk `sub` TEXT membership, BIGINT+string numerics, reporting-read-only RLS.
- [0009 — Tenant onboarding and roles](../decisions/0009-tenant-onboarding-and-roles.md): stall creation→owner, operational roles/capabilities, hashed invitations, owner-only admin, no ownership transfer, cloud configuration vs local enforcement.
- [0010 — Device credential storage](../decisions/0010-device-credential-storage.md): Ed25519 possession proofs; host Windows DPAPI; terminal Electron `safeStorage`; opaque `credential_ref` in SQLite; offline expiry deferred to phase 15.
- [0011 — Local staff offline policy fail-closed](../decisions/0011-local-staff-offline-policy-fail-closed.md): production offline staff auth fail-closed until product durations approved; TEST-ONLY injectable policy for tests only; session lifetime independent of snapshot deadline; scrypt$v1 verifiers.
- [0012 — Desktop service transport trust](../decisions/0012-desktop-service-transport-trust.md): HTTPS + enrollment-pinned TLS fingerprint + host Ed25519 identity; editable address separate from trust; loopback-only provisioning routes; re-pair for legacy terminals without pins.
- [0013 — Local staff offline access durations](../decisions/0013-local-staff-offline-access-durations.md): 2h idle / 12h absolute / 7d snapshot / first login offline allowed; production policy composition default; trusted permission refresh grants; offline cloud-revoke lag documented.

## Session Notes

- CodeRabbit PR #5 triage (2026-11-08): Captured in [docs/coderabbitissues/2026-11-08-pr-5-phases-12-16.md](../coderabbitissues/2026-11-08-pr-5-phases-12-16.md). Fixed: terminal key reuse, DPAPI stdin, rotate previous-key proof, expectedRole redeem (`20261108120000_redeem_expected_role_and_audit_execute.sql`), audit EXECUTE revoke, pinned HTTPS pin-before-write, atomic staff setup, safe JSON boundaries, Devices JSX/try, Prettier/lint, ops resume wording. Verified: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, targeted web/stall/contracts/db-local/integration enrollment+staff tests. Deferred: soft JWT email_verified SQL, revoked-host slot until Phase 39 recovery, identity rate-limit/cache, second-PC LAN. Apply the new Supabase migration before redeploying redeem.
- Phase 14–16 single-PC operator acceptance (2026-11-08): Operator reported PASS for minimum checklist on one Windows PC (web owner + web cashier access controls; fresh host Activated; HTTPS `/health`; terminal pair with trust pins; Verify host → Stall A; local CASH1/owner sign-in, wrong secret, switch staff, sign-out; service stop → unavailable; restart → Retry; sign-out while stopped locks; pairing survives desktop reopen). **Ready for Phase 17 foundations.** Still outstanding (not production-ready): two-PC LAN, formal DPAPI/`safeStorage` evidence, terminal revoke refresh. Implementation guide `17-farmer-management.md` not yet in repo.
- Production offline policy ADR 0013 (2026-11-07): replaced fail-closed default with production durations; trusted `permission-refresh` authorize/redeem; CLI rejects argv-only refresh; unit + integration coverage for login success, snapshot expiry mid-session, session poll not extending idle. Operator must apply cloud migration `20261107200000` and restart stall-service.
- Local staff activate-staff capabilities argv (2026-11-07): PowerShell/pnpm stripped JSON quotes → `JSON.parse` failure. Added `parseCapabilitiesArgv` (valid JSON + shell-mangled recovery) for `activate-staff`; stall-service unit tests; ops + current-issues updated. Does not weaken `areKnownCapabilities`.
- Local staff setup-grant redeem Clerk 401 (2026-11-07): `isProtectedPath` now exempts `POST /api/local-staff/setup-grants/redeem` as a machine endpoint (mirrors `/api/device-enrollment/`); owner authorize stays protected. Unit tests in `redirects.test.ts` pass (9). Operator retest: fresh grant + `staff-cli setup-owner` with web running. See `docs/context/current-issues.md`. Does not change ADR 0011 fail-closed or second-PC LAN enrollment.
- Devices PGRST202 (2026-11-03): CLI was on polivo-staging while web used polivo-dev; pushed `20261103180000` to polivo-dev; clarified missing-RPC error copy; Devices page shows unavailable instead of 500.
- Phase 14 implementation (2026-11-03) / completion note (2026-11-04): enrollment path Owner Devices → one-time secret → `activate-host` / Electron enroll → cloud redeem/confirm → local `stall_binding` + `host_enrollment` / `accepted_terminals`. Development dashboard confirmed host+terminal Activated, one Revoked, one Pending. Phase 14 implementation marked complete; real DPAPI/`safeStorage` reopen and offline-restart evidence remain outstanding (not claimed passed). Offline credential expiry still open (ADR 0011 fail-closed for Phase 15 production).
- Phase 15 started (2026-11-04): progress tracker marked in progress; ADR 0011 recorded; implementation follows `15-local-staff-authentication-and-offline-access.md`.
- Phase 15 mechanics completed (2026-11-04): migration `003`, local auth routes/CLI, authorization adapter, TEST-ONLY offline policy tests (offline cashier login with zero cloud calls; wrong-device session denial; staff switch; credential reset/deactivate; capability reduction on idempotent replay; production fail-closed denies login). Not production-ready pending offline duration decisions. Phase 16 may connect to local auth interface.
- Phase 16 started (2026-11-05): progress tracker marked in progress; implementation follows `16-desktop-service-connection-and-lan-terminals.md`.
- Phase 16 completed locally (2026-11-05): HTTPS + trust pins + main-process client + desktop connection UI; ADR 0012; ops guide. Checks: typecheck, test (234), desktop/service build, desktop e2e. Physical two-PC LAN pending. Ready for Phase 17 farmer management (not offline-production-ready).
- Invitation accept non-canonical email_verified (2026-11-03): Clerk `currentUser` verified but session claim was a non-true string; preflight now trusts verified currentUser (unless claim explicitly false); migration `20261103120000` softens `polivo_jwt_verified_email`. See `docs/context/current-issues.md`.
- Invitation accept email_verified false (2026-11-03): after shortcode fix, claims present but `email_verified` false (unverified invitee email). Split preflight messages; `currentUser()` cross-check. See `docs/context/current-issues.md`.
- Invitation accept EMAIL_NOT_VERIFIED shortcode (2026-11-03): invalid `primary_email_address_verified` corrected to `{{user.email_verified}}`. See `docs/context/current-issues.md`.
- Invitation visibility (2026-11-03): invitees do not see pending invites on dashboard by design (copyable link only, no inbox). Clarified dashboard empty state, Members invite helper, and ops/current-issues. See `docs/context/current-issues.md`.
- Hydration mismatch (2026-11-03): Next.js overlay showed `<body cz-shortcut-listen>` mismatch — ColorZilla extension, not stall/account logic. Added `suppressHydrationWarning` on `html`/`body` in `apps/web/src/app/layout.tsx`. See `docs/context/current-issues.md`.
- Invitation accept 400 (2026-11-02): create-stall/invite worked; accept failed because Clerk default session JWT lacks `email` / `email_verified` required by `polivo_jwt_verified_email`. Documented required Clerk session claims; improved invitation RPC logging and `EMAIL_NOT_VERIFIED` / `INVALID_TOKEN` mapping. Operator must add claims in Clerk Dashboard, sign out/in, and accept a **new** invite to the exact primary email. See `docs/context/current-issues.md`.
- Create-stall 503 fix (2026-11-02): live PGRST202 was CLI linked to **polivo-staging** while `.env.local` targeted **polivo-dev**. Relinked to `jvwjhvouhuvqujuinuoc` and pushed through `20261102193000`. Keep CLI link matched to `NEXT_PUBLIC_SUPABASE_URL`.
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
- Pre–phase 11 Vercel staging build fix (2026-11-01): clean Vercel builds failed with `Can't resolve '@polivo/ui'` because `packages/ui/dist/` is not committed and Root Directory `apps/web` only ran `next build`. `@polivo/web` `build` now runs `pnpm --filter @polivo/ui build && next build`; added `apps/web/vercel.json` install/build commands; documented Vercel settings in `docs/operations/environment-configuration.md` (and design-system / local-development notes). Local verification: deleted `packages/ui/dist`, then `pnpm --filter @polivo/web build` succeeded. Redeploy staging after this change is on the branch Vercel builds.
- Phase 11 completed 2026-11-01: cloud schema/RLS foundations only. Isolation tests originally used embedded Postgres with a Supabase-compatible roles/`auth.jwt()` stub when Docker was unavailable on the verifying Windows host.
- Pre–phase 12 setup progress (2026-11-02), recorded from operator setup notes (only mark complete when supported by confirmation):
  - **Done / in progress as reported:** reviewed Clerk and Supabase development projects and API credentials; followed native Clerk ↔ Supabase third-party auth setup (no legacy JWT templates); updated Clerk Frontend API domain in `supabase/config.toml` (resolves prior invalid-domain error; current local value is the development Clerk accounts host); reviewed `apps/web/.env.local` Clerk/Supabase development keys (secrets stay out of Git); Supabase CLI available; Next.js production build and TypeScript compilation passed; web e2e failures attributed to missing Playwright Chromium executable rather than an application build failure; reached commit/push/GitHub Actions verification stage (`development` branch includes commit `before phase 12`).
  - **Not yet confirmed:** Docker/local Supabase stack starts successfully; all four cloud migrations applied on the linked Supabase development project; full formatting + unit/integration + e2e suites green after Chromium install/rerun; remote GitHub Actions jobs (`quality-and-build`, `db-cloud`, `web-e2e`, `desktop-smoke`) observed green; Vercel staging env mirrors development Clerk/Supabase vars (Step 9); development tenant + `tenant_memberships` row for a real Clerk `sub` (Step 10).
  - Phase 12 implementation guide is on disk; phase 12 coding completed 2026-11-02 (see Completed). Real Clerk↔Supabase third-party acceptance and remote migration application still require operator confirmation before claiming live integration verified.
- PR #4 CodeRabbit triage (2026-11-02): captured in [docs/coderabbitissues/2026-11-02-pr-4-phase-11-cloud-schema.md](../coderabbitissues/2026-11-02-pr-4-phase-11-cloud-schema.md). Fixed CR-01 (loopback test DB guard), CR-02 (embedded Postgres cleanup on schema failure), CR-04 (forward migration `20251102140000_sale_farmer_allocation_sale_line_fk.sql` + isolation test). Deferred CR-03 (tenant status gating — open question), CR-05 (RLS perf), CR-06 (payment string reads). Wontfix CR-07 (docstring coverage bot).
- PR #4 CodeRabbit follow-up (2026-11-02, review 5734130351): fixed CR-08 (IPv6 `[::1]`), CR-09 (Postgres `?host=` override), CR-10 (`initialise()` cleanup), CR-11 (embedded default; `POLIVO_CLOUD_TEST_USE_LOCAL_SUPABASE=1` opt-in), CR-12 (allocation FK assertion).
- PR #4 CodeRabbit CR-13 (2026-11-02, discussion r4440630702): reject duplicate Postgres `host` query params so loopback-first / remote-last URLs cannot bypass the isolation-test guard.
- PR #4 CodeRabbit three-thread follow-up (2026-11-02): CR-04 composite allocation FK folded into `20251101120100` with idempotent `20251102140000`; CR-13 hardened to reject empty duplicate `host` keys before trim; CR-14 ops doc clarifies `POLIVO_CLOUD_TEST_DATABASE_URL` is ignored by `pnpm test:db-cloud`.
