# 0001 — Monorepo Tooling Foundation

- Status: Accepted
- Date: 2026-10-29

## Context and source

Phase 03 configures the Polivo repository as a TypeScript monorepo before any application frameworks are initialized. Source: `docs/implementation/03-monorepo-tooling-and-environment.md`, `docs/context/architecture.md`, and current Node.js / pnpm / ESLint documentation at implementation time.

## Decision

- Use pnpm workspaces for dependency management with `apps/*` and `packages/*`.
- Pin Node.js Active LTS 26.x (`>=26.13.0 <27`, `.node-version` `26.13.0`) and pnpm `12.16.1` via `packageManager`.
- Provide shared TypeScript defaults in `tsconfig.base.json` with strict correctness settings and without runtime-specific `lib`, JSX, path aliases, or module-resolution choices.
- Use ESLint flat config with JavaScript and TypeScript recommended rules, Prettier for formatting, and `eslint-config-prettier` to avoid formatting conflicts. Defer type-aware lint rules until application TypeScript projects exist.
- Orchestrate development commands with native pnpm workspace scripts. Do not add Turborepo, Nx, or another build orchestrator in this phase.
- Keep runtime-specific configuration with each application when those applications are bootstrapped in phase 04.

## Reasoning

The repository had no established package manager or quality tooling. pnpm workspaces match the approved monorepo layout without introducing an extra orchestrator. Node.js 26 is the Active LTS at decision time and is suitable for host tooling; Electron will ship its own Node runtime later. TypeScript 5.9.x remains within the supported range for `typescript-eslint` 8.x, avoiding TypeScript 7 until type-aware linting support is ready. Shared base configuration must not impose browser or Node globals on every package.

## Consequences

- Contributors must use the pinned Node.js and pnpm versions; `pnpm doctor` enforces the prerequisites.
- Application packages receive their own TypeScript, lint, and environment configuration when initialized.
- Root scripts currently cover doctor, lint, format, format check, and combined check only.
- Planned phase 04 commands (`dev:web`, `dev:desktop`, `dev:service`, `build`, `typecheck`) remain unwired until application scripts exist.

## Related implementation phases

- Phase 03 — Monorepo tooling and environment
- Phase 04 — Web, desktop, and service bootstrap
