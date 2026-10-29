# CodeRabbit — Phase 06 Testing and CI

## Metadata

| Field          | Value                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Date           | 2026-10-29                                                                                      |
| Branch         | `development`                                                                                   |
| Phase          | 06 — Testing and continuous integration                                                         |
| PR             | Rename this file to include the PR number when known (`YYYY-MM-DD-pr-N-phase-06-testing-ci.md`) |
| Source         | CodeRabbit bot comments on CI / contracts changes                                               |
| Overall status | `resolved`                                                                                      |

## Summary

| ID    | Severity | Category               | Location                                            | Disposition |
| ----- | -------- | ---------------------- | --------------------------------------------------- | ----------- |
| CR-01 | Minor    | Security & Privacy     | `.github/workflows/ci.yml` — all checkout steps     | `fix`       |
| CR-02 | Minor    | Security & Privacy     | `.github/workflows/ci.yml` — third-party actions    | `fix`       |
| CR-03 | Major    | Functional Correctness | `.github/workflows/ci.yml` — typecheck order        | `fix`       |
| CR-04 | Minor    | Functional Correctness | `packages/contracts/tsconfig.json` — test typecheck | `fix`       |

## Findings

### CR-01 — Disable checkout credential persistence

- **Severity:** Minor
- **Category:** Security & Privacy (CWE-522)
- **Location:** `.github/workflows/ci.yml` — Checkout steps in `quality-and-build`, `web-e2e`, and `desktop-smoke`
- **Summary:** Default checkout credential persistence leaves `GITHUB_TOKEN` available to later install/build/test steps. `permissions: contents: read` limits authority but does not prevent disclosure if executed code exfiltrates the token.
- **Recommendation:** Set `persist-credentials: false` on every `actions/checkout` step.
- **Disposition:** `fix`
- **Resolution:** Set `persist-credentials: false` on all three Checkout steps in `.github/workflows/ci.yml`.

### CR-02 — Pin third-party actions to commit SHAs

- **Severity:** Minor
- **Category:** Security & Privacy (CWE-494)
- **Location:** `.github/workflows/ci.yml` — `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`
- **Summary:** Mutable version tags can move. Supply-chain hardening prefers immutable full commit SHAs for third-party actions.
- **Recommendation:** Replace each tagged `uses:` reference with a reviewed full commit SHA (optionally keep the tag in a trailing comment for readability).
- **Disposition:** `fix`
- **Resolution:** Pinned actions to commit SHAs with `# v4` comments: `actions/checkout@11d5960a…`, `pnpm/action-setup@b906affc…`, `actions/setup-node@49933ea5…`, `actions/upload-artifact@ea165f8d…`.

### CR-03 — Build contracts before typechecking stall-service

- **Severity:** Major
- **Category:** Functional Correctness
- **Location:** `.github/workflows/ci.yml` — `quality-and-build` job, Typecheck step
- **Summary:** On a clean CI checkout, `pnpm typecheck` reaches `@polivo/stall-service` importing `@polivo/contracts` before `dist/index.d.ts` exists. Root `pnpm build` runs later, so typecheck can fail before tests and builds.
- **Recommendation:** Build `@polivo/contracts` before the typecheck step (or otherwise make typechecking resolve contracts source).
- **Disposition:** `fix`
- **Resolution:** Root `package.json` `typecheck` now runs `pnpm --filter @polivo/contracts build` before package typechecks, so CI’s existing `pnpm typecheck` step and local runs both get contracts `dist/` first.

### CR-04 — Type-check excluded contract and integration tests

- **Severity:** Minor
- **Category:** Functional Correctness
- **Location:** `packages/contracts/tsconfig.json` — `exclude: ["src/**/*.test.ts"]`; integration tests under `tests/integration/`
- **Summary:** Contract unit tests are excluded from the contracts TypeScript project. Integration tests are outside package `include` patterns. Root `typecheck` therefore does not type-check those suites. CodeRabbit suggests a dedicated `tsconfig.test.json` (with `allowImportingTsExtensions` for `.ts` imports) included from `typecheck`.
- **Recommendation:** Add a no-emit test TypeScript project covering contracts and integration tests, and wire it into root `typecheck`.
- **Notes:** CodeRabbit also stated that ESLint is not type-aware today, so no ESLint parser change is required for this item.
- **Disposition:** `fix`
- **Resolution:** Added root `tsconfig.test.json` (`noEmit`, `allowImportingTsExtensions`, `@polivo/contracts` path alias) covering contracts sources/tests, integration tests, and stall-service sources. Wired `tsc --noEmit -p tsconfig.test.json` into root `typecheck`. Added root `@types/node@26.6.6` for the test project. Documented in `docs/operations/testing-and-ci.md`.

## Follow-ups

- After the PR number is known, rename this file to `2026-10-29-pr-<number>-phase-06-testing-ci.md` and add the PR URL to Metadata.
- After remote CI’s first successful run, mark `quality-and-build`, `web-e2e`, and `desktop-smoke` as required checks (tracked in phase 06 progress notes; not a CodeRabbit finding).
