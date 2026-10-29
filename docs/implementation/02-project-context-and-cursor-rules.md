# 02 — Project Context and Cursor Rules

## Goal

Integrate the six existing Polivo context files and configure repository instructions so Cursor follows the approved architecture, business requirements, and implementation sequence.

Do not initialize applications, install dependencies, or implement features in this phase.

## Before Starting

1. Read the existing root `AGENTS.md`, if present.
2. Inspect `docs/context`, `.cursor/rules`, and any other existing project instruction files.
3. Confirm that phase 01’s directory structure exists.
4. Locate the six user-provided context files within the repository or current chat attachments.
5. Preserve existing work and follow any applicable repository instructions.

Do not assume access to previous ChatGPT conversations. Use only source material actually available in the repository or current chat.

## Required Context Files

Use these canonical paths:

- `docs/context/project-overview.md`
- `docs/context/architecture.md`
- `docs/context/code-standards.md`
- `docs/context/ui-context.md`
- `docs/context/ai-workflow-rules.md`
- `docs/context/progress-tracker.md`

### Source Handling

- If a canonical file already exists, read it before making changes.
- If a supplied file exists elsewhere, compare it with the canonical version before copying.
- Preserve its requirements and meaning.
- Do not silently replace a newer file with an older version.
- Do not create competing copies of the same context.
- Do not delete or relocate source files without an explicit instruction.
- Remove `docs/context/.gitkeep` once the directory contains real context files.

If a required context file is unavailable, identify the exact missing filename and request its contents. Do not fabricate a replacement from assumptions.

Complete independent work where possible, but do not mark this phase complete until all six files are available and reviewed.

## Context File Responsibilities

### `project-overview.md`

Defines:

- Product purpose.
- Users and core workflows.
- Confirmed features.
- Scope exclusions.
- Operational and performance targets.

### `architecture.md`

Defines:

- Application and package responsibilities.
- Local and cloud data ownership.
- Authentication boundaries.
- LAN communication.
- Synchronization and recovery architecture.

### `code-standards.md`

Defines:

- Coding conventions.
- Package boundaries.
- Validation and error handling.
- Testing expectations.
- Security and maintainability standards.

### `ui-context.md`

Defines:

- Polivo’s visual language.
- Color and component tokens.
- Layout and interaction conventions.
- Keyboard behavior.
- Accessibility and feedback requirements.

### `ai-workflow-rules.md`

Defines:

- How Cursor should approach each implementation phase.
- Scope and dependency checks.
- Verification expectations.
- Handling of uncertainty.
- Progress updates and completion reports.

### `progress-tracker.md`

Records:

- Current implementation state.
- Completed and active work.
- Next steps.
- Open questions.
- Architecture decisions.
- Information needed to resume work.

## Review Consistency

Review all six files together.

Check their consistency with the established architecture:

- Next.js web application.
- Electron + React + Vite desktop application.
- Fastify stall service.
- One authoritative SQLite database per stall.
- Multiple terminals connecting through the stall service.
- Supabase PostgreSQL holding synchronized data for remote reporting.
- Clerk for online authentication.
- Local staff sessions and device credentials for offline operations.
- Transactional outbox synchronization.
- Local business records retained after successful synchronization.
- Initially read-only web access to synchronized financial records.

Also check that the UI context preserves Polivo’s light interface and keyboard-first operational workflows.

If a source conflicts with these expectations, record the conflict. Do not silently rewrite the source or choose a business rule.

### Business Rules Requiring Particular Care

Check whether the source files explicitly resolve:

- Commission units, bands, boundaries, and category overrides.
- Money and weight precision.
- Rounding and packaging deductions.
- Buyer and farmer bill grouping.
- Bill numbering.
- Payment allocation and partial settlement.
- Cheque clearance and balance effects.
- Corrections, cancellations, and returns.
- Staff permissions.
- Offline access expiry and revocation.
- Backup retention and recovery expectations.

Do not treat examples as approved production rules.

Record unresolved decisions in the progress tracker. Block only the implementation that depends on them.

## Create or Update Root `AGENTS.md`

Create the root `AGENTS.md` if it does not exist.

If it exists, merge the following guidance without deleting unrelated instructions or duplicating equivalent rules.

Keep this file concise. Reference the canonical context files rather than copying their full contents.

### Required Guidance

Include instructions that tell coding agents to:

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

### Architecture Boundaries

Include these concise rules:

- Desktop terminals access business data through the stall-service API.
- Only the stall service opens the local SQLite database.
- The Electron renderer must not receive unrestricted Node.js access or privileged credentials.
- Shared domain logic must remain independent of UI frameworks and database clients.
- Cloud tenant access must be authorized server-side.
- Financial changes must preserve transaction integrity and auditability.
- Successful synchronization must not delete local business records.
- Finalized financial records must use approved correction workflows rather than silent overwrites.

Do not claim that all technical operations require user confirmation. Proceed autonomously with reversible work inside the requested phase.

## Configure Cursor Project Rules

Create or update:

`.cursor/rules/00-polivo-project.mdc`

Use a short, always-applied rule that directs Cursor to the repository instructions and canonical context.

Use this metadata at the beginning:

    ---
    description: Polivo project context and implementation workflow
    alwaysApply: true
    ---

The rule body must instruct Cursor to:

- Read and follow the root `AGENTS.md`.
- Use the six files under `docs/context` as the canonical project context.
- Read the current numbered guide under `docs/implementation`.
- Check `docs/context/progress-tracker.md` before starting work.
- Stay within the current phase.
- Record unresolved questions rather than invent business behavior.
- Update progress and report verification results before finishing.

Keep detailed requirements in their canonical files.

Do not duplicate the full architecture, coding standards, or UI specification inside the Cursor rule.

### Existing Rules

If `.cursor/rules` already contains instructions:

- Read them before editing.
- Preserve relevant existing rules.
- Avoid duplicate always-applied guidance.
- Report contradictory instructions.
- Do not create a legacy `.cursorrules` file alongside the new rule.
- If a legacy `.cursorrules` file already exists, inspect it and report any migration work needed without silently deleting it.

## Establish Decision Records

Create:

`docs/decisions/README.md`

Explain that this directory stores approved architecture decisions and significant business-rule resolutions.

Include this lightweight format for future records:

- Title and identifier.
- Status: Proposed, Accepted, or Superseded.
- Date.
- Context and source.
- Decision.
- Reasoning.
- Consequences.
- Related implementation phases.

Use sequential filenames such as:

`0001-short-decision-title.md`

Do not create accepted decision records for unresolved questions.

Keep the current list of unresolved questions in `progress-tracker.md` and link to decision records when those questions are resolved.

Remove `docs/decisions/.gitkeep` once this directory contains the README.

## Update the Progress Tracker

Preserve the existing format and these headings:

- Current Phase
- Current Goal
- Completed
- In Progress
- Next Up
- Open Questions
- Architecture Decisions
- Session Notes

Record:

- Phase 01 as complete only if its structure has been verified.
- Integration and review of the six context files.
- Creation or update of `AGENTS.md`.
- Creation or update of the Cursor project rule.
- Creation of the decision-record guidance.
- Any missing sources or unresolved conflicts.
- Phase 03, `03-monorepo-tooling-and-environment.md`, as the next implementation step.

Mark phase 02 complete only when its required files and checks are complete.

Do not record planned features as implemented.

## Scope Limits

For this phase:

- Do not install dependencies.
- Do not initialize Next.js, Electron, Vite, or Fastify.
- Do not create application code.
- Do not create database schemas or migrations.
- Do not configure Clerk, Supabase, or Vercel.
- Do not create environment files or credentials.
- Do not invent business rules or replace missing source documents.
- Do not generate the remaining implementation guides.
- Do not commit or push automatically.

## Check When Done

Verify that:

- All six canonical context files exist and have been reviewed.
- Existing source content has been preserved.
- Context conflicts and unresolved decisions are recorded.
- Root `AGENTS.md` references the correct paths.
- The Cursor rule exists with `alwaysApply: true`.
- Existing rules have no silently introduced conflicts.
- Decision-record guidance exists.
- The progress tracker accurately reflects the work.
- No application code, dependencies, credentials, or runtime data were added.

Review `git diff` and `git status --short`.

No build or application test run is required for this documentation-only phase.

## Completion Report

Provide:

1. Files created or updated.
2. Context sources used.
3. Missing files, contradictions, or unresolved decisions.
4. Verification performed.
5. Whether phase 02 is complete and phase 03 can begin.
