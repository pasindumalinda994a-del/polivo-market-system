# 0007 — Local SQLite Driver (`node:sqlite`)

- Status: Accepted
- Date: 2026-11-01

## Context and source

Phase 09 requires a maintained SQLite driver compatible with the pinned Node.js runtime (`>=26.13.0 <27`), Windows deployment, the stall-service build, exact integer numerics, transactions, and future SQLite-aware backup. Source: `docs/implementation/09-local-sqlite-schema-and-migrations.md`, Node.js 26.13.0 `node:sqlite` documentation.

## Decision

Use the Node.js built-in `node:sqlite` module (`DatabaseSync` / runtime `Database` alias). Do not add `better-sqlite3` or an ORM for local persistence.

Connection defaults for file-backed operational databases:

- Foreign keys enabled on every connection.
- WAL journal mode.
- Bounded busy timeout of 5000 ms (constructor `timeout` and `PRAGMA busy_timeout`).
- `PRAGMA synchronous = FULL` for durability of committed financial records.

TypeScript currently types the class as `DatabaseSync` via `@types/node` while Node 26.13.0 also exports `Database` at runtime; Polivo code uses `DatabaseSync` for type compatibility.

## Reasoning

The stall service already pins Node 26 LTS. The built-in driver avoids native addon installation, `allowBuilds` entries, and Windows compile toolchains. It supports transactions, foreign keys, BigInt-capable integer binding, and an official `backup()` API reserved for phase 38. Stability is Release Candidate (1.2); the repository already pins the Node minor via `.node-version`.

## Consequences

- `@polivo/db-local` has no runtime npm SQLite dependency.
- CI must run on Node 26 so `node:sqlite` is available (already true for `quality-and-build`).
- Upgrade notes for Node must review `node:sqlite` API stability.
- Future backup work should use `sqlite.backup`, not file copies of the main DB alone.

## Related implementation phases

- Phase 09 — Local SQLite schema and migrations
- Phase 10 — Fastify local data access and transactions
- Phase 38 — Backup workflows
