# Environment Configuration

This document defines configuration boundaries for Polivo Market System. Validate configuration at the boundary where it is used. Never log secret values. Use separate development, staging, and production configuration. Do not require production credentials for local tooling.

Do not invent Clerk, Supabase, or hosting environment-variable names before those integrations are configured. Document each new variable when its integration is implemented. Sanitized `.env.example` files may be tracked; real environment files and credentials must not be committed.

## Web Application

- No application environment variables are required in phase 04.
- Public browser configuration must be explicitly designated as public.
- Server credentials must remain server-only and must not be imported into client bundles.
- Privileged Supabase credentials must never be exposed through public variables.
- Clerk public and secret configuration must remain separate.

## Desktop Application

- No application environment variables are required in phase 04.
- Renderer configuration must contain no privileged credentials.
- Values exposed through Vite are visible in the built application and must be treated as public.
- Provisioned device credentials belong in secure runtime storage, not ordinary settings files.
- Do not embed cloud service credentials into the desktop application.

## Stall Service

Phase 04 introduces loopback host and port configuration only.

| Variable | Required | Default     | Description                                                                                                                  |
| -------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `HOST`   | No       | `127.0.0.1` | Bind address. Only loopback values are accepted in this phase: `127.0.0.1`, `localhost`, or `::1`.                           |
| `PORT`   | No       | `3040`      | TCP port. Must be an integer from 1 to 65535. The service does not silently switch ports when the selected port is occupied. |

Loading behavior:

1. Copy `apps/stall-service/.env.example` to `apps/stall-service/.env` when local overrides are needed.
2. On startup, `loadConfig()` in `apps/stall-service/src/config.ts` loads `apps/stall-service/.env` when that file exists, using Node.js `process.loadEnvFile`.
3. Explicit process environment variables already set in the shell take precedence over values from the file when Node merges them after load (file values do not override existing variables).
4. Invalid `HOST` or `PORT` values cause startup to fail with a clear error. Secret values are not printed.

Additional service rules:

- Service configuration is server-side.
- Runtime database, backup, and log paths belong outside the repository.
- Device credentials are created through provisioning, not committed in environment files.
- Missing required configuration must produce a clear startup error.
- Do not silently expose the service on all network interfaces.

## General Rules

- Validate configuration at the boundary where it is used.
- Never log secret values.
- Keep development, staging, and production configuration separate.
- Do not require production credentials for local tooling or automated checks.
- Document new variables when the corresponding integration is implemented.
- Application environment schemas and production configuration validation will be added with each integration.
