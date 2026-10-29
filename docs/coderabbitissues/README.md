# CodeRabbit Review Issues

This folder records CodeRabbit findings for pull requests so they can be reviewed, triaged, and resolved deliberately.

Do not treat a CodeRabbit comment as an automatic change request. Capture it here first, decide disposition, then implement or defer with a short rationale.

## When to add a file

Create or update a record when:

- CodeRabbit comments on a PR you own or are resolving
- You want a durable triage trail before editing code
- A finding is deferred and must not be forgotten

Skip trivial nits that are fixed immediately with no lasting decision, unless the team wants a complete audit trail for that PR.

## Naming

Use one markdown file per PR review cycle:

```text
YYYY-MM-DD-pr-<number>-<short-slug>.md
```

Examples:

- `2026-10-29-pr-3-phase-06-testing-ci.md`
- `2026-11-04-pr-12-stall-service-auth.md`

If the PR number is unknown yet, use the branch or phase slug and rename when the PR number is available:

```text
YYYY-MM-DD-branch-<branch-name>.md
```

## File workflow

1. **Capture** — copy findings into the PR file while status is `open`.
2. **Triage** — set disposition per finding (`fix`, `defer`, `wontfix`, `already-fixed`).
3. **Resolve** — implement accepted fixes; note commit or PR follow-up.
4. **Close** — set the file status to `resolved` or `partially-resolved` when triage is complete.

Keep unresolved product or architecture questions in `docs/context/progress-tracker.md`. Promote lasting design choices to `docs/decisions/` when accepted.

## Recommended sections

Each PR file should include:

| Section    | Purpose                                               |
| ---------- | ----------------------------------------------------- |
| Metadata   | Date, PR link/number, branch, phase, overall status   |
| Summary    | Short table of findings with severity and disposition |
| Findings   | One subsection per CodeRabbit item                    |
| Follow-ups | Deferred work, required GitHub settings, related docs |

## Finding fields

For each finding, record:

- **ID** — stable local id (`CR-01`, `CR-02`, …)
- **Severity** — as reported (for example Major / Minor)
- **Category** — Security, Functional Correctness, etc.
- **Location** — file and nearby lines or job name
- **Summary** — what CodeRabbit claimed
- **Recommendation** — proposed fix in plain language
- **Disposition** — `open` \| `fix` \| `defer` \| `wontfix` \| `already-fixed`
- **Resolution** — what was done, or why not; link commits/docs when useful

## Disposition guide

| Disposition     | Meaning                                                         |
| --------------- | --------------------------------------------------------------- |
| `fix`           | Accept and implement in this PR or an immediate follow-up       |
| `defer`         | Valid, but not in current phase scope; track a follow-up        |
| `wontfix`       | Incorrect, out of policy, or outweighed by an accepted decision |
| `already-fixed` | Addressed before triage completed                               |

## Relationship to other docs

- `docs/context/progress-tracker.md` — phase status and open product questions
- `docs/decisions/` — accepted long-lived architecture or business decisions
- `docs/operations/` — lasting process or CI guidance after a fix lands

This folder is a review triage log, not a second decision registry.
