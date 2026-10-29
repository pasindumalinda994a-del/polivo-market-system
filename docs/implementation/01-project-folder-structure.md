# 01 — Project Folder Structure

## Goal

Create the initial folder structure for the Polivo Market System inside the existing repository.

This phase creates directories and placeholder files only. Do not install dependencies, initialize applications, or implement features yet.

## Before Starting

1. Inspect the repository and its existing files.
2. Read `AGENTS.md` and any existing project context files if available.
3. Preserve existing work. Merge this structure into the repository without overwriting or deleting files.
4. If an existing structure conflicts with this plan, report the conflict before moving or renaming anything.

## Architecture

Polivo is a multi-tenant, offline-first market stall management system.

- **Web:** Next.js for online account management, onboarding, and initially read-only financial reporting.
- **Desktop:** Electron + React + Vite for fast, keyboard-based billing.
- **Stall service:** Fastify for local authentication, business operations, database access, and background synchronization.
- **Local database:** One authoritative SQLite database per stall, managed exclusively by the stall service.
- **Cloud database:** Supabase PostgreSQL for synchronized data and remote reporting.
- **Online authentication:** Clerk.
- **Offline authentication:** Local staff sessions and provisioned device credentials.

Multiple desktop terminals connect to the same stall service over the LAN. They must not access SQLite directly or maintain independent financial databases.

## Create the Folder Structure

Create the following directories relative to the repository root:

    apps/
      web/
      desktop/
      stall-service/

    packages/
      domain/
      contracts/
      ui/
      db-local/
      db-cloud/

    docs/
      context/
      implementation/
      decisions/
      operations/

    tests/
      integration/
      e2e/
      performance/
      fixtures/

    scripts/

    .github/
      workflows/

Add a `.gitkeep` file to each empty leaf directory so Git tracks it.

Do not add `.gitkeep` files to directories that already contain tracked files.

## Folder Responsibilities

### `apps/web`

The Next.js application.

Responsible for:

- Online sign-in and account flows.
- Stall onboarding and authorized administration.
- Read-only views of synchronized financial data.
- Reports and exports.
- Product website and desktop download area.

It must not directly connect to a stall’s local SQLite database.

### `apps/desktop`

The Electron + React + Vite application.

Responsible for:

- Keyboard-first billing screens.
- Farmer, buyer, and vegetable management interfaces.
- Payment and account screens.
- Local report interfaces.
- Printer integration.
- Connection to the stall service.

The renderer must not access SQLite, cloud service credentials, or unrestricted Node.js APIs.

Electron main-process, preload, and renderer folders will be created during application initialization.

### `apps/stall-service`

The Fastify application running on the stall’s designated host computer.

Responsible for:

- Local staff authentication and authorization.
- Authorized LAN terminal access.
- Business commands and validation.
- Local database transactions.
- Background cloud synchronization.
- Backup and recovery operations.

This service is the only application allowed to open the stall’s SQLite database.

### `packages/domain`

Shared business rules that do not depend on a specific application framework.

Examples:

- Money and weight calculations.
- Commission calculations.
- Billing rules.
- Payment allocation rules.
- Financial invariants.

Keep this package independent of React, Electron, Fastify, Clerk, and database clients.

### `packages/contracts`

Shared communication contracts.

Examples:

- Request and response schemas.
- API data types.
- Synchronization event schemas.
- Shared error formats.

Do not store secrets or database connections here.

### `packages/ui`

Reusable React UI components and design tokens shared by the web and desktop applications where appropriate.

Keep application-specific routing, authentication, and business operations outside this package.

### `packages/db-local`

SQLite-specific persistence code.

Will contain:

- Local schema definitions.
- Versioned migrations.
- Connection configuration.
- Persistence helpers.

Only the stall service may use this package at runtime.

Do not place actual SQLite database files here.

### `packages/db-cloud`

Supabase PostgreSQL persistence and migration code.

Will contain:

- Cloud schema definitions.
- Versioned migrations.
- Tenant-isolation policies.
- Server-side persistence helpers.

Privileged database access must remain server-side.

### `docs/context`

The six shared project context files:

- `project-overview.md`
- `architecture.md`
- `code-standards.md`
- `ui-context.md`
- `ai-workflow-rules.md`
- `progress-tracker.md`

Preserve these files if they already exist.

If they are missing, leave this directory as a placeholder. They will be added in the next phase.

Do not invent their contents.

### `docs/implementation`

The numbered Cursor implementation guides.

### `docs/decisions`

Architecture and business-rule decision records, including unresolved questions and their eventual resolutions.

### `docs/operations`

Installation, deployment, backup, recovery, update, and support documentation.

### `tests/integration`

Tests covering interactions between services, persistence, and business operations.

### `tests/e2e`

Tests covering complete user workflows.

### `tests/performance`

Billing-speed, concurrency, and synchronization-load tests.

### `tests/fixtures`

Synthetic test data only.

Do not include real customer records, credentials, or production database copies.

### `scripts`

Repository maintenance, development, and release utilities.

### `.github/workflows`

GitHub Actions workflows, to be implemented in a later phase.

## Runtime Data Rule

Application data must live outside the source repository in an appropriate operating-system application-data location.

Do not create repository folders for:

- Live SQLite databases.
- SQLite WAL or shared-memory files.
- Customer backups.
- Runtime logs.
- Device credentials.
- Production exports.

The exact runtime locations will be configured in later phases.

## Scope Limits

For this phase:

- Do not run application generators.
- Do not install packages.
- Do not create `package.json` files or lockfiles.
- Do not select package versions.
- Do not configure workspace tooling.
- Do not create environment files.
- Do not initialize databases or create migrations.
- Do not implement UI components, APIs, authentication, or synchronization.
- Do not create a new Git repository or nested repositories.
- Do not commit or push automatically.

Application scaffolding and tooling belong to later phases.

## Check When Done

Verify that:

- All required directories exist.
- Existing files remain intact.
- Empty leaf directories contain `.gitkeep`.
- No dependencies or application code were added.
- No runtime data or credentials were added.
- No nested Git repositories were created.

Review `git status --short` to confirm the changes are limited to the intended structure.

No build or test run is required because this phase adds no executable code.

If `docs/context/progress-tracker.md` already exists, update it using its current format to record completion of this phase. Otherwise, leave its creation for phase 02.

## Completion Report

Provide:

1. A concise summary of the directories created.
2. Any existing files or structure preserved.
3. Any conflicts or blockers found.
4. Confirmation that the repository is ready for `02-project-context-and-cursor-rules.md`.
