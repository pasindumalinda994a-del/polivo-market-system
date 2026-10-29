# 0002 — Shared Contracts Foundations

- Status: Accepted
- Date: 2026-10-29

## Context and source

Phase 05 introduces `@polivo/contracts` as the shared runtime validation and TypeScript type source for cross-application communication. Source: `docs/implementation/05-shared-contracts-and-validation.md`, `docs/context/architecture.md`, and `docs/context/code-standards.md`. Context files require Zod at boundaries and opaque identifiers, but do not prescribe library version, identifier length bounds, pagination limits, or initial protocol version strings.

## Decision

- Use Zod `4.6.7` as the contracts runtime validation library.
- Build `@polivo/contracts` as ESM (`"type": "module"`) with `tsc` emitting JavaScript and declaration files under `dist/`, exported only through the package root `exports` map.
- Treat tenant, device, request/correlation, and idempotency identifiers as opaque non-empty strings with a maximum length of `128` characters. Do not assume UUID format. Do not trim or normalize identifier values. Do not apply these rules to Clerk user IDs in this package.
- Represent absolute timestamps as ISO 8601 strings that require an explicit timezone offset (`z.iso.datetime({ offset: true })`).
- Represent calendar dates as validated `YYYY-MM-DD` strings (`z.iso.date()`). Do not interpret a calendar date as midnight UTC in contracts.
- Use cursor pagination with a default page size of `20`, a maximum of `100`, and an opaque cursor string up to `512` characters.
- Set the initial local API contract version and synchronization protocol version to `"1"`. Keep these distinct from application release versions, database migration versions, and individual event schema versions.

## Reasoning

Zod 4.6.7 already appears in the workspace lockfile and provides ISO date/time helpers plus strict objects that match the phase requirements. Opaque bounded strings preserve future flexibility for Supabase, local SQLite, and device identifiers without inventing UUID-only rules. Explicit timezone and calendar-date schemas prevent locale ambiguity while leaving business-day timezone rules in domain code. Small pagination and version constants give services a concrete foundation without premature negotiation or financial schemas.

## Consequences

- Applications import contracts from `@polivo/contracts` after the package is built; source path aliases are not used.
- Root `build` and `typecheck` must include `@polivo/contracts` before dependent applications.
- Identifier formats may be tightened later through a new decision if generation strategies are approved.
- Money, weight, commission, bill numbering, and payment contracts remain deferred until approved requirements exist.

## Related implementation phases

- Phase 05 — Shared contracts and validation
- Phase 06 — Testing and continuous integration
- Phase 08 — Domain foundations (financial transport rules deferred)
