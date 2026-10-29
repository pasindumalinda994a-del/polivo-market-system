# 04 — Web, Desktop, and Stall Service Bootstrap

## Goal

Initialize the three Polivo applications inside the existing monorepo:

- Next.js web application.
- Electron + React + Vite desktop application.
- Fastify stall service.

Each application must start in development, type-check, and build independently.

This phase establishes runnable application foundations only.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect the workspace manifests, lockfile, TypeScript defaults, ESLint configuration, and root scripts.
4. Verify that phases 01–03 are complete.
5. Run `pnpm doctor`.
6. Preserve existing files and established tooling decisions.

Check current official documentation before selecting framework versions or generating configuration.

Use stable versions compatible with the Node.js, pnpm, TypeScript, and lint tooling selected in phase 03.

Do not upgrade existing tooling unnecessarily.

## Architecture Boundaries

- The web application runs independently of the desktop application.
- The desktop renderer is a React application built with Vite.
- Electron provides the desktop shell.
- Fastify runs as a separate local service.
- Desktop terminals will communicate with that service through its API.
- Only the stall service will access SQLite in later phases.

Do not embed the Next.js application inside Electron.

Do not make Electron start a separate stall service for every terminal.

## 1. Initialize the Next.js Web Application

Work inside `apps/web`.

Create a minimal Next.js application using:

- TypeScript.
- App Router.
- A `src` directory.
- React versions compatible with the selected Next.js version.

Preserve the package name:

`@polivo/web`

### Initial Structure

Create the framework files required for:

- Root layout.
- Home page.
- Minimal global styles.
- Next.js configuration.
- Application TypeScript configuration.
- Framework type declarations.

Use framework-supported configuration for the selected version.

### Initial Page

Show a simple page containing:

- `Polivo`
- `Web application foundation`
- A short message confirming that the application is running.

Keep styling minimal.

Do not create a dashboard, navigation system, authentication screens, or marketing website yet.

### Package Scripts

Provide working scripts for:

- `dev`
- `build`
- `start`
- `typecheck`

Use a documented local development port that does not conflict with the other applications.

Do not add a dependency on Clerk, Supabase, or real credentials.

## 2. Initialize the Electron Desktop Application

Work inside `apps/desktop`.

Use Electron, React, Vite, and TypeScript.

Prefer a maintained Electron/Vite integration such as `electron-vite` if compatible with the existing toolchain. Verify its current official configuration before using it.

Preserve the package name:

`@polivo/desktop`

Do not introduce a second package manager, lockfile, or nested workspace.

### Process Separation

Create separate source areas for:

    src/
      main/
      preload/
      renderer/

Their responsibilities are:

- `main`: Electron application lifecycle and window creation.
- `preload`: A minimal, controlled bridge where needed.
- `renderer`: React UI running without privileged Node.js access.

Configure separate TypeScript environments where needed so browser code does not inherit unrestricted Node.js globals.

### Main Process

Implement:

- Application startup.
- One initial browser window.
- Development renderer loading.
- Production renderer loading from built files.
- Normal window close and application shutdown behavior.
- Platform-appropriate activation behavior.

Use paths that work in both development and built output.

Do not hardcode a development URL into the production startup path.

### Electron Security Defaults

Configure the window with:

- Context isolation enabled.
- Node integration disabled.
- Renderer sandboxing enabled where supported by the chosen setup.

Also:

- Prevent unexpected navigation.
- Deny unapproved new-window requests.
- Do not disable web security.
- Apply a content security policy appropriate to development and production.
- Keep any development-only allowances out of the production policy.

Do not expose:

- Raw `ipcRenderer`.
- File-system access.
- Shell execution.
- Arbitrary IPC channel invocation.
- Environment variables or secrets.

If no renderer-to-main communication is needed, keep the preload bridge empty.

### Renderer

Create a minimal React page showing:

- `Polivo`
- `Desktop application foundation`
- A short message confirming that the renderer is running.

Do not build billing screens, navigation, authentication, printer controls, or service-connection settings.

### Package Scripts

Provide working scripts for:

- `dev`
- `build`
- `typecheck`

Add a built-application preview command only if the selected tooling supports it correctly.

The build must produce runnable application output.

Creating a Windows installer is not part of this phase.

## 3. Initialize the Fastify Stall Service

Work inside `apps/stall-service`.

Preserve the package name:

`@polivo/stall-service`

Use TypeScript and a development runner compatible with the selected Node.js version.

### Structure

Separate:

- Application construction.
- Configuration loading.
- Server startup and shutdown.

For example:

    src/
      app.ts
      config.ts
      server.ts

Application construction must not automatically bind a network port. This separation will support integration testing later.

### Development Configuration

Provide documented development defaults for:

- Host: loopback only.
- Port: a dedicated port that does not conflict with Next.js or Vite.

Allow explicit host and port configuration.

Requirements:

- Validate port values and other configuration used in this phase.
- Fail clearly on invalid configuration.
- Do not print secret values.
- Do not silently expose the service on all network interfaces.
- Do not silently switch ports if the selected port is occupied.

Use a small validation implementation for these initial settings. Shared contract validation belongs to phase 05.

### Health Endpoint

Create:

`GET /health`

Return a minimal response identifying the service and its process health.

For example:

    {
      "service": "polivo-stall-service",
      "status": "ok"
    }

This endpoint confirms only that the HTTP service is running.

Do not imply that a database, synchronization worker, authentication service, or printer is connected.

### Logging and Shutdown

Implement:

- Structured startup and error logging.
- A clear error when the port is unavailable.
- Graceful handling of supported termination signals.
- Proper server closure during shutdown.
- Nonzero exit status when startup fails.

Do not add permissive CORS settings. Cross-origin communication and LAN access will be configured when the desktop connection is implemented.

### Package Scripts

Provide working scripts for:

- `dev`
- `build`
- `start`
- `typecheck`

Ensure the compiled service starts using Node.js without requiring a TypeScript development runner.

## 4. Configure Application TypeScript Boundaries

Extend `tsconfig.base.json` where appropriate.

Use application-specific settings for:

- Next.js.
- Electron main and preload.
- React/Vite renderer.
- Fastify running under Node.js.

Keep module formats, module resolution, output paths, and package settings consistent.

Do not force all applications to share identical compiler settings.

Do not resolve workspace packages through ad hoc aliases to their source directories.

The shared packages remain placeholders until they are implemented in later phases.

## 5. Extend ESLint for Application Code

Update the existing flat ESLint configuration.

Add compatible rules for:

- Next.js.
- React and hooks where applicable.
- Electron main/preload code.
- Node.js service code.

Keep browser globals scoped to browser code and Node.js globals scoped to server or Electron privileged code.

Exclude generated output, including:

- Next.js build output.
- Vite/Electron build output.
- Compiled service output.
- Framework-generated type files where appropriate.

Do not globally disable existing correctness rules to make the applications pass.

Keep formatting with Prettier.

## 6. Add Root Application Commands

Wire these root commands to the corresponding workspace scripts:

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` | Start the Next.js development server. |
| `pnpm dev:desktop` | Start Electron and its Vite renderer. |
| `pnpm dev:service` | Start the Fastify development service. |
| `pnpm build` | Build all three applications. |
| `pnpm typecheck` | Type-check all three applications. |

Keep the commands from phase 03 working:

- `pnpm doctor`
- `pnpm lint`
- `pnpm format`
- `pnpm format:check`
- `pnpm check`

Extend `pnpm check` to include application type-checking.

Ensure root build and type-check commands actually include all three applications.

Do not let broad `--if-present` usage hide a missing required application script.

For now, document running the three development commands in separate terminals. A combined process runner is not required.

## 7. Update Development Documentation

Update `docs/operations/local-development.md`.

Include:

- Dependency installation.
- Commands to start each application.
- Assigned development ports.
- How to open the web application.
- How to launch the desktop application.
- How to request the service health endpoint.
- How to build and start the compiled service.
- How to stop each development process.
- The difference between desktop build output and an installer.

Explain that:

- The three applications currently run independently.
- Desktop-to-service communication is implemented in phase 16.
- No database or cloud service is connected yet.

Update `docs/operations/environment-configuration.md` with only the configuration actually introduced.

If a service `.env.example` is added, include nonsecret examples only and document how the service loads those values. Do not create an example file that the application cannot use as documented.

## 8. Verify the Bootstrap

Run:

- Dependency installation.
- `pnpm doctor`.
- `pnpm lint`.
- `pnpm format:check`.
- `pnpm typecheck`.
- `pnpm build`.
- `pnpm check`.

Resolve failures caused by this phase.

### Web Smoke Check

- Start the web application.
- Verify that the initial page loads.
- Check for startup and browser errors.
- Verify that the production build can start.

### Service Smoke Check

- Start the service in development.
- Request `/health`.
- Verify the expected response.
- Stop the service cleanly.
- Start the compiled output.
- Verify `/health` again.
- Confirm that invalid configuration produces an actionable failure.

### Desktop Smoke Check

Where a graphical environment is available:

- Launch the desktop application.
- Verify that the initial page renders.
- Confirm that closing the window exits as expected on Windows.
- Check that the renderer cannot access privileged Node.js APIs.
- Verify built-output loading through the supported preview workflow, if available.

If the environment cannot launch Electron, report that limitation explicitly. A successful build does not prove that the desktop window launches correctly.

Do not add a full test framework in this phase. That belongs to phase 06.

## Scope Limits

For this phase:

- Do not implement shared business logic or API contracts.
- Do not install SQLite or Supabase integrations.
- Do not implement authentication.
- Do not implement tenant provisioning.
- Do not connect the desktop application to the service.
- Do not expose the service to the LAN by default.
- Do not create billing, payment, or reporting features.
- Do not implement the shared design system.
- Do not add printing, synchronization, backups, or updates.
- Do not package Windows installers.
- Do not deploy applications.
- Do not commit or push automatically.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Applications initialized.
- Framework versions selected.
- Working development and build commands.
- Verification results.
- Any manual desktop verification still required.
- Any unresolved configuration issues.
- Phase 05, `05-shared-contracts-and-validation.md`, as the next step.

Preserve the existing tracker format.

## Completion Report

Provide:

1. Applications and configuration files created or updated.
2. Selected framework versions.
3. Development commands and ports.
4. Build, lint, type-check, and smoke-check results.
5. Any checks that could not run and why.
6. Whether phase 05 can begin.