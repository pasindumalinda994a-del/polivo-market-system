# Code Standards

## General

- Keep modules small, focused, and responsible for one concern.
- Fix root causes instead of adding repeated workarounds.
- Follow the boundaries defined in `architecture.md`. Do not introduce new services, frameworks, or dependencies without a clear need.
- Keep business rules separate from UI components, API handlers, database queries, and hardware integration.
- Define shared business rules once in `packages/domain/`. The stall service validates and applies them when committing operational transactions.
- Use clear, descriptive names. Avoid unexplained abbreviations except established domain terms.
- Document why a decision exists when the reason is not obvious from the code.
- Treat unresolved requirements as explicit decisions to resolve. Do not invent commission rules, rounding behavior, payment allocation logic, or permissions.
- Handle failures explicitly. Never silently ignore failed database writes, synchronization operations, or financial calculations.
- Keep secrets, credentials, personal information, and complete financial payloads out of application logs.
- Add meaningful tests for financial calculations, permissions, transaction boundaries, duplicate prevention, and recovery behavior.
- Run type checking, linting, and relevant tests before merging. Review generated code and CodeRabbit feedback rather than accepting either automatically.

## TypeScript

- Enable strict mode throughout all applications and shared packages.
- Avoid `any`. Use `unknown` for untrusted values and narrow them through validation.
- Validate external input at system boundaries, including API requests, synchronization events, Electron IPC messages, configuration, and imported files.
- Use shared runtime schemas and infer TypeScript types from them where practical. Avoid maintaining separate definitions that can drift apart.
- Remember that TypeScript types do not validate runtime data.
- Use explicit domain types for monetary amounts, weights, identifiers, permissions, and transaction states.
- Distinguish internal record identifiers from human-readable bill numbers and party short codes.
- Represent money with integer minor units or an approved exact-decimal approach. Use defined precision and units for weights.
- Do not use ordinary floating-point arithmetic for authoritative financial calculations.
- Use discriminated unions for meaningful states such as payment status, synchronization status, and command results.
- Avoid non-null assertions and type casts that hide missing validation.
- Handle caught errors as unknown values and convert them into safe, structured application errors.

## Next.js, React, Electron, and Stall Service

- Default to Server Components in the Next.js application. Add `"use client"` only where browser interactivity requires it.
- Keep server-only database code and secrets out of client imports and browser bundles.
- Treat route handlers and Server Actions as entry points: authenticate, validate, authorize, call the appropriate service, and format the result.
- Apply the same authorization requirements to Server Actions as to API routes.
- Prevent tenant-specific reports from entering shared caches. Any explicit caching must account for tenant identity and access permissions.
- Keep React components focused on presentation and interaction. Extract complex workflow behavior into focused hooks or application modules.
- Treat desktop form state as an unsaved draft until the stall service confirms a committed operation.
- Never display a successful save or payment solely because an optimistic UI update completed.
- Keep Electron main-process, preload, and renderer responsibilities separate.
- Disable Node.js integration in the renderer, enable context isolation, and use sandboxing where supported.
- Expose narrowly scoped preload methods. Never expose unrestricted shell execution, filesystem access, or generic IPC forwarding.
- Validate IPC senders and payloads before executing privileged operations.
- Keep printer access and operating-system integration outside React components.
- Run the stall service independently of the desktop window lifecycle. Closing one terminal must not stop service for other terminals.
- Keep Fastify handlers thin. Business services own workflows; persistence modules own database access.
- Avoid blocking the UI thread or holding database transactions open during printing, network requests, or other slow operations.
- Use managed startup, shutdown, and worker lifecycles. Prevent overlapping synchronization jobs from processing the same work unsafely.

## Styling

- Use shared design tokens for colors, spacing, typography, borders, and radii.
- Follow `ui-context.md` once defined. Do not invent a separate design system for each application.
- Prefer shared Tailwind utilities and reusable UI components over duplicated styles.
- Avoid arbitrary values unless the requirement cannot reasonably use an existing token.
- Keep business logic, permissions, database access, and privileged operations out of shared UI components.
- Design the desktop billing interface for keyboard use: predictable tab order, visible focus, clear shortcuts, and reliable focus restoration.
- Scope keyboard shortcuts to the active screen or dialog. Do not unexpectedly override text entry or standard editing shortcuts.
- Provide accessible labels and use semantic controls. Do not communicate errors, payment states, or synchronization status through color alone.
- Keep billing layouts stable during data entry. Loading indicators and validation messages must not unexpectedly move active controls.
- Make pending, saved, failed, offline, and synchronized states visually distinct.
- Prefer clarity and responsiveness over decorative animation in operational screens.

## API Routes

- Apply authentication, payload limits, schema validation, and authorization before business processing.
- Enforce tenant scope and operation-specific permissions on every protected request.
- Resolve permitted tenants from verified user membership or device credentials. Never trust a submitted `tenantId` alone.
- Authorize access to individual records as well as the requested operation.
- Use consistent response shapes and documented HTTP status codes.
- Return stable machine-readable error codes with safe, understandable messages.
- Include request or correlation identifiers for troubleshooting without exposing sensitive details.
- Validate identifiers, dates, weights, monetary values, pagination parameters, and allowed state transitions.
- Use parameterized queries. Never construct SQL by concatenating untrusted input.
- Require idempotency identifiers for retryable financial commands. Repeated submissions with the same identifier and payload must return the original result without creating another transaction.
- Reject reuse of an idempotency identifier with a different payload.
- Validate record versions where concurrent updates could overwrite another user's work.
- Keep local command handling and cloud ingestion independently protected against duplicates.
- Commit cloud event application and its processed-event marker consistently before acknowledging synchronization.
- Use bounded pagination for lists and reports. Avoid unbounded queries and oversized synchronization batches.
- Define timeouts and retry behavior explicitly. Retry transient failures with bounded backoff; do not repeatedly retry invalid or unauthorized requests.
- Version contracts when making incompatible changes and handle unsupported clients explicitly.
- Never start persistent background workers inside Next.js request handlers.

## Data and Storage

- Only the stall service and controlled maintenance tools may access the active local SQLite database.
- Never open the SQLite database through a network-shared folder.
- Keep local and cloud persistence implementations separate. Share domain rules and contracts rather than database-specific code.
- Store related financial changes, required audit entries, and synchronization outbox events in one local database transaction.
- Keep transactions short. Perform printing and cloud delivery after the local commit.
- Enforce data integrity with foreign keys, uniqueness constraints, required fields, and appropriate checks.
- Scope party short codes, human-readable bill numbers, and tenant-owned relationships correctly. Application validation alone is insufficient.
- Generate record and event identifiers that remain stable across retries and synchronization.
- Preserve the prices, commission rates, and rule versions applied to finalized transactions. Later configuration changes must not rewrite historical totals.
- Apply confirmed rounding rules consistently and test boundary cases.
- Preserve individual package weights and their farmer ownership when calculating aggregate totals.
- Treat balances as derived financial information. Any stored balance summary must remain reconcilable with its underlying entries.
- Do not silently modify or delete finalized financial history. Use documented corrections, reversals, or adjustments with an audit trail.
- Record timestamps consistently and apply the stall's configured timezone when determining business dates and displaying reports.
- Keep pending synchronization events durable across restarts. Clear or archive acknowledged events only under a defined retention policy.
- Do not delete local financial records after cloud synchronization.
- Store large files, installers, and exports in appropriate file or object storage. Keep their ownership, identifiers, and relevant metadata in the database.
- Keep secrets in protected runtime configuration or operating-system credential storage, never in source code or ordinary application settings.
- Version database migrations and test them against representative existing data. Do not modify migrations already applied to deployed installations.
- Use SQLite-aware backup procedures. Test restoration, including synchronization checkpoints and duplicate protection, before production rollout.

## File Organization

- `apps/web/` — Next.js website, onboarding, account administration, download pages, and remote dashboard.
- `apps/web/src/app/api/` — Cloud API entry points for provisioning, synchronization ingestion, and reporting.
- `apps/web/src/server/` — Server-only authorization, application services, and cloud backend orchestration.
- `apps/desktop/src/main/` — Electron lifecycle, protected credentials, printing, updates, and privileged operating-system integration.
- `apps/desktop/src/preload/` — Restricted, typed bridge between the renderer and Electron main process.
- `apps/desktop/src/renderer/` — Desktop React screens, form state, keyboard workflows, and presentation logic.
- `apps/stall-service/src/routes/` — Local API registration, boundary validation, and response handling.
- `apps/stall-service/src/services/` — Authorized business operations and local transaction orchestration.
- `apps/stall-service/src/sync/` — Outbox processing, cloud delivery, acknowledgements, retries, and synchronization recovery.
- `apps/stall-service/src/auth/` — Device verification, local staff sessions, and permission enforcement.
- `packages/domain/` — Pure business rules, financial calculations, and domain definitions.
- `packages/contracts/` — Shared runtime schemas, API contracts, synchronization events, and IPC contracts.
- `packages/ui/` — Reusable presentation components and design tokens without privileged or business-service dependencies.
- `packages/db-local/` — SQLite schema, migrations, queries, and persistence utilities.
- `packages/db-cloud/` — PostgreSQL schema, migrations, and server-only persistence utilities.
- `docs/context/` — The six shared project context files.
- `tests/integration/` — Cross-module verification of transactions, authorization, synchronization, and recovery.
- `tests/e2e/` — Critical user workflows such as billing, payment allocation, printing retries, and offline operation.
- `scripts/` — Explicit development and maintenance commands. Destructive operations require clear safeguards.
- Place focused unit tests beside the code they verify. Organize feature-specific components within their owning application rather than placing unrelated code in generic utility folders.