# Testing and Continuous Integration

This guide describes how automated tests and GitHub Actions checks are organized for Polivo. It covers the suites added through phases 06–11 (contracts, domain, local database, cloud isolation, stall-service integration, and app e2e smoke).

## Test ownership

| Location                                | Owner                              | Purpose                                                               |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `packages/contracts/src/**/*.test.ts`   | `@polivo/contracts`                | Unit tests for shared schemas and validation helpers                  |
| `packages/domain/src/**/*.test.ts`      | `@polivo/domain`                   | Unit tests for confirmed financial calculations                       |
| `packages/db-local/src/**/*.test.ts`    | `@polivo/db-local`                 | Unit tests for SQLite connection, migrations, and repositories        |
| `packages/db-cloud/src/**/*.test.ts`    | `@polivo/db-cloud`                 | Unit tests for config, client factory, and exact numeric adapters     |
| `packages/db-cloud/src/test/isolation/` | `@polivo/db-cloud`                 | Postgres RLS isolation suite (`pnpm test:db-cloud`)                   |
| `tests/integration/`                    | Stall-service application boundary | Fastify inject, configuration, and local data-access foundation tests |
| `tests/e2e/web/`                        | Web application                    | Playwright Chromium end-to-end smoke                                  |
| `tests/e2e/desktop/`                    | Desktop application                | Playwright Electron startup and security smoke                        |
| `tests/fixtures/`                       | Shared synthetic data              | Deterministic non-production fixtures only                            |
| `tests/performance/`                    | Future (phase 43)                  | Reserved; no placeholder always-pass tests                            |

## Tooling

| Tool                  | Version  | Role                                                                       |
| --------------------- | -------- | -------------------------------------------------------------------------- |
| Vitest                | `5.0.5`  | Unit and service integration tests                                         |
| `@vitest/coverage-v8` | `5.0.5`  | Coverage for contracts, domain, db-local, and exercised stall-service code |
| Playwright            | `1.64.1` | Web end-to-end and Electron desktop smoke                                  |
| Electron              | `45.1.0` | Desktop runtime under test (package dependency)                            |

Node.js and pnpm must match `.node-version` and `package.json` (`>=26.13.0 <27`, pnpm `12.16.1`).

## Commands

Run from the repository root.

| Command                 | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm test:unit`        | Run contracts, domain, db-local, and db-cloud unit tests once     |
| `pnpm test:integration` | Run stall-service integration tests once                          |
| `pnpm test`             | Run unit and integration suites                                   |
| `pnpm test:watch`       | Watch the Vitest unit and integration suites                      |
| `pnpm test:coverage`    | Run unit and integration suites with coverage                     |
| `pnpm test:db-cloud`    | Apply `supabase/migrations` on disposable Postgres; run RLS suite |
| `pnpm test:e2e:web`     | Build web and workspace deps (`@polivo/web...`), then Playwright  |
| `pnpm test:e2e:desktop` | Build desktop and workspace deps, then Electron smoke             |
| `pnpm check`            | Doctor, lint, format check, typecheck, then `pnpm test`           |

Existing build, lint, and formatting commands remain unchanged. `pnpm check` includes unit and integration tests (not `test:db-cloud`). `pnpm typecheck` builds shared packages first (including `@polivo/db-cloud`), type-checks each application package, then type-checks Vitest unit and integration sources via root `tsconfig.test.json`.

Browser, desktop, and cloud isolation suites stay explicit because they need Playwright browsers, built application output, or a disposable Postgres.

### Prerequisites

- Unit and integration tests do not require network access, cloud credentials, or a listening server.
- `pnpm test:db-cloud` uses local Supabase when Docker is available, otherwise embedded Postgres. It never uses production credentials. See [cloud-database-and-tenant-isolation.md](./cloud-database-and-tenant-isolation.md).
- `pnpm test:e2e:web` builds `@polivo/web` and starts a production Next.js server on dedicated port **3100**.
- `pnpm test:e2e:desktop` builds `@polivo/desktop` and launches Electron against `apps/desktop/out/main/index.js`.
- Contracts consumers that resolve package exports still need `pnpm --filter @polivo/contracts build` before compiled application runs; Vitest and `tsconfig.test.json` alias contracts source for integration tests.

## Browser installation

Install the Chromium browser used by Playwright once per machine (or after Playwright upgrades):

```powershell
pnpm exec playwright install chromium
```

On Linux CI runners, use:

```powershell
pnpm exec playwright install chromium --with-deps
```

## Desktop smoke-test requirements

- Build output must exist under `apps/desktop/out/`.
- The smoke test launches the real Electron binary from `@polivo/desktop` with the built main entry.
- Prefer running the automated desktop suite on Windows, matching the deployment target.
- Local verification command:

```powershell
pnpm test:e2e:desktop
```

This is a startup and security smoke test, not an installer or hardware certification test.

## Running one suite or one test

```powershell
pnpm test:unit
pnpm test:integration
pnpm exec vitest run --project contracts packages/contracts/src/primitives.test.ts
pnpm exec vitest run --project integration tests/integration/stall-service.app.test.ts
pnpm exec playwright test --config=tests/e2e/web/playwright.config.ts home.spec.ts
pnpm exec playwright test --config=tests/e2e/desktop/playwright.config.ts electron.smoke.spec.ts
```

## Local web development workflow

The default web e2e command uses a production build on port **3100**.

For intentional debugging against a development server, start the web app yourself and set `PW_TEST_BASE_URL` to that origin. Do not point CI at an unrelated already-running server; CI always prepares its own build and server lifecycle.

## Failure reports

| Artifact                   | Location                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| Vitest coverage            | `coverage/` (text summary in the terminal; HTML and LCOV under `coverage/`) |
| Playwright web results     | `test-results/web/`, `playwright-report/web/`                               |
| Playwright desktop results | `test-results/desktop/`, `playwright-report/desktop/`                       |

Open an HTML Playwright report with:

```powershell
pnpm exec playwright show-report playwright-report/web
pnpm exec playwright show-report playwright-report/desktop
```

These generated reports are gitignored.

## Fixture and cleanup rules

- Use synthetic farmers, buyers, devices, tenants, and credentials only.
- Keep fixtures small and deterministic under `tests/fixtures/`.
- Do not copy production records into tests.
- Do not require network access for unit or service integration tests.
- Do not share mutable global fixtures across suites.
- Use temporary directories for filesystem scenarios; clean up test-owned files and processes.
- Never delete directories outside test-owned paths.
- Do not invent financial fixtures with unapproved commission or payment assumptions.

## Coverage expectations

Coverage currently targets (configured per Vitest project):

- `packages/contracts/src/**/*.ts` (excluding colocated tests and the barrel file)
- `packages/domain/src/**/*.ts` (excluding colocated tests)
- `packages/db-local/src/**/*.ts` (excluding colocated tests, barrel, and CLI)
- `packages/db-cloud/src/**/*.ts` (excluding colocated tests, barrel, types entry, and isolation helpers)
- `apps/stall-service/src/app.ts`
- `apps/stall-service/src/config.ts`

There is no repository-wide coverage percentage gate for scaffolding-only applications. Coverage complements behavioral assertions; it does not replace them. Do not exclude difficult code merely to improve percentages.

## GitHub Actions

Workflow file: `.github/workflows/ci.yml`

Triggers: pull requests, pushes to `main`, and `workflow_dispatch`.

| Job name            | Runner           | What it runs                                                                      |
| ------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `quality-and-build` | `ubuntu-latest`  | Doctor, format check, lint, typecheck, unit/integration with coverage, full build |
| `db-cloud`          | `ubuntu-latest`  | Cloud migration + RLS isolation suite (`pnpm test:db-cloud`)                      |
| `web-e2e`           | `ubuntu-latest`  | Playwright Chromium against the production web build                              |
| `desktop-smoke`     | `windows-latest` | Electron smoke against built desktop output                                       |

Permissions are `contents: read`. Jobs do not use production secrets, do not deploy, and do not publish installers. Failure diagnostics retain for 7 days.

### Required checks after the first successful run

After these jobs have succeeded at least once on the default branch, mark the following GitHub required status checks:

1. `quality-and-build`
2. `db-cloud`
3. `web-e2e`
4. `desktop-smoke`

Do not mark checks required before their first successful observed run.

## What remains for later phases

- Offline credential, authorization, and synchronization suites (phases 14–15 and sync workers)
- Broader security and recovery scenarios
- Performance tests under `tests/performance/` (phase 43)
- Installer packaging and printer hardware certification
- Authenticated dashboard and full billing end-to-end flows

## Related guides

- `local-development.md` — day-to-day application commands
- `environment-configuration.md` — local environment variables
- `contracts-and-validation.md` — shared contract package usage
- `local-data-access-and-transactions.md` — transaction, idempotency, and repository foundations
- `local-database-and-migrations.md` — SQLite ownership and migrations
- `cloud-database-and-tenant-isolation.md` — Supabase migrations, RLS, and `test:db-cloud`
