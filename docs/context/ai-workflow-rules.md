# AI Workflow Rules

## Approach

Build Polivo Market System incrementally using a spec-driven workflow. The six shared context files—`project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `ai-workflow-rules.md`, and `progress-tracker.md`—define the product, technical boundaries, implementation conventions, interface requirements, development process, and current progress.

Before implementing a feature, read the relevant context files and inspect the existing code. Identify the expected behavior, affected components, acceptance criteria, and unresolved requirements. Implement the smallest complete change that satisfies the agreed scope.

Treat Polivo as one system with distinct web, desktop, stall-service, and cloud responsibilities. Preserve local-first billing, one authoritative operational database per stall, tenant isolation, and traceable financial records throughout development.

Context files describe intended behavior; inspect the code and test results to establish what is actually implemented. Do not claim a feature is complete because it appears in a plan or because code was generated.

## Scoping Rules

- Work on one clearly defined feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Define acceptance criteria before implementation.
- Identify which application or shared package owns the change.
- Do not combine unrelated system boundaries in a single implementation step.
- A feature may span related boundaries when required for one complete workflow, such as submitting a desktop command and saving it through the stall service.
- Implement only the shared contracts needed for the current feature. Do not build speculative abstractions.
- Separate unrelated refactoring, dependency upgrades, and formatting changes from feature work.
- Reuse existing domain rules, contracts, and UI components before creating alternatives.
- Preserve existing user changes and avoid overwriting unrelated work.
- Keep production data and credentials out of development and automated tests.
- Do not introduce new frameworks, services, or deployment dependencies without documenting the need and obtaining agreement on the architectural change.

## When to Split Work

Split an implementation step if it combines:

- Unrelated web-dashboard and desktop-billing features.
- New local financial behavior and a substantial synchronization redesign.
- Multiple unrelated API routes or business workflows.
- Schema changes for several independent modules.
- Billing functionality with printer drivers, application updates, or other independent hardware and lifecycle changes.
- New authentication behavior with unrelated business features.
- Feature development with a broad refactor or dependency upgrade.
- Confirmed requirements with unresolved financial or product decisions.

Split large features into independently verifiable stages. For example, implement and test local sale finalization before adding cloud delivery, then test the complete synchronized workflow.

If a change cannot be verified end to end within a focused review cycle, the scope is too broad—split it. Do not split away transaction consistency or other safeguards required to make the current unit correct.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing dependent behavior.
- If a requirement is missing, record it as an open question in `progress-tracker.md`.
- Explain the decision needed, the affected workflow, and what work is blocked.
- Continue independent work that does not depend on the unresolved decision.
- Ask focused questions when the answer affects financial correctness, permissions, data ownership, or user-visible behavior.
- Resolve routine implementation details using existing conventions when they do not change agreed behavior or architecture.
- Distinguish confirmed requirements, proposed solutions, temporary development arrangements, and unresolved decisions.
- Do not treat a previous AI recommendation as an approved business rule.
- If context files conflict, document the conflict and resolve it before implementing affected behavior.
- Never assume commission units, price-band boundaries, deductions, rounding, cheque clearance, payment allocation, bill numbering, or correction rules.
- Never silently choose offline credential expiry, permission revocation behavior, backup retention, or conflict-resolution policies.
- Use mocks only where clearly identified. Do not mark a mocked integration as production-ready.
- When introducing a temporary workaround, document its limitation, removal condition, and follow-up task.

## Protected Files

Do not modify the following unless explicitly instructed:

- Third-party library internals, including files inside `node_modules/`.
- Generated UI library primitives, once identified as protected in the repository. Prefer wrappers or composed components for application-specific behavior.
- Database migration files already applied to deployed installations. Create a new migration instead.
- Production environment files, credentials, signing keys, or secret stores.
- Production database files, backup artifacts, and customer exports.
- Generated build outputs, packaged installers, and signed release artifacts. Regenerate them through the approved build process instead of editing them.
- Lockfiles by hand. Update them through the package manager only when an authorized dependency change requires it.

These protections do not prevent authorized changes to application code, new migrations, or development configuration. Inspect repository instructions before modifying files with additional ownership or protection rules.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or ownership boundaries.
- Storage models, schema responsibilities, or synchronization agreements.
- Authentication, permissions, or offline access behavior.
- Code conventions or development commands.
- UI patterns, keyboard interactions, or status presentation.
- Feature scope, acceptance criteria, or release boundaries.

Apply the following documentation rules:

- Update `project-overview.md` when approved goals, features, scope, or success criteria change.
- Update `architecture.md` when approved technical boundaries, storage ownership, access models, or invariants change.
- Update `code-standards.md` when agreed implementation conventions change.
- Update `ui-context.md` when agreed design rules or interaction patterns change.
- Update `ai-workflow-rules.md` when the development process changes.
- Update `progress-tracker.md` after each implementation unit with completed work, verification results, remaining tasks, and blockers.
- Record significant decisions with their rationale and affected components.
- Keep each shared rule defined in its owning context file; reference it elsewhere instead of maintaining conflicting copies.
- Do not rewrite specifications merely to make an incorrect implementation appear compliant.
- Document deviations and obtain agreement before treating them as the new intended behavior.
- Never record tests, integrations, or recovery procedures as passed unless they were actually executed successfully.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope and satisfies its acceptance criteria.
2. No invariant defined in `architecture.md` has been violated.
3. Financial changes preserve atomic writes, correct calculations, traceability, and duplicate prevention.
4. Protected operations enforce the appropriate tenant scope and permissions.
5. Relevant failure paths have been checked, such as duplicate submission, service interruption, or lost connectivity.
6. Meaningful tests for the affected behavior pass. Financial, authorization, synchronization, and recovery changes include appropriate automated coverage.
7. Type checking and linting pass for the affected code.
8. `npm run build` passes using the repository’s documented build configuration. If it does not cover an affected application or package, its required build also passes.
9. Relevant context files and `progress-tracker.md` reflect the actual implementation and verification results.
10. The final diff contains no unintended files, exposed secrets, unrelated edits, or undocumented workarounds.
11. The completion report states what changed, how it was verified, and any remaining limitations. If a required check could not run, report the unit as partially verified rather than fully complete.