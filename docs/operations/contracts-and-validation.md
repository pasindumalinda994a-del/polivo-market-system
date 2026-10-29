# Contracts and Validation

This guide describes `@polivo/contracts`, the shared source of runtime validation schemas and TypeScript types for communication between Polivo applications.

## Package responsibilities

`@polivo/contracts` may contain:

- Runtime Zod schemas and types inferred from those schemas.
- Transport identifiers, error codes, and response schemas.
- Pagination contracts.
- Protocol-version constants.
- Generic synchronization envelope foundations.

It must not contain database clients, React components, Electron APIs, Fastify plugins, Clerk or Supabase SDKs, environment-variable access, credentials, or business calculations.

Business behavior belongs in `@polivo/domain`. Persistence models belong in the database packages.

A validated request is not an authorized request. Tenant, device, role, and record-ownership checks remain the responsibility of the receiving service.

## Public import paths

Import only through the package root:

```ts
import { buildHealthResponse, healthResponseSchema, type HealthResponse } from "@polivo/contracts";
```

Do not import from `packages/contracts/src` with relative paths or ad hoc TypeScript path aliases. Consumers resolve the compiled `dist/` output declared in the package `exports` map.

## Schema-first type inference

Zod schemas are the source of truth. Export TypeScript types with `z.infer<typeof schema>` rather than maintaining duplicate interfaces.

Conventions:

- Validate external input at the receiving boundary.
- Reject unexpected fields on command objects with `z.strictObject` unless a schema explicitly permits them.
- Avoid silent coercion for JSON request bodies.
- Convert URL query parameters intentionally (for example pagination limits).
- Do not trim, normalize, or transform identifiers without an approved rule.
- Do not expose raw Zod error objects as the public API format.

## Identifiers

Shared opaque identifier schemas cover:

- Tenant ID
- Device ID
- Request / correlation ID
- Idempotency key

Values are non-empty strings with a maximum length of `128` characters. They are opaque transport values and are not assumed to be UUIDs. Values are preserved exactly.

Do not impose these local identifier rules on Clerk user IDs. Keep human-readable farmer/buyer codes separate from internal record IDs. See `docs/decisions/0002-shared-contracts-foundations.md`.

## Timestamps and calendar dates

| Concept            | Representation                            |
| ------------------ | ----------------------------------------- |
| Absolute timestamp | ISO 8601 with an explicit timezone offset |
| Calendar date      | `YYYY-MM-DD`                              |

Invalid calendar dates are rejected. Locale-formatted timestamps are rejected. A calendar date is not silently interpreted as midnight UTC.

Business-day calculations and the stall’s operating timezone belong in domain implementation, not in this package.

## Error responses

Public errors use:

- A stable application error code
- A safe human-readable message
- An optional request / correlation ID
- Optional structured validation issues (`path`, `code`, `message`)

Initial codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.

Intended HTTP status mapping:

| Code                  | HTTP status |
| --------------------- | ----------- |
| `VALIDATION_ERROR`    | 400         |
| `UNAUTHENTICATED`     | 401         |
| `FORBIDDEN`           | 403         |
| `NOT_FOUND`           | 404         |
| `CONFLICT`            | 409         |
| `RATE_LIMITED`        | 429         |
| `SERVICE_UNAVAILABLE` | 503         |
| `INTERNAL_ERROR`      | 500         |

Failed requests must not return HTTP 200. Unexpected errors should produce a generic public message; detailed diagnostics belong in protected server logs.

When converting Zod issues, map only permitted fields. Do not include rejected input values, request bodies, credentials, stack traces, SQL errors, or internal file paths.

## Pagination

List endpoints use cursor pagination:

- Default limit: `20`
- Maximum limit: `100`
- Optional opaque cursor (maximum `512` characters)
- Response metadata includes `nextCursor` when more results exist

Invalid, fractional, negative, zero, or excessive limits are rejected. Cursor contents remain private server concerns. A cursor does not grant authorization. Tenant filtering and stable ordering remain server responsibilities.

## Versioning

| Constant                             | Purpose                          |
| ------------------------------------ | -------------------------------- |
| `LOCAL_API_CONTRACT_VERSION` (`"1"`) | Local stall-service API contract |
| `SYNC_PROTOCOL_VERSION` (`"1"`)      | Synchronization protocol         |

These are distinct from application release versions, database migration versions, and individual event schema versions.

Incompatible versions must be handled explicitly. Unknown protocol versions must not be silently accepted. Compatibility checks and negotiation are implemented with the relevant APIs and update workflows in later phases.

## Synchronization envelope

`createSyncEnvelopeSchema(payloadSchema)` defines transport metadata:

- Event ID
- Tenant ID
- Originating device ID
- Event type
- Event schema version
- Occurrence timestamp
- Payload validated by the supplied concrete schema

Requirements:

- Each event’s payload must be validated by an explicit schema.
- Do not create a production event schema that accepts arbitrary payloads.
- Event identity is separate from bill numbers.
- Timestamps are not a reliable global ordering mechanism.
- Tenant and device fields are not proof of identity.
- Credentials must not appear in event data.

Ordering, aggregate revisions, acknowledgements, batching, and database representations are finalized with local transaction and synchronization phases.

## Health contract

`GET /health` uses `healthResponseSchema` / `buildHealthResponse()`:

```json
{
  "service": "polivo-stall-service",
  "status": "ok"
}
```

This response does not claim database, synchronization, authentication, or printer readiness.

## Build and watch

Contracts emit compiled JavaScript and declaration files under `packages/contracts/dist/`. That output is gitignored. A clean checkout must build contracts before dependent applications can resolve the package.

From the repository root:

```powershell
pnpm --filter @polivo/contracts build
pnpm build
pnpm typecheck
pnpm dev:contracts
```

`pnpm build` and `pnpm typecheck` include `@polivo/contracts` before the applications.

While editing contracts during development:

1. Run `pnpm dev:contracts` so `dist/` stays current, or rebuild after changes.
2. Restart the compiled stall service (`pnpm --filter @polivo/stall-service start`) after contract output changes.
3. `pnpm dev:service` uses `tsx` for application TypeScript; it still resolves `@polivo/contracts` from the built package exports, so contract changes still require a contracts rebuild or watch.

Do not rely on stale local build output.

## Adding contracts in future phases

1. Add schemas next to related modules under `packages/contracts/src/`.
2. Infer and export types from those schemas.
3. Re-export only intentional public symbols from `src/index.ts`.
4. Rebuild the package and consume it through `@polivo/contracts`.
5. Validate at receiving boundaries; keep authorization in the service.

Money, weight, commission boundaries, and payment rules will be defined from approved requirements in phase 08. Do not choose financial precision, rounding, or monetary transport formats in this package until those requirements are accepted.
