# Environment Configuration

This document defines configuration boundaries for Polivo Market System. Validate configuration at the boundary where it is used. Never log secret values. Use separate development, staging, and production configuration. Do not require production credentials for local tooling.

Document each new variable when its integration is implemented. Sanitized `.env.example` files may be tracked; real environment files and credentials must not be committed. Do not invent additional Clerk, Supabase, or hosting names beyond the documented set below.

## Web Application

Clerk and Supabase development variables for phases 11–12. Phase 11 validates cloud URL/publishable-key names in `@polivo/db-cloud` user-context clients. Phase 12 wires Clerk sign-in and request-scoped Supabase access. Fill local values before running authenticated web flows. See [web-authentication.md](./web-authentication.md).

| Variable                               | Required for integrations | Public | Description                                                                                            |
| -------------------------------------- | ------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`    | Yes (Clerk)               | Yes    | Clerk development publishable key. Browser-safe.                                                       |
| `CLERK_SECRET_KEY`                     | Yes (Clerk)               | No     | Clerk development secret key. Server-only.                                                             |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`        | Yes (Clerk routes)        | Yes    | Application sign-in path. Use `/sign-in`.                                                              |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`        | Yes (Clerk routes)        | Yes    | Application sign-up path. Use `/sign-up`.                                                              |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes (Supabase)            | Yes    | Supabase project URL. Browser-safe. Used by `@polivo/db-cloud` user-context factory.                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (Supabase)            | Yes    | Supabase publishable key. Browser-safe. Used by user-context factory.                                  |
| `SUPABASE_SECRET_KEY`                  | Yes (privileged server)   | No     | Supabase privileged secret / service-role key. Server-only. Not used by authenticated dashboard reads. |
| `DATABASE_URL`                         | Yes (migrations/schema)   | No     | Postgres connection string for cloud schema and migrations. Server-only.                               |

Cloud schema, RLS, and migration operations are documented in [cloud-database-and-tenant-isolation.md](./cloud-database-and-tenant-isolation.md). Canonical SQL lives under `supabase/migrations` only.

Loading behavior:

1. Copy `apps/web/.env.example` to `apps/web/.env.local` when setting up a machine.
2. Replace placeholder values with Clerk and Supabase **development** credentials. Do not use production secrets for local work.
3. Next.js loads `.env.local` for the web app automatically. Restart `pnpm dev:web` after changing environment variables.
4. Only variables intended for browser access use the `NEXT_PUBLIC_` prefix. `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, and `DATABASE_URL` must remain server-only and must not be imported into client bundles.
5. Keep `apps/web/.env.example` in Git with placeholders only. Never commit `apps/web/.env.local` or real credentials.

### Vercel staging / production (web only)

Host only `@polivo/web` on Vercel. Do not select the Electron app or stall-service as the web project.

| Setting         | Value                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js                                                                                                                                                       |
| Root Directory  | `apps/web`                                                                                                                                                    |
| Install Command | Prefer `apps/web/vercel.json` (`cd ../.. && pnpm install --frozen-lockfile`) so the monorepo lockfile and workspace packages install from the repository root |
| Build Command   | Prefer `apps/web/vercel.json` (`pnpm run build`). That script builds `@polivo/ui` then runs `next build`                                                      |
| Node.js         | Match repository `.node-version` / root `engines.node` (currently Node.js 26.x)                                                                               |

`@polivo/ui` publishes compiled exports from `packages/ui/dist/`, which is not committed. A bare `next build` on a clean Vercel checkout fails with `Can't resolve '@polivo/ui'` unless the UI package is built first.

Keep staging and production as separate Vercel projects and separate Clerk / Supabase credentials. Do not put stall SQLite paths or desktop secrets into Vercel.

## Desktop Application

- No application environment variables are required in phase 04.
- Renderer configuration must contain no privileged credentials.
- Values exposed through Vite are visible in the built application and must be treated as public.
- Provisioned device credentials belong in secure runtime storage, not ordinary settings files.
- Do not embed cloud service credentials into the desktop application.

## Stall Service

Phase 09 requires loopback host/port plus an absolute local SQLite path.

| Variable               | Required | Default     | Description                                                                                                                                               |
| ---------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                 | No       | `127.0.0.1` | Bind address. Only loopback values are accepted in this phase: `127.0.0.1`, `localhost`, or `::1`.                                                        |
| `PORT`                 | No       | `3040`      | TCP port. Must be an integer from 1 to 65535. The service does not silently switch ports when the selected port is occupied.                              |
| `POLIVO_LOCAL_DB_PATH` | Yes      | —           | Absolute filesystem path to the stall SQLite database file. Must be outside the repository. Relative paths, `:memory:`, and URL-style paths are rejected. |
| `POLIVO_ENROLLMENT_BASE_URL` | For host activation | `http://localhost:3000` | Base URL of `@polivo/web` for device redeem/confirm (phase 14). |
| `POLIVO_DEPLOYMENT_ENVIRONMENT` | For host activation | `development` | Must match the owner-issued grant: `development`, `staging`, or `production`. |
| `POLIVO_ENROLLMENT_SECRET` | Optional | — | Non-interactive one-time host enrollment secret. Prefer interactive prompt. Never log. |
| `POLIVO_SECURE_STORAGE` | Optional | — | Set to `simulated` to force non-DPAPI file storage for experiments. Production hosts must use Windows DPAPI. |

Loading behavior:

1. Copy `apps/stall-service/.env.example` to `apps/stall-service/.env` when local overrides are needed.
2. On startup, `loadConfig()` in `apps/stall-service/src/config.ts` loads `apps/stall-service/.env` when that file exists, using Node.js `process.loadEnvFile`.
3. Explicit process environment variables already set in the shell take precedence over values from the file when Node merges them after load (file values do not override existing variables).
4. Invalid `HOST`, `PORT`, or `POLIVO_LOCAL_DB_PATH` values cause startup to fail with a clear error. Secret values are not printed.
5. After config load, the process opens the existing database and verifies schema compatibility. It does not create or auto-migrate the file on normal startup. Use `@polivo/db-local` `db:init` / `db:migrate` for explicit maintenance. See [local-database-and-migrations.md](./local-database-and-migrations.md).

Additional service rules:

- Service configuration is server-side.
- Runtime database, backup, and log paths belong outside the repository.
- Device credentials are created through provisioning, not committed in environment files.
- Missing required configuration must produce a clear startup error.
- Do not silently expose the service on all network interfaces.
- Do not put live SQLite, WAL, or SHM files inside the git working tree.

## General Rules

- Validate configuration at the boundary where it is used.
- Never log secret values.
- Keep development, staging, and production configuration separate.
- Do not require production credentials for local tooling or automated checks.
- Document new variables when the corresponding integration is implemented.
- Application environment schemas and production configuration validation will be added with each integration.
