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

The three applications currently run independently. Desktop-to-service communication is implemented in phase 16. No database or cloud service is connected yet.

Run each development command in a separate terminal:

```powershell
pnpm dev:contracts
pnpm dev:web
pnpm dev:desktop
pnpm dev:service
```

Shared package `@polivo/contracts` must be built (or watched with `pnpm dev:contracts`) before dependent applications resolve its compiled exports. See `contracts-and-validation.md`.

### Web application

1. Run `pnpm dev:web`.
2. Open `http://localhost:3000` in a browser.
3. Confirm the page shows **Polivo** and **Web application foundation**.

Stop the process with `Ctrl+C` in that terminal.

### Desktop application

1. Run `pnpm dev:desktop`.
2. Electron launches a window that loads the Vite renderer.
3. Confirm the window shows **Polivo** and **Desktop application foundation**.

Stop the process with `Ctrl+C` in that terminal. Closing the window on Windows also exits the Electron process.

`pnpm --filter @polivo/desktop build` produces runnable output under `apps/desktop/out/`. That build output is not a Windows installer. Packaging installers is outside this phase. Preview the built application with:

```powershell
pnpm --filter @polivo/desktop preview
```

### Stall service

1. Run `pnpm dev:service`.
2. Request the health endpoint:

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

Stop the process with `Ctrl+C` in that terminal.

Optional local overrides use `apps/stall-service/.env`. Copy `apps/stall-service/.env.example` and adjust `HOST` / `PORT` as documented in `environment-configuration.md`.

## Shared contracts package

`@polivo/contracts` publishes compiled JavaScript and declaration files under `packages/contracts/dist/`. That output is not committed.

```powershell
pnpm --filter @polivo/contracts build
pnpm dev:contracts
```

Use `pnpm build` from the repository root to build contracts before the applications. While editing schemas, keep `pnpm dev:contracts` running so `dist/` stays current. Restart the compiled stall service after contract output changes; `pnpm dev:service` still resolves `@polivo/contracts` from the built package exports, so rebuild or watch contracts when those schemas change. Details are in `contracts-and-validation.md`.

## Build and start the compiled stall service

```powershell
pnpm --filter @polivo/contracts build
pnpm --filter @polivo/stall-service build
pnpm --filter @polivo/stall-service start
```

Then request `http://127.0.0.1:3040/health` again. Stop with `Ctrl+C`.

## Quality commands

| Command                                 | Purpose                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `pnpm run doctor`                       | Validate Node.js, pnpm, and workspace prerequisites.       |
| `pnpm lint`                             | Run ESLint across the repository.                          |
| `pnpm format`                           | Format supported files with Prettier.                      |
| `pnpm format:check`                     | Check formatting without writing changes.                  |
| `pnpm typecheck`                        | Type-check contracts, web, desktop, and stall-service.     |
| `pnpm build`                            | Build contracts, then web, desktop, and stall-service.     |
| `pnpm check`                            | Run doctor, lint, format check, and typecheck.             |
| `pnpm --filter @polivo/contracts smoke` | Run the contracts validation smoke check (requires build). |

Test runners will be configured in phase 06.

## Workspace layout reminder

- `apps/*` and `packages/*` are pnpm workspace packages.
- Shared development tooling lives at the repository root.
- Application runtime dependencies belong in the package that uses them, not in the root package.
