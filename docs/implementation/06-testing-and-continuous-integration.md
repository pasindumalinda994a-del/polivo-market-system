# 06 — Testing and Continuous Integration

## Goal

Establish automated testing and GitHub Actions checks for the existing Polivo applications and shared contracts.

Verify the foundations already implemented:

- Shared runtime contracts.
- Fastify service construction and health endpoint.
- Next.js application startup.
- Electron application startup and security boundaries.

Build a testing structure that future phases can extend without requiring production credentials or live customer data.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect the existing applications, scripts, contracts, and validation checks.
4. Verify that phases 01–05 are complete.
5. Inspect any existing tests and GitHub Actions workflows before adding new ones.
6. Check current official documentation for the selected testing tools.

Preserve existing tooling and package boundaries.

Do not claim that existing implementation is correct merely because it builds.

## Testing Tools

Unless the repository already has compatible approved tools, use:

- Vitest for unit and service integration tests.
- Playwright for web end-to-end tests.
- Playwright’s Electron support for a focused desktop smoke test, after verifying compatibility with the selected Electron version.

Use stable versions compatible with the current Node.js and TypeScript toolchain.

Do not introduce overlapping test frameworks.

Keep dependencies in the workspace package that owns the tests, or at the root for repository-level suites.

## 1. Define Test Ownership

Use these boundaries:

### Package Unit Tests

Keep unit tests near the implementation they verify.

Initially cover `packages/contracts`.

Future domain tests will belong to `packages/domain`.

### Service Integration Tests

Use `tests/integration` for integration scenarios that exercise the stall-service application boundary.

Import the application factory through an explicit supported test entry point or the existing source boundary.

Do not import server startup code that binds a port as a side effect.

### Web End-to-End Tests

Use:

`tests/e2e/web`

### Desktop Smoke Tests

Use:

`tests/e2e/desktop`

### Shared Fixtures

Use:

`tests/fixtures`

Store synthetic data only.

### Performance Tests

Keep:

`tests/performance`

as the future location for phase 43.

Do not add placeholder performance tests that always pass.

Remove `.gitkeep` files only from directories that now contain real files.

## 2. Configure Vitest

Configure separate projects or clearly separated configurations for:

- Contracts unit tests.
- Service integration tests.

Requirements:

- Use the Node.js environment where browser APIs are unnecessary.
- Match test files explicitly.
- Exclude Playwright tests.
- Exclude generated output and dependencies.
- Resolve workspace packages consistently with the actual build strategy.
- Support a noninteractive CI run.
- Support local watch mode.
- Fail when a required suite unexpectedly contains no tests.

Do not configure future empty packages as mandatory test suites.

Do not add DOM simulation dependencies until component tests need them.

## 3. Test Shared Contracts

Convert or reuse phase 05’s meaningful validation smoke cases as automated tests.

Cover:

- Valid identifiers.
- Empty and oversized identifiers.
- Preservation of identifier values.
- Valid timestamps with timezone information.
- Rejection of ambiguous or invalid timestamps.
- Valid and invalid calendar dates, including leap-day boundaries.
- Pagination limits and intentional query-string conversion.
- Rejection of unexpected fields where strictness is required.
- Supported and unsupported protocol versions.
- Synchronization-envelope payload validation.
- Health-response validation.

### Error Sanitization

Verify that public validation errors expose only permitted fields.

Use synthetic rejected values to confirm that errors do not include:

- Passwords or tokens.
- Entire request bodies.
- Raw Zod error objects.
- Stack traces.
- Internal paths.

Assert observable behavior rather than copying schema implementation details into tests.

Avoid broad snapshots of error objects.

## 4. Test the Fastify Service Boundary

Use Fastify’s injection facilities to exercise the application without opening a real network port.

Cover:

- `GET /health` returns HTTP 200.
- The response matches the shared health contract.
- The response has the expected content type.
- An unknown route returns HTTP 404.
- Multiple application instances can be created and closed independently.
- Application construction does not start a network listener.

Always close each application instance during cleanup.

Do not assert the shared error format for routes that have not yet been integrated with that format.

### Configuration Validation

Test the configuration behavior implemented in phase 04:

- Valid development configuration.
- Invalid ports.
- Out-of-range ports.
- Other existing invalid configuration cases.

Avoid changing global process environment during parallel tests where possible.

If environment mutation is unavoidable, isolate it and restore the original values.

Do not connect to SQLite, Supabase, Clerk, or external services.

## 5. Configure Web End-to-End Testing

Create a Playwright configuration for the existing Next.js application.

Initially use Chromium only.

Requirements:

- Use a dedicated documented test port.
- Start and stop the application through Playwright’s server lifecycle.
- Test a production build in CI.
- Allow an explicitly documented local development workflow.
- Do not reuse an unrelated running server in CI.
- Use readiness checks rather than fixed sleeps.
- Keep timeouts and retries bounded.
- Capture useful diagnostics on failure.

### Initial Web Test

Verify that:

- The home page loads successfully.
- The Polivo heading is visible.
- The existing foundation content renders.
- No uncaught page error occurs during the scenario.

Use accessible locators where possible.

Do not introduce authentication mocks, dashboard scenarios, or business flows that do not exist.

Do not treat every browser console message as a test failure without considering its meaning.

## 6. Add an Electron Smoke Test

Create a focused smoke test against built desktop output.

Verify:

- Electron launches.
- The initial window appears.
- The Polivo foundation content renders.
- The renderer does not expose unrestricted Node.js globals or raw IPC.
- Relevant BrowserWindow preferences preserve context isolation and disabled Node integration.
- The application closes cleanly.

Use the selected Electron toolchain’s real built entry point.

Do not test only the Vite page in a normal browser and call that an Electron test.

### Execution Environment

Run the automated Electron smoke test on a compatible CI runner, preferably Windows to reflect the deployment target.

Verify tool support before configuring the job.

If automated Electron launch is unavailable in the current environment:

- Report the limitation.
- Provide a precise local verification command.
- Keep the test available for the supported CI environment.
- Do not replace it with a no-op or silently skip it.

This is a startup and security smoke test, not a Windows installer or hardware certification test.

## 7. Establish Fixture and Isolation Rules

Document and apply these rules:

- Use synthetic farmers, buyers, devices, tenants, and credentials.
- Keep fixtures small and deterministic.
- Do not copy production records into tests.
- Do not require network access for unit or service integration tests.
- Do not let tests share mutable global fixtures.
- Use temporary directories for future filesystem scenarios.
- Clean up test-owned files and processes.
- Never delete directories outside test-owned paths.

Do not create future financial fixtures with unapproved commission or payment assumptions.

## 8. Add Coverage Reporting

Enable coverage for the contracts and service code exercised by unit and integration tests.

Requirements:

- Exclude generated files and configuration-only files.
- Produce a readable local report and a CI-compatible report.
- Identify meaningful uncovered branches.
- Avoid excluding difficult code merely to improve percentages.

Do not impose an arbitrary repository-wide coverage target on applications that currently contain only scaffolding.

If a threshold is introduced, base it on the implemented critical code and document the reason.

Coverage does not replace behavioral assertions.

## 9. Add Root Test Commands

Provide working root commands such as:

| Command | Purpose |
| --- | --- |
| `pnpm test:unit` | Run package unit tests once. |
| `pnpm test:integration` | Run service integration tests once. |
| `pnpm test` | Run unit and integration suites. |
| `pnpm test:watch` | Watch the selected local Vitest suites. |
| `pnpm test:coverage` | Run supported suites with coverage. |
| `pnpm test:e2e:web` | Run web end-to-end tests. |
| `pnpm test:e2e:desktop` | Run the Electron smoke test. |

Keep the existing build, lint, formatting, and type-check commands working.

Extend `pnpm check` to include unit and service integration tests.

Keep browser and desktop suites as explicit commands because they require additional runtime setup.

Document build prerequisites or prepare them automatically.

Do not rely on stale contracts or application output.

## 10. Create GitHub Actions Checks

Create workflows under:

`.github/workflows`

Run checks for:

- Pull requests.
- Pushes to the actual default branch.
- Manual workflow dispatch where useful.

Inspect the repository before choosing the default branch name.

Use stable, understandable job names suitable for required checks.

### Quality and Build Job

Run:

1. Repository checkout.
2. Setup of the declared Node.js and pnpm versions.
3. Frozen-lockfile dependency installation.
4. Development-environment validation.
5. Formatting checks.
6. Linting.
7. Type-checking.
8. Unit and service integration tests.
9. Application builds.
10. Coverage reporting.

Use an ordering that works from a clean checkout.

### Web End-to-End Job

- Install dependencies using the frozen lockfile.
- Install the required Playwright browser and system dependencies.
- Build the required applications and packages.
- Run the web suite.
- Upload failure diagnostics where useful.

### Desktop Smoke Job

- Use a compatible Windows runner.
- Install dependencies using the frozen lockfile.
- Build the desktop application and required packages.
- Run the Electron smoke test.
- Upload useful failure diagnostics.

Each job must prepare its own dependencies and build outputs unless artifacts are explicitly transferred.

Do not assume jobs share a filesystem.

## 11. Secure and Stabilize CI

Apply these rules:

- Use minimal workflow permissions, normally `contents: read`.
- Do not require cloud or production secrets.
- Do not use `pull_request_target` to execute pull-request code.
- Use supported GitHub Actions releases and immutable references where practical.
- Cache package-manager downloads rather than blindly reusing `node_modules`.
- Key caches appropriately for the lockfile and environment.
- Add bounded job timeouts.
- Cancel superseded runs where appropriate.
- Keep reports and artifacts under a documented, short retention period.
- Avoid uploading environment files or sensitive diagnostics.
- Never use `continue-on-error` to hide a required failing suite.
- Report flaky tests rather than masking them with excessive retries.

Do not deploy applications or publish installers from these workflows.

Do not modify CodeRabbit permissions or account settings from repository code.

## 12. Document the Testing Workflow

Create:

`docs/operations/testing-and-ci.md`

Include:

- Test ownership and directory conventions.
- Commands and prerequisites.
- Browser installation instructions.
- Desktop smoke-test requirements.
- How to run one suite or one test.
- How to inspect failure reports.
- Fixture and cleanup rules.
- Coverage expectations.
- GitHub job names.
- Which checks should become required after their first successful run.
- What remains for later financial, offline, security, and performance testing.

Update local-development documentation with links to this guide.

Add generated reports, traces, screenshots, videos, and coverage output to `.gitignore` where needed.

Do not ignore test source files or committed synthetic fixtures.

## Verification

Run:

- `pnpm doctor`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm test:e2e:web`
- `pnpm test:e2e:desktop`, where supported
- `pnpm check`

Verify that:

- Tests fail when the behavior they protect is deliberately broken, using temporary changes that are reverted.
- Required suites do not silently pass with zero tests.
- Test processes and application servers are cleaned up.
- A clean installation and build work without local cached output.
- CI configuration uses the repository’s declared runtime versions.
- No real credentials or external services are required.

Inspect workflow syntax and all available execution results.

Do not claim GitHub Actions passed unless an actual run was observed.

Report local verification and remote CI status separately.

## Scope Limits

For this phase:

- Do not implement business features.
- Do not invent financial rules to create test data.
- Do not add database integrations.
- Do not configure cloud accounts.
- Do not implement authentication or synchronization.
- Do not implement the shared design system.
- Do not create performance claims from smoke tests.
- Do not package installers or test printer hardware.
- Do not deploy or publish anything.
- Do not commit or push automatically.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Testing tools and versions selected.
- Suites implemented.
- Root commands added.
- CI workflows and job names.
- Local verification results.
- Actual GitHub Actions status, if available.
- Remaining manual setup or platform verification.
- Phase 07, `07-brand-design-system-and-app-shells.md`, as the next step.

Preserve the existing tracker format.

Do not mark remote CI verification complete based only on local results.

## Completion Report

Provide:

1. Test suites and workflows created.
2. Commands now available.
3. Local test and build results.
4. Actual remote CI status or confirmation that it has not run.
5. Remaining manual GitHub settings and desktop checks.
6. Any blockers.
7. Whether phase 07 can begin.