# Local Development

This guide covers running the Polivo applications after phase 04. Run commands from the repository root unless noted otherwise. Instructions are written for Windows PowerShell and also work in other shells that provide the same commands.

## Required versions

| Tool    | Requirement                | Declared in                                    |
| ------- | -------------------------- | ---------------------------------------------- |
| Node.js | `>=26.13.0 <27` (LTS 26.x) | `package.json` `engines.node`, `.node-version` |
| pnpm    | `12.16.1`                  | `package.json` `packageManager`                |

Do not install Next.js, Electron, Vite, or Fastify globally for this repository. Application dependencies are installed through the workspace.

## Verify installed versions

```powershell
node --version
pnpm --version
```

Expected:

- Node.js reports a 26.x version that satisfies `>=26.13.0 <27`.
- pnpm reports `12.16.1`.

If Node.js is missing or too old, install the Active LTS release that matches `.node-version` (`26.13.0`) from [nodejs.org](https://nodejs.org/) or your usual version manager, then reopen the terminal.

If pnpm is missing or the wrong version, prefer Corepack when it is included with your Node.js install:

```powershell
corepack enable
corepack prepare pnpm@12.16.1 --activate
pnpm --version
```

If `corepack` is not available after installing Node.js, install the pinned pnpm release with the official standalone installer or `npm install -g pnpm@12.16.1`, then confirm `pnpm --version` reports `12.16.1`.

Do not switch to npm or Yarn as the repository package manager.

## Install dependencies

From the repository root:

```powershell
pnpm install
```

This creates a single root `pnpm-lock.yaml`. Nested lockfiles are not used.

To confirm the lockfile is complete:

```powershell
pnpm install --frozen-lockfile
```

Validate the development environment:

```powershell
pnpm run doctor
```

Use `pnpm run doctor` for the repository check. Bare `pnpm doctor` runs pnpm’s built-in diagnostics instead of this repository script.

## Development ports

| Application           | Host / URL                      | Port |
| --------------------- | ------------------------------- | ---- |
| Web (`@polivo/web`)   | `http://localhost:3000`         | 3000 |
| Desktop Vite renderer | used by Electron in development | 5173 |
| Stall service         | `http://127.0.0.1:3040`         | 3040 |

The stall service binds to loopback only by default (`127.0.0.1`).

## Start each application

The three applications currently run independently. Desktop-to-service communication is implemented in phase 16. The stall service now opens a local SQLite database; cloud sync is not connected yet.

Run each development command in a separate terminal:

```powershell
pnpm dev:contracts
pnpm dev:domain
pnpm dev:db-local
pnpm dev:ui
pnpm dev:web
pnpm dev:desktop
pnpm dev:service
```

Shared packages `@polivo/contracts`, `@polivo/domain`, `@polivo/db-local`, and `@polivo/ui` must be built (or watched) before dependent applications resolve their compiled exports. See `contracts-and-validation.md`, `local-database-and-migrations.md`, `local-data-access-and-transactions.md`, and `design-system.md`.

### Web application

1. Run `pnpm dev:web`.
2. Open `http://localhost:3000` in a browser.
3. Confirm the public page shows **Polivo** and **Web application foundation**.
4. Open `http://localhost:3000/dashboard` for the dashboard shell.
5. Open `http://localhost:3000/dev/ui` for the development-only component preview (unavailable in production builds).

Stop the process with `Ctrl+C` in that terminal.

### Desktop application

1. Run `pnpm dev:desktop`.
2. Electron launches a window that loads the Vite renderer.
3. Confirm the window shows the desktop shell, including **Service connection not configured**.

Stop the process with `Ctrl+C` in that terminal. Closing the window on Windows also exits the Electron process.

`pnpm --filter @polivo/desktop build` produces runnable output under `apps/desktop/out/`. That build output is not a Windows installer. Packaging installers is outside this phase. Preview the built application with:

```powershell
pnpm --filter @polivo/desktop preview
```

### Stall service

1. Build the local database package and create a development database **outside the repository**:

```powershell
pnpm --filter @polivo/db-local build
$env:POLIVO_LOCAL_DB_PATH = "$env:LOCALAPPDATA\Polivo\dev\stall.sqlite"
pnpm --filter @polivo/db-local db:init
```

2. Copy `apps/stall-service/.env.example` to `apps/stall-service/.env` and set the same absolute `POLIVO_LOCAL_DB_PATH` (plus optional `HOST` / `PORT`). See `environment-configuration.md` and `local-database-and-migrations.md`.
3. Run `pnpm dev:service` (requires `@polivo/db-local` and `@polivo/contracts` builds).
4. Request the health endpoint:

```powershell
Invoke-RestMethod http://127.0.0.1:3040/health
```

Expected response:

```json
{
  "service": "polivo-stall-service",
  "status": "ok"
}
```

`/health` is process health only; it does not assert schema readiness, provisioning, or sync.

Stop the process with `Ctrl+C` in that terminal. Startup fails clearly if the database path is missing, unreadable, or schema-incompatible. Use `db:migrate` / `db:status` for explicit maintenance — the service does not auto-migrate on start.

## Shared contracts package

`@polivo/contracts` publishes compiled JavaScript and declaration files under `packages/contracts/dist/`. That output is not committed.

```powershell
pnpm --filter @polivo/contracts build
pnpm dev:contracts
```

Use `pnpm build` from the repository root to build contracts before the applications. While editing schemas, keep `pnpm dev:contracts` running so `dist/` stays current. Restart the compiled stall service after contract output changes; `pnpm dev:service` still resolves `@polivo/contracts` from the built package exports, so rebuild or watch contracts when those schemas change. Details are in `contracts-and-validation.md`.

## Shared domain package

`@polivo/domain` publishes pure financial calculation helpers under `packages/domain/dist/`. That output is not committed. Confirmed rules are recorded in `docs/decisions/0003-confirmed-financial-rules.md`.

```powershell
pnpm --filter @polivo/domain build
pnpm dev:domain
```

Root `pnpm build` and `pnpm typecheck` build `@polivo/domain` after contracts. Domain unit tests run through `pnpm test` (Vitest project `domain`).

## Shared UI package

`@polivo/ui` publishes compiled JavaScript under `packages/ui/dist/` and a public CSS entry at `@polivo/ui/styles.css`. Build output is not committed. Design-system usage is documented in `design-system.md`.

```powershell
pnpm --filter @polivo/ui build
pnpm dev:ui
```

Root `pnpm build` and `pnpm typecheck` build `@polivo/ui` before web and desktop. `@polivo/web` `build` also runs `@polivo/ui` first (required for clean CI/Vercel checkouts). Keep `pnpm dev:ui` running while editing shared components so `dist/` stays current during local `dev`.

## Build and start the compiled stall service

```powershell
pnpm --filter @polivo/contracts build
pnpm --filter @polivo/stall-service build
pnpm --filter @polivo/stall-service start
```

Then request `http://127.0.0.1:3040/health` again. Stop with `Ctrl+C`.

## Quality commands

| Command                                 | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `pnpm run doctor`                       | Validate Node.js, pnpm, and workspace prerequisites.            |
| `pnpm lint`                             | Run ESLint across the repository.                               |
| `pnpm format`                           | Format supported files with Prettier.                           |
| `pnpm format:check`                     | Check formatting without writing changes.                       |
| `pnpm typecheck`                        | Type-check contracts, UI, web, desktop, and stall-service.      |
| `pnpm build`                            | Build contracts and UI, then web, desktop, and stall-service.   |
| `pnpm test`                             | Run contracts unit tests and stall-service integration tests.   |
| `pnpm test:coverage`                    | Run unit and integration tests with coverage.                   |
| `pnpm test:e2e:web`                     | Build the web app and run Playwright Chromium end-to-end tests. |
| `pnpm test:e2e:desktop`                 | Build the desktop app and run the Electron smoke test.          |
| `pnpm check`                            | Run doctor, lint, format check, typecheck, and `pnpm test`.     |
| `pnpm --filter @polivo/contracts smoke` | Run the contracts validation smoke check (requires build).      |

Automated testing details, fixture rules, coverage expectations, and GitHub Actions job names are documented in `testing-and-ci.md`.

## Workspace layout reminder

- `apps/*` and `packages/*` are pnpm workspace packages.
- Shared development tooling lives at the repository root.
- Application runtime dependencies belong in the package that uses them, not in the root package.
