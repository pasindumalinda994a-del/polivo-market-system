# 05 — Shared Contracts and Validation

## Goal

Implement `packages/contracts` as the shared source of runtime validation schemas and TypeScript types for communication between Polivo applications.

Establish reusable identifiers, transport conventions, error formats, and versioning foundations.

Connect the existing stall-service health endpoint to the shared contract as the first working example.

Do not implement business features or invent unresolved financial rules.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect the applications and workspace tooling created in phases 03 and 04.
4. Confirm that all three applications build and type-check.
5. Inspect existing schemas, types, and validation helpers before adding new ones.
6. Check current official Zod documentation and compatibility with the selected toolchain.

Preserve existing conventions unless a change is necessary and documented.

## Contract Boundaries

`packages/contracts` defines data exchanged across application boundaries.

It may contain:

- Runtime schemas.
- Types inferred from schemas.
- Transport identifiers.
- Error codes and response schemas.
- Pagination contracts.
- Protocol-version constants.
- Generic synchronization envelope definitions.

It must not contain:

- Database clients or queries.
- React components.
- Electron APIs.
- Fastify plugins.
- Clerk or Supabase SDKs.
- Environment-variable access.
- Credentials.
- Business calculations or commission rules.

Business behavior belongs in `packages/domain`.

Persistence models belong in the database packages.

A validated request is not an authorized request. Tenant, device, role, and record-ownership checks remain the responsibility of the receiving service.

## 1. Initialize the Contracts Package

Work inside:

`packages/contracts`

Preserve the package name:

`@polivo/contracts`

Install Zod as a runtime dependency of this package.

Use a compatible stable version and record it in the lockfile.

Create a small structure such as:

    src/
      primitives.ts
      errors.ts
      pagination.ts
      health.ts
      versioning.ts
      sync/
        envelope.ts
      index.ts

Create:

- Package TypeScript configuration.
- Build and type-check scripts.
- Explicit package exports.
- Generated JavaScript and declaration-file output.

Use a module format compatible with the applications and their current build configuration.

Do not expose TypeScript source through ad hoc application path aliases.

Do not declare exports for files that do not exist.

## 2. Establish Shared Schema Conventions

Use Zod schemas as the source of truth.

Infer TypeScript types from schemas rather than maintaining duplicate interfaces.

Apply these rules:

- Validate external input at the receiving boundary.
- Reject unexpected fields in command objects unless explicitly permitted.
- Use explicit schemas for responses.
- Avoid silent coercion for JSON request bodies.
- Use intentional conversion for URL query parameters.
- Do not trim, normalize, or transform identifiers without an approved rule.
- Do not export unrestricted `any` types.
- Do not expose raw validation-library internals as the public API format.

Provide small reusable helpers only where they simplify actual contracts.

Avoid building a generic validation framework.

## 3. Define Identifier Contracts

Review the context files for an approved identifier format.

Define shared schemas for concepts already established:

- Tenant ID.
- Device ID.
- Request/correlation ID.
- Idempotency key.

Requirements:

- Use consistent validation.
- Define and document sensible maximum lengths.
- Preserve identifier values exactly.
- Treat IDs as opaque transport values unless their format is explicitly approved.
- Do not assume all identifiers are UUIDs.
- Do not impose local identifier rules on Clerk user IDs.
- Keep human-readable farmer/buyer codes separate from internal record IDs.

Document technical validation choices as implementation decisions.

Do not choose database generation strategies or bill-number formats in this phase.

## 4. Define Date and Time Transport Conventions

Establish separate representations for:

- An absolute timestamp.
- A calendar date.

Requirements:

- Absolute timestamps use an explicitly documented ISO 8601 representation with timezone information.
- Calendar dates use a validated `YYYY-MM-DD` representation.
- Invalid calendar dates must be rejected.
- Do not accept ambiguous locale-formatted timestamps.
- Do not silently interpret a calendar date as midnight UTC.

Document that business-day calculations and the stall’s operating timezone belong to the domain implementation.

Do not implement daily closing or price-reset behavior here.

## 5. Define the Error Response Contract

Create a consistent error response schema.

Include:

- A stable application error code.
- A safe human-readable message.
- An optional request/correlation ID.
- Optional structured validation issues.

Use a small initial set of codes, such as:

- `VALIDATION_ERROR`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `SERVICE_UNAVAILABLE`
- `INTERNAL_ERROR`

Do not create codes for features that do not exist yet.

### Validation Issues

A public validation issue should contain:

- A field path.
- A stable issue code.
- A safe message.

Do not include:

- Rejected input values.
- Request bodies.
- Credentials.
- Stack traces.
- SQL errors.
- Internal file paths.

If a helper converts Zod issues into this format, explicitly map the permitted fields instead of returning the raw error object.

### HTTP Semantics

Document the intended relationship between error codes and HTTP status codes.

Do not return HTTP 200 for failed requests.

Do not include HTTP response objects or Fastify-specific types in the contracts package.

Unexpected errors should produce a generic public message. Detailed diagnostics belong in protected server logs.

## 6. Define Pagination Foundations

Create a reusable pagination contract for future list endpoints.

Use one documented convention, such as:

- A bounded positive page-size limit.
- An optional opaque cursor.
- Response metadata indicating the next cursor when available.

Requirements:

- Reject invalid, fractional, negative, or excessive limits.
- Handle query-string conversion deliberately.
- Keep cursor internals private.
- Do not imply that a cursor grants authorization.
- Keep tenant filtering and stable ordering on the server.

Do not implement database queries or generic filtering systems.

Do not add farmer, buyer, bill, or payment filters before those features are specified.

## 7. Define Versioning Foundations

Define explicit constants and schemas for:

- The initial local API contract version.
- The initial synchronization protocol version.

Keep these distinct from:

- Application release versions.
- Database migration versions.
- Individual event schema versions.

Document:

- Where each version applies.
- That incompatible versions must be handled explicitly.
- That unknown protocol versions must not be silently accepted.
- That compatibility checks will be implemented with the relevant APIs and update workflows.

Do not build version negotiation in this phase.

## 8. Define a Synchronization Envelope Foundation

Create a generic schema factory or equivalent typed foundation for future synchronization events.

Include only transport metadata needed by the planned architecture, such as:

- Event ID.
- Tenant ID.
- Originating device ID.
- Event type.
- Event schema version.
- Occurrence timestamp.
- A payload validated by a supplied concrete schema.

Requirements:

- Require explicit validation of each event’s payload.
- Do not create a production event schema that accepts arbitrary payloads.
- Keep event identity separate from bill numbers.
- Do not treat timestamps as a reliable global ordering mechanism.
- Do not trust tenant or device fields as proof of identity.
- Do not expose credentials in event data.

Ordering, aggregate revisions, acknowledgements, batching, and database representations will be finalized with the local transaction and synchronization phases.

Do not invent sale, payment, commission, or ledger event payloads yet.

## 9. Create the Shared Health Contract

Define a response schema for the existing stall-service endpoint:

`GET /health`

Preserve the current response shape unless an intentional change is documented.

For the phase 04 example, validate:

    {
      "service": "polivo-stall-service",
      "status": "ok"
    }

Use literal values where appropriate.

Do not add fields claiming that the database, synchronization worker, authentication service, or printer is ready.

Export the inferred health-response type.

## 10. Integrate the Stall Service

Add `@polivo/contracts` to the stall-service dependencies using:

`workspace:*`

Update the health endpoint to use the shared schema and inferred type.

Validate the response at runtime before returning it.

Requirements:

- Import through the package’s public exports.
- Do not import from `packages/contracts/src` using relative paths.
- Preserve the existing health endpoint behavior.
- Keep the application-construction and server-startup separation intact.
- Ensure the compiled service can resolve the built contracts package.

Do not add business endpoints or a general API client.

Do not connect the desktop or web application to the stall service.

## 11. Update Workspace Build Behavior

Update root commands so:

- Contracts build before dependent applications.
- Type-checking includes the contracts package.
- A clean checkout can build without previously generated files.
- Development commands prepare the required contracts output.
- The shared-package editing workflow is documented.

Provide a working watch command for the contracts package if its compiled output is required during development.

Document when dependent processes need to restart after contract changes.

Do not rely on stale local build output.

Do not add a new build orchestrator solely for this phase.

## 12. Document Contract Usage

Create:

`docs/operations/contracts-and-validation.md`

Cover:

- Package responsibilities.
- Public import paths.
- Schema-first type inference.
- Input validation versus authorization.
- Identifier and timestamp conventions.
- Error-response conventions.
- Pagination.
- Versioning.
- Synchronization envelope limitations.
- How to build and watch the package.
- How future phases add concrete request, response, and event schemas.

Document that money, weight, commission boundaries, and payment rules will be defined from approved requirements in phase 08.

Do not prematurely choose financial precision, rounding, or monetary transport formats.

## Verification

Run the existing checks:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm build`
- `pnpm check`

Verify the contracts package using representative cases:

- Valid identifiers pass.
- Empty or oversized identifiers fail.
- Invalid timestamps and calendar dates fail.
- Invalid pagination limits fail.
- Unknown fields are rejected where strict objects are required.
- Public validation errors omit rejected values.
- Unsupported protocol versions fail validation.
- The synchronization envelope validates its supplied payload schema.
- Invalid health responses fail.

Use a small executable smoke check if needed. Do not introduce a competing test framework before phase 06.

Verify the compiled stall service starts and `/health` still returns the expected response.

Confirm that a clean build works without pre-existing contracts output.

## Scope Limits

For this phase:

- Do not implement financial calculations.
- Do not define unapproved commission, rounding, or payment rules.
- Do not create database schemas or migrations.
- Do not implement authentication or authorization.
- Do not implement synchronization transport or workers.
- Do not add billing, payment, farmer, or buyer endpoints.
- Do not implement application environment schemas for integrations that do not exist.
- Do not connect the desktop to the service.
- Do not create shared UI components.
- Do not commit or push automatically.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Contracts implemented.
- Zod version selected.
- Transport and versioning decisions.
- Health endpoint integration.
- Verification results.
- Deferred domain-dependent contracts.
- Any unresolved questions.
- Phase 06, `06-testing-and-continuous-integration.md`, as the next step.

Preserve the existing tracker format.

## Completion Report

Provide:

1. Files created or updated.
2. Public contracts and exports available.
3. Build and development workflow changes.
4. Validation and smoke-check results.
5. Unresolved decisions or blockers.
6. Whether phase 06 can begin.