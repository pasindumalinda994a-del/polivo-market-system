# Polivo Market System — Agent Instructions

Coding agents working in this repository must follow these instructions. Detailed product, architecture, coding, UI, and workflow requirements live in the canonical context files; do not duplicate them here.

## Canonical Context

Read these files at the start of a new project session:

1. `docs/context/project-overview.md`
2. `docs/context/architecture.md`
3. `docs/context/code-standards.md`
4. `docs/context/ui-context.md`
5. `docs/context/ai-workflow-rules.md`
6. `docs/context/progress-tracker.md`

Before changing code, also read the current numbered guide under `docs/implementation/` and inspect the existing implementation plus the progress tracker.

## Required Behavior

1. Read all six context files when starting a new project session.
2. Read the current numbered implementation guide before changing code.
3. Inspect the existing implementation and progress tracker before planning changes.
4. Follow explicit current user instructions and the approved project context.
5. Surface contradictions instead of resolving material business or architecture conflicts through guesswork.
6. Implement only the current phase and its necessary prerequisites.
7. Preserve existing work and avoid unrelated refactoring.
8. Keep secrets, production data, backups, and runtime databases outside the repository.
9. Run checks appropriate to the changes.
10. Update the progress tracker after meaningful implementation work.
11. Report actual results, blockers, and checks that were not run.
12. Avoid automatic commits, pushes, deployments, or destructive operations unless requested.

Proceed autonomously with reversible work inside the requested phase. Do not invent business rules or treat examples as approved production behavior. Record unresolved questions in `docs/context/progress-tracker.md` and link accepted decisions under `docs/decisions/` when resolved.

## Architecture Boundaries

- Desktop terminals access business data through the stall-service API.
- Only the stall service opens the local SQLite database.
- The Electron renderer must not receive unrestricted Node.js access or privileged credentials.
- Shared domain logic must remain independent of UI frameworks and database clients.
- Cloud tenant access must be authorized server-side.
- Financial changes must preserve transaction integrity and auditability.
- Successful synchronization must not delete local business records.
- Finalized financial records must use approved correction workflows rather than silent overwrites.
