# Architecture Context

## Stack

| Layer | Technology | Role |
| ----- | ---------- | ---- |
| Language | TypeScript | Shared language across the web application, desktop application, local service, and shared packages. |
| Web Framework | Next.js + React | Public website, stall onboarding, account administration, application downloads, and remote reporting dashboard. |
| Desktop Application | Electron + React + Vite | Installable application for keyboard-first billing, local operations, and printer interaction. |
| UI | Tailwind CSS + shadcn/ui | Shared design foundations and accessible interface components, adapted to web and desktop workflows. |
| Local Backend | Node.js + Fastify | Stall service providing the local API, authorization, business operations, database access, and synchronization worker. |
| Online Authentication | Clerk | Online user authentication and account identity for onboarding and web access. |
| Offline Access | Stall-service-managed device credentials and local staff sessions | Authorizes previously provisioned devices and staff during internet outages, subject to an explicit offline access policy. |
| Local Database | SQLite in WAL mode | Authoritative operational database for one stall, accessed exclusively by its stall service. |
| Cloud Database | Supabase PostgreSQL | Tenant membership, registered devices, synchronized operational records, and remote reporting data. |
| Cloud API | Next.js server-side API routes | Authenticated synchronization ingestion, device provisioning, tenant authorization, and reporting endpoints. |
| Shared Validation | Zod | Runtime validation of API requests, responses, configuration, and synchronization messages. |
| Synchronization | Transactional outbox + background worker | Durable delivery of committed local changes to the cloud with retries, acknowledgements, and duplicate prevention. |
| Source Control | GitHub | Versioned monorepo containing applications, shared packages, migrations, and project context. |
| Web Hosting | Vercel | Hosts the Next.js website, dashboard, and cloud API. Local billing does not depend on Vercel availability. |

## System Boundaries

- `apps/web/` — Owns the public website, onboarding, account administration, application download pages, and remote dashboard. Reads synchronized financial data through authorized server-side operations. Does not directly modify local operational financial records.

- `apps/web/src/app/api/` — Owns the initial cloud API deployment, including device provisioning, synchronization ingestion, and reporting endpoints. Validates identity, tenant membership, device scope, and incoming payloads. Does not run persistent background workers.

- `apps/desktop/` — Owns the Electron application, billing interface, keyboard navigation, connection status, and printing workflow. Sends business commands to the stall service. Does not directly access SQLite or independently finalize financial calculations.

- `apps/desktop/src/main/` — Owns privileged Electron operations such as operating-system integration, printer access, and desktop updates. Exposes only explicitly permitted functionality through the preload bridge.

- `apps/desktop/src/preload/` — Owns the narrow, validated interface between the renderer and privileged desktop functionality. Does not expose unrestricted filesystem, shell, or Node.js access.

- `apps/desktop/src/renderer/` — Owns the React interface and transient UI state. Displays service-calculated results and submits user actions through approved interfaces.

- `apps/stall-service/` — Owns local staff authorization, business validation, sale finalization, bill numbering, farmer allocations, payments, balances, audit records, SQLite access, and synchronization. Runs independently of the desktop window lifecycle.

- `packages/domain/` — Owns shared business definitions, pure calculation functions, and confirmed financial rules. Contains no database, browser, Electron, or network dependencies. The stall service remains the authority that executes and persists operational decisions.

- `packages/contracts/` — Owns versioned API schemas, command types, response types, synchronization event definitions, and shared validation. Contains no database credentials or persistence implementation.

- `packages/ui/` — Owns reusable presentation components and design tokens. Contains no financial authority, database access, or privileged desktop operations.

- `packages/db-local/` — Owns the SQLite schema, local migrations, and local persistence code. Imported only by the stall service and its controlled maintenance tools.

- `packages/db-cloud/` — Owns the PostgreSQL schema, cloud migrations, and server-side persistence code. Imported only by authorized cloud backend code.

- `docs/context/` — Owns the six shared context files, including project scope, architecture, and implementation constraints. Records unresolved decisions explicitly.

## Storage Model

- **Local Operational Database — SQLite**: Stores stall-scoped farmers, buyers, vegetables, package weights, sales, bill records, commissions, payments, payment allocations, financial entries, audit records, local authorization state, and synchronization metadata.

- **Database Ownership**: Each stall has one authoritative operational database on its designated host computer. Additional terminals use the stall service over the local network. The SQLite file is never shared through a network folder.

- **Single-Computer Installation**: The desktop application and stall service run on the same computer. The desktop connects to the service locally.

- **Multiple-Computer Installation**: One designated computer or dedicated host runs the stall service and database. All terminals connect to that host. Internet failure does not stop local operations, but host or local-network failure can prevent connected terminals from billing.

- **Cloud Database — Supabase PostgreSQL**: Stores platform tenant membership, device registrations, and synchronized copies of stall operational records for remote reporting. Financial records remain locally authoritative in the initial release.

- **Transactional Outbox**: Stores synchronization events in the same local database transaction as their associated business changes. Events remain pending until the cloud confirms successful processing.

- **Cloud Ingestion Records**: Store processed event identifiers and synchronization checkpoints so retries cannot apply the same financial change twice. Cloud record updates and their ingestion acknowledgements must be committed consistently.

- **Desktop Local Settings**: Store non-authoritative preferences such as printer selection, interface preferences, and stall-service connection settings. Device secrets use operating-system-protected credential storage.

- **Files and Release Storage**: Holds approved installation packages, update artifacts, and optional exports. Release artifacts require integrity verification. Exported reports do not become authoritative financial records.

- **Backups**: Use SQLite-aware backup procedures and protected storage separate from the active database. Cloud synchronization is not a replacement for backups. Restoration procedures must account for existing synchronization identities and checkpoints.

- **Data Retention**: Successful cloud synchronization does not delete local financial records. Retention and archival require an explicit policy.

- **Financial Representation**: Monetary values use integer minor units or exact decimal representations. Weights use a defined precision and unit. Business calculations must not depend on unrestricted floating-point arithmetic.

## Auth and Access Model

- Clerk authenticates users for online onboarding and web access. Cloud endpoints verify authentication and resolve authorized tenant membership server-side.

- Each stall is a tenant. Tenant membership determines which users may access that stall and what actions they may perform.

- Tenant identifiers supplied by clients are never trusted alone. Every request is checked against the authenticated user or registered device’s permitted tenant.

- Desktop devices are provisioned online and bound to a specific stall. Device identity and staff identity are separate: an authorized device does not automatically grant every staff permission.

- The stall service authenticates staff and enforces permissions for every local business command. Hiding a button in the interface is not access control.

- Offline access is available only to previously provisioned users and devices under a documented policy. Maximum offline duration, credential expiry, and revocation handling must be defined before production rollout.

- Local permissions cannot receive cloud revocations while disconnected. The system must expose this limitation and apply refreshed authorization information when connectivity returns.

- Desktop-to-service connections use authenticated, protected communication. Being connected to the stall’s local network does not establish trust.

- Electron uses context isolation, sandboxing where supported, and disabled Node.js integration in the renderer. Privileged operations pass through a restricted preload interface.

- Synchronization uses a revocable, stall-scoped device identity. Clerk secret keys and Supabase service-role credentials must never be shipped inside desktop applications.

- Cloud database access is restricted to authorized server-side operations. Row-level security protects any tables exposed through Supabase’s client-accessible APIs; privileged server operations still enforce tenant isolation explicitly.

- The initial web dashboard provides read-only access to synchronized operational financial records. Online account administration does not imply permission to rewrite locally authoritative sales or payments.

## Invariants

1. **One operational authority per stall:** Only the stall service reads and writes the active SQLite operational database.

2. **Local-first billing:** Finalizing a local sale must not require a successful cloud request or a live Clerk session.

3. **Atomic financial writes:** A finalized business operation commits its related records, audit entries, and outbox events together, or none of them.

4. **One sale, multiple views:** Buyer bills, farmer allocations, commissions, and reports derive from the same underlying sale records. Staff must not re-enter the sale separately for each party.

5. **Service-owned calculations:** The stall service validates inputs and calculates final financial amounts. Client-calculated totals are previews, not trusted values.

6. **Retry-safe commands:** Repeating a finalization or payment request after a timeout must not create another financial transaction. Local commands and cloud synchronization both require duplicate protection.

7. **Tenant isolation:** Every tenant-owned record and operation is scoped to the authorized stall. No endpoint may rely solely on a client-supplied tenant identifier.

8. **Durable synchronization:** A local operation is acknowledged only after its database transaction commits. Pending changes survive service restarts and remain queued until successfully acknowledged by the cloud.

9. **Ordered state application:** Delayed synchronization events must not overwrite newer record versions. Versioning and dependency handling are defined in the synchronization contract.

10. **Local retention:** Cloud acknowledgement does not remove local financial history.

11. **Traceable corrections:** Finalized financial records are not silently deleted or overwritten. Corrections follow defined reversal or adjustment workflows with actor, time, and reason recorded.

12. **Printing does not create sales:** A failed print or reprint must not finalize another transaction.

13. **No shared-file SQLite:** Terminals communicate through the stall service API. They never open the host’s SQLite file over a network share.

14. **Bounded cloud requests:** Cloud request handlers perform bounded work. The persistent synchronization worker runs in the stall service.

15. **Visible data freshness:** Remote reports indicate synchronization freshness. Unsynchronized cloud data must not be presented as guaranteed current local state.

16. **Controlled upgrades:** Database migrations and application updates preserve data and enforce compatible desktop, service, API, and event versions.

17. **No invented financial rules:** Commission units, price-band boundaries, deductions, rounding, cheque effects, and settlement rules must be confirmed and documented before implementation.

18. **Measured capacity:** Support for 300–500 stalls and the target billing throughput must be verified through representative testing; the selected stack alone does not establish capacity.