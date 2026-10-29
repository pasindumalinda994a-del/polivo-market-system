# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by inspected code or verification results. Documentation progress does not establish implementation completion.

## Current Phase

- Phase 05 complete: shared contracts and validation (`@polivo/contracts`) implemented and verified.
- Phase 04 complete: web, desktop, and stall-service application foundations bootstrapped.
- Phase 03 complete: monorepo tooling and environment configured.
- Phase 02 complete: project context integrated and Cursor repository instructions configured.
- Phase 01 repository skeleton verified present (`apps/`, `packages/`, `docs/`, `scripts/`, `tests/`, `.github/workflows/`).

## Current Goal

- Begin `docs/implementation/06-testing-and-continuous-integration.md` when that guide is available.
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

## In Progress

- None.

## Next Up

- Apply `docs/implementation/06-testing-and-continuous-integration.md` when available.
- Continue subsequent implementation units only after each prior unit is verified.

## Open Questions

These are unresolved in the context files. Record accepted resolutions under `docs/decisions/` and link them here when decided. Block only the implementation that depends on each item.

- Commission units, bands, boundaries, and category overrides.
- Money and weight precision specifics (currency, decimal places, weight units).
- Rounding and packaging deduction rules.
- Buyer and farmer bill grouping rules.
- Bill numbering format and sequence rules.
- Payment allocation and partial settlement rules.
- Cheque clearance and balance effects.
- Corrections, cancellations, and returns workflows.
- Staff permission matrix (roles and allowed actions).
- Offline credential expiry and revocation policy.
- Backup retention and recovery expectations (including RTO/RPO).

## Architecture Decisions

- Folder layout from phase 01 remains the structural baseline. Follow `architecture.md` for the intended system design.
- [0001 — Monorepo tooling foundation](../decisions/0001-monorepo-tooling-foundation.md): pnpm workspaces, Node.js 26 LTS, pnpm 12.16.1, shared TypeScript/ESLint/Prettier foundations, native workspace orchestration.
- [0002 — Shared contracts foundations](../decisions/0002-shared-contracts-foundations.md): Zod 4.6.7, ESM contracts package, opaque identifier bounds, timestamp/date transport, pagination limits, initial protocol versions `"1"`.

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
