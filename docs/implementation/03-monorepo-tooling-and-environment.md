# 03 — Monorepo Tooling and Environment

## Goal

Configure the existing Polivo repository as a TypeScript monorepo with consistent dependency management, code-quality tools, environment validation, and development commands.

Do not initialize the applications or implement business features yet.

## Before Starting

1. Read root `AGENTS.md` and the six files under `docs/context`.
2. Read `docs/context/progress-tracker.md`.
3. Inspect existing package manifests, lockfiles, configuration files, and scripts.
4. Verify that phases 01 and 02 are complete.
5. Preserve existing work and follow established project decisions.

If the repository already uses a package manager or tooling configuration, inspect it before making changes. Do not silently replace an established setup.

## Tooling Decisions

For a repository without existing tooling, use:

- pnpm workspaces for dependency management.
- TypeScript for application and shared-package code.
- ESLint for code-quality checks.
- Prettier for formatting.

Use pnpm workspace commands for orchestration initially. Do not add Turborepo, Nx, or another build orchestrator in this phase.

Before installing tools:

- Check current official documentation for supported configuration.
- Select mutually compatible stable versions.
- Select an active Node.js LTS release compatible with the planned application stack.
- Record the selected versions and rationale.
- Avoid preview, canary, and deprecated packages.

Do not assume that the newest major versions of every tool work together.

## 1. Configure the Workspace

Create or update `pnpm-workspace.yaml` to include:

- `apps/*`
- `packages/*`

Create or update the root `package.json`.

Requirements:

- Name: `polivo-market-system`.
- Mark the root package as private.
- Record the exact pnpm version in `packageManager`.
- Declare the supported Node.js version range in `engines`.
- Keep application runtime dependencies out of the root package.
- Use the root for shared development tooling.

Create one root `pnpm-lock.yaml` through the package manager.

Do not create nested lockfiles.

If conflicting lockfiles already exist, identify their origin before changing them.

## 2. Establish Workspace Package Identities

Create minimal private `package.json` files where missing.

Use these names:

| Directory | Package name |
| --- | --- |
| `apps/web` | `@polivo/web` |
| `apps/desktop` | `@polivo/desktop` |
| `apps/stall-service` | `@polivo/stall-service` |
| `packages/domain` | `@polivo/domain` |
| `packages/contracts` | `@polivo/contracts` |
| `packages/ui` | `@polivo/ui` |
| `packages/db-local` | `@polivo/db-local` |
| `packages/db-cloud` | `@polivo/db-cloud` |

For these placeholder manifests:

- Set `private: true`.
- Use a consistent initial private version.
- Do not add application frameworks.
- Do not add fake build, development, or test scripts.
- Do not declare entry points or exports for files that do not exist.
- Do not add workspace dependencies until they are actually needed.

Use `workspace:*` for internal dependencies when introduced later.

Remove `.gitkeep` from directories that now contain real files.

## 3. Pin and Document the Development Runtime

Add an appropriate Node.js version file, such as `.node-version`.

Keep it consistent with the root `engines` declaration.

Create `docs/operations/local-development.md` covering:

- Required Node.js and pnpm versions.
- How to verify installed versions.
- How to install repository dependencies.
- Which commands currently work.
- Which application commands become available after phase 04.
- The rule that commands run from the repository root unless stated otherwise.

Keep instructions suitable for Windows development.

Do not require Bash-only commands, global application-framework installations, or Unix-specific environment-variable syntax.

If the environment lacks a required tool, report the exact prerequisite instead of silently switching package managers.

## 4. Configure Shared TypeScript Defaults

Create `tsconfig.base.json`.

Include shared correctness settings such as:

- Strict type checking.
- Consistent filename casing.
- Safe handling of unchecked indexed access.
- Appropriate interoperability settings for the selected toolchain.

Keep runtime-specific configuration out of the shared base.

Do not globally impose:

- Browser DOM libraries on server packages.
- Node.js globals on browser packages.
- One module-resolution strategy across all applications.
- JSX settings on packages that do not use React.
- Application-specific path aliases.

Next.js, Vite, Electron, and the stall service will receive compatible application configurations in phase 04.

Do not create application TypeScript configurations that fail because source files do not exist yet.

## 5. Configure ESLint

Install the compatible ESLint and TypeScript linting dependencies needed for this phase.

Create a root flat configuration using the format supported by the selected ESLint version.

Requirements:

- Cover JavaScript and TypeScript source files.
- Apply browser and Node.js globals only where appropriate.
- Exclude build output, generated files, dependencies, coverage, and runtime data.
- Keep formatting responsibilities with Prettier.
- Avoid type-aware rules that require application TypeScript projects before those projects exist.

Framework-specific lint rules will be added when the applications are initialized.

Ensure the current repository can be linted without failing merely because application source files have not been created.

Do not disable meaningful rules simply to obtain a passing result.

## 6. Configure Prettier and Editor Defaults

Create:

- A root Prettier configuration.
- `.prettierignore`.
- `.editorconfig`.

Use consistent settings for:

- UTF-8 encoding.
- Indentation.
- Line endings.
- Final newlines.
- Trailing whitespace.

Preserve intentional Markdown line-break formatting.

Exclude generated files, lockfiles where appropriate, dependency directories, and build artifacts from formatting.

Do not reformat all existing context documents without reviewing the resulting changes.

## 7. Configure Repository Ignore Rules

Create or update `.gitignore`.

Cover:

- `node_modules`.
- Next.js, Vite, Electron, and service build output.
- Packaged desktop installers and release output.
- Test coverage and temporary test artifacts.
- TypeScript incremental build files.
- Local environment files.
- Runtime SQLite files and their WAL/shared-memory companions.
- Runtime logs.
- Local backups and diagnostic exports.
- Private signing keys and certificate containers.
- Operating-system temporary files.

Allow sanitized `.env.example` files to be tracked.

Keep ignore patterns targeted. Do not hide legitimate source files, SQL migrations, documentation, or synthetic fixtures.

If sensitive files are already tracked, report their paths without printing their contents. Adding an ignore rule does not remove tracked secrets from Git history.

## 8. Establish Environment Configuration Conventions

Create `docs/operations/environment-configuration.md`.

Document these boundaries:

### Web Application

- Public browser configuration must be explicitly designated.
- Server credentials must remain server-only.
- Privileged Supabase credentials must never be exposed through public variables.
- Clerk public and secret configuration must remain separate.

### Desktop Application

- Renderer configuration must contain no privileged credentials.
- Vite-exposed values are visible in the built application.
- Provisioned device credentials belong in secure runtime storage.
- Do not embed cloud service credentials into the desktop application.

### Stall Service

- Service configuration is server-side.
- Runtime database, backup, and log paths belong outside the repository.
- Device credentials are created through provisioning, not committed in environment files.
- Missing required configuration must produce a clear startup error.

### General Rules

- Validate configuration at the boundary where it is used.
- Never log secret values.
- Use separate development, staging, and production configuration.
- Do not require production credentials for local tooling.
- Document new variables when the corresponding integration is implemented.

Do not invent Clerk, Supabase, or hosting environment-variable names before their integrations are configured.

## 9. Add Development Environment Validation

Create a small cross-platform Node.js script under `scripts` to check the development environment.

It should:

- Verify the running Node.js version against the repository requirement.
- Verify the expected pnpm version.
- Confirm that workspace configuration exists.
- Report actionable errors.
- Exit with a nonzero status when a required check fails.
- Avoid printing environment variables or secret values.

Use Node.js APIs rather than Unix-specific shell commands.

This script validates development prerequisites only.

Application environment schemas and production configuration validation will be implemented as their integrations are added.

## 10. Add Root Commands

Provide working root scripts for:

| Command | Purpose |
| --- | --- |
| `pnpm doctor` | Validate local development prerequisites. |
| `pnpm lint` | Run the current ESLint checks. |
| `pnpm format` | Format supported repository files. |
| `pnpm format:check` | Check formatting without modifying files. |
| `pnpm check` | Run the checks actually available in this phase. |

Use cross-platform command syntax.

Do not create placeholder commands that print success without performing work.

Document these planned commands for phase 04:

- `pnpm dev:web`
- `pnpm dev:desktop`
- `pnpm dev:service`
- `pnpm build`
- `pnpm typecheck`

Do not wire them to nonexistent application scripts yet.

Test execution will be configured in phase 06.

## 11. Record Tooling Decisions

Create a concise accepted decision record under `docs/decisions`, following the existing numbering and format.

Record:

- pnpm workspaces.
- Selected Node.js and pnpm versions.
- Shared TypeScript, ESLint, and Prettier foundations.
- Native workspace commands for initial orchestration.
- Runtime-specific configuration remaining with each application.

Update the progress tracker with:

- Work completed.
- Versions selected.
- Verification results.
- Any environment limitations.
- Phase 04 as the next step.

Do not mark application setup or testing infrastructure complete.

## Scope Limits

For this phase:

- Do not initialize Next.js, Electron, React, Vite, or Fastify.
- Do not implement application screens or APIs.
- Do not install database drivers.
- Do not create database schemas or migrations.
- Do not configure Clerk, Supabase, or Vercel accounts.
- Do not create real environment files or credentials.
- Do not implement business rules.
- Do not configure GitHub Actions yet.
- Do not add Git hooks or additional build orchestration.
- Do not commit or push automatically.

## Check When Done

Verify that:

- pnpm recognizes all eight workspace packages.
- Package names are unique and packages are private.
- Node.js and pnpm version declarations are consistent.
- Exactly one intended workspace lockfile exists.
- Dependency installation succeeds.
- A frozen-lockfile installation succeeds without modifying the lockfile.
- `pnpm doctor` passes.
- `pnpm lint` passes for the files currently present.
- `pnpm format:check` passes for the intended files.
- `pnpm check` runs real checks successfully.
- No application frameworks or business features were added.
- No credentials, runtime databases, or generated artifacts are tracked.

Review `git diff` and `git status --short`.

Do not claim that application builds or tests pass; those applications and tests do not exist yet.

If a check cannot run, report the command, reason, and remaining action.

## Completion Report

Provide:

1. Files created or updated.
2. Selected tooling versions.
3. Commands now available.
4. Checks performed and their results.
5. Any blockers or manual prerequisites.
6. Whether phase 04, `04-web-desktop-and-service-bootstrap.md`, can begin.