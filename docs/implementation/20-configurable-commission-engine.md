# 20 — Configurable Commission Engine

## Objective

Implement the Polivo Market System commission engine using the approved business rules and existing local-first architecture.

This phase must deliver:

- Exact, deterministic commission calculations.
- Configurable default commission bands.
- Validated, immutable commission-policy versions.
- Authorized policy management through the stall service.
- A desktop configuration interface and calculation preview.
- Audit records and transactional outbox integration.
- Automated tests covering boundaries, precision, authorization, and policy changes.

Version 1 uses default commission bands only. Do not introduce vegetable-specific or category-specific overrides.

The engine will support later sales and farmer billing phases. This phase does not post financial transactions or generate bills.

---

## 1. Review the Existing Project

Before changing code, read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical files under `docs/context/`.
- The Phase 08 financial rules and decision register.
- Applicable architecture decision records.
- Existing commission-band tables and migrations.
- Existing money, weight, and decimal utilities.
- Phase 19 catalog and weight-entry implementation.
- Local authentication, capability checks, and session handling.
- Repository transaction, idempotency, revision, audit, and outbox conventions.
- Existing desktop form and service-connection patterns.

Inspect the actual repository to determine file locations and naming conventions.

Identify:

1. How commission is selected and calculated.
2. Whether rates represent currency per kilogram, percentages, or another approved basis.
3. Which price or amount determines the selected band.
4. Which weight or amount commission applies to.
5. Approved rounding precision and rounding stage.
6. Whether commission is calculated per sale line, grouped transaction, or bill.
7. Which roles may view and manage commission settings.
8. Which component is authoritative for commission configuration.

Summarize the confirmed rules before implementation.

Mark Phase 20 as `IN_PROGRESS` in the progress tracker.

Do not describe a rule as approved merely because it appeared in an example or an earlier draft.

---

## 2. Resolve the Commission Policy Contract

Use the approved Phase 08 rules as the source of truth.

Document the following policy decisions:

| Decision | Required definition |
|---|---|
| Policy scope | Stall, tenant, or other established scope |
| Band selection basis | Exact input used to select a band |
| Rate basis | Currency per weight unit, percentage, or approved alternative |
| Chargeable basis | Approved weight or amount |
| Boundaries | Inclusive and exclusive endpoints |
| Supported range | Minimum and maximum eligible input |
| Precision | Price, rate, weight, and money precision |
| Rounding | Mode and point at which rounding occurs |
| Aggregation | Per line, transaction, or bill |
| Activation | When a new version applies |
| Historical behavior | How finalized records retain their original commission |

Do not invent production values, rounding rules, or threshold semantics.

If a required financial decision remains unresolved:

- Record the unresolved decision clearly.
- Continue implementation of independent validation, versioning, and UI mechanics.
- Keep activation or calculation dependent on that decision unavailable.
- Return an explicit configuration error.
- Do not silently choose a default or return zero commission.

Synthetic policies may be used in automated tests. Clearly identify them as test fixtures and exclude them from production seeds.

---

## 3. Implement the Pure Commission Domain Model

Place commission rules and calculations in the existing shared domain package.

Separate:

- Policy representation.
- Policy validation.
- Band selection.
- Exact calculation.
- Approved rounding.
- Calculation-result representation.

The domain implementation must be independent of:

- SQLite and Supabase.
- Fastify.
- Electron and browser APIs.
- Authentication.
- UI state.
- Network access.
- The current clock.

Pass required context explicitly.

Use the project’s established exact numeric representation.

Do not use JavaScript floating-point arithmetic for financial calculations.

If the project uses scaled integers:

- Define the scale of every value.
- Validate integer bounds.
- Check multiplication and intermediate results for overflow.
- Use the established safe serialization format.

If it uses an exact decimal library, reuse the existing dependency and configuration.

Do not introduce a second money or decimal convention.

---

## 4. Implement Strict Band Validation

Validate the complete policy before it can become active.

Validation must cover:

- At least one band when the approved policy requires bands.
- Unique band identifiers.
- Valid numeric formats and supported precision.
- Nonnegative thresholds where required by the domain.
- Valid lower and upper bounds.
- Correct endpoint inclusivity.
- No overlapping bands.
- No unintended gaps within the supported input range.
- Exactly one matching band for every eligible input.
- Valid rate values.
- Explicit representation of an open-ended final band, if permitted.
- Consistent units and rate basis throughout the policy.

Do not use arbitrary “very large” numbers to represent infinity.

Treat invalid stored policies as errors, even if the UI previously validated them.

Do not assume that a zero rate is valid unless the approved rules allow it.

For each threshold, test:

- The closest supported value below it.
- The threshold itself.
- The closest supported value above it.

Use the approved precision to determine the closest supported value.

---

## 5. Implement Exact Commission Calculation

Implement a deterministic calculation function using the confirmed policy contract.

The function must:

1. Validate the input.
2. Validate or accept a previously validated immutable policy.
3. Select exactly one applicable band.
4. Calculate the raw commission using exact arithmetic.
5. Apply the approved rounding rule at the approved stage.
6. Return a structured calculation result.

Include enough information in the result to explain and reproduce the calculation:

- Policy identifier and version.
- Applied band identifier.
- Selection input and unit.
- Chargeable input and unit.
- Applied rate and rate basis.
- Rounding rule or rule-version identifier.
- Final commission amount and currency.
- Calculation algorithm version if required for historical reproducibility.

Follow existing contracts for representing money and weight.

For a per-kilogram policy, convert the approved stored weight unit exactly before applying the rate.

For a percentage policy, use the approved percentage scale and chargeable amount.

Implement only the approved rate basis. Do not build unsupported alternatives merely for future flexibility.

Return explicit errors for:

- Missing active policy.
- Invalid policy.
- Unsupported input precision.
- Unsupported numeric range.
- No matching band.
- Multiple matching bands.
- Invalid chargeable weight or amount.

Never convert a failed calculation into zero commission.

Do not calculate farmer payouts, buyer totals, taxes, or unrelated deductions in this phase.

---

## 6. Add Immutable Policy Versioning

Inspect the existing schema before adding tables or columns.

Reuse existing commission structures where possible.

Create a forward-only migration if required. Never edit an already-applied migration.

Use the next available migration number.

Support these concepts using project naming conventions:

- A stable policy scope.
- Immutable policy versions.
- Bands belonging to a specific version.
- An active-version reference.
- Creation and activation metadata.
- Actor identity.
- Revision or equivalent concurrency control.

Published versions and their bands must remain immutable.

Editing configuration creates a new version.

Use the existing draft workflow if one exists. If no persisted draft workflow is required, the editor may hold unsaved changes until a validated version is submitted.

Activation must atomically:

1. Verify authorization and scope.
2. Verify the expected configuration revision.
3. Validate the complete candidate policy.
4. Persist the new immutable version, if applicable.
5. Change the active-version reference.
6. Record the activation audit event.
7. Append the required outbox event.

Enforce a single active version per established policy scope.

Preserve old versions for historical references.

Do not add scheduling, backdating, or deletion of published versions unless explicitly required by approved rules.

If approved production configuration does not exist, leave the policy unconfigured and show that state clearly.

Do not seed example rates as live business settings.

---

## 7. Preserve the Configuration Authority Model

Follow the project’s established local and cloud authority boundaries.

For local configuration operations, the stall service must perform authoritative validation and persistence.

Desktop terminals must never open SQLite directly.

Do not introduce an independent cloud writer for the same settings.

If the approved architecture requires cloud-originated commission changes:

- Reuse the established version and application model.
- Keep unsupported cloud delivery work recorded for the relevant sync phase.
- Distinguish “saved in cloud” from “applied at the stall.”
- Do not imply that offline stalls received a policy change.

Do not bypass the existing fail-closed authentication policy to make this feature usable.

A blocked authentication prerequisite must remain visible in the tracker and completion report.

---

## 8. Implement Repositories and Service Operations

Use existing repository, transaction, and error-handling patterns.

Provide operations for:

- Reading the active policy.
- Reading an immutable policy version.
- Listing policy versions with pagination.
- Submitting and activating a validated replacement policy.
- Previewing a calculation under an explicitly identified policy version.

Use tenant and stall scope derived from the authenticated service context.

Do not trust request-body scope fields.

For mutations:

- Require the established idempotency mechanism.
- Detect reuse of an idempotency key with different input.
- Require an expected revision or equivalent concurrency token.
- Return a conflict when another administrator changed the active policy.
- Write configuration, audit, and outbox changes in one transaction.

Do not use silent last-write-wins behavior.

Ensure failure at any point leaves no partial policy activation.

---

## 9. Add Shared Contracts and Authenticated Routes

Add request and response schemas to the existing contracts package.

Follow established API naming and versioning conventions.

Expose the operations needed for:

- Active policy retrieval.
- Policy history.
- Version details.
- Policy replacement and activation.
- Calculation preview.

Validate all inputs on the service, regardless of client validation.

Apply the existing permission model.

Use a dedicated commission-management capability if required by the approved capability registry. Register it consistently in permission contracts and role defaults.

Do not reuse `catalog.manage` or `parties.register_edit` merely because those capabilities already exist.

If commission-management authorization is unresolved, implement the permission boundary and deny mutation until the mapping is approved.

Separate view and management permissions where supported by the existing model.

Enforce:

- Valid local session.
- Valid device authorization.
- Correct tenant and stall scope.
- Required capability.
- Existing session and policy expiry restrictions.

Never accept a client-supplied final commission amount as authoritative.

---

## 10. Build the Desktop Commission Settings Interface

Use the existing design system, app shell, form components, and service client.

Provide:

### Active policy view

Display:

- Configuration status.
- Active version.
- Activation time.
- Bands with clear boundary labels.
- Rate units.
- Approved rounding summary.

### Policy editor

Allow authorized staff to:

- Start from the current policy.
- Edit thresholds and rates.
- Add or remove bands where supported.
- See field-level and whole-policy validation.
- Review the complete candidate policy.
- Activate the replacement version.

Make boundary semantics readable. Avoid ambiguous labels such as “200–400” when endpoint inclusion matters.

Show an explicit review step before activation because the change affects future financial calculations.

### Version history

Show:

- Version identifier.
- Creation and activation metadata.
- Actor information where permitted.
- Band details.
- Which version is currently active.

Published versions must be read-only.

Handle:

- No configured policy.
- Loading.
- Validation failures.
- Insufficient permissions.
- Service disconnection.
- Session expiry.
- Stale configuration conflicts.
- Successful activation.

Do not report success before the service confirms the committed change.

Preserve unsaved edits during a recoverable connection failure according to existing UI conventions. Clear sensitive state on logout.

---

## 11. Add a Calculation Preview

Provide a transient preview for authorized users to verify commission behavior.

Use approved input labels and units.

The preview must show:

- Selected policy version.
- Matching band.
- Applied rate.
- Chargeable basis.
- Rounded commission.
- A concise explanation of the calculation.

Use the same shared domain engine as the service.

If the desktop calculates locally for responsiveness, label the result as a preview and validate through the service where required by the existing architecture.

Do not persist previews as sales, bills, payments, or ledger entries.

Do not create financial outbox events for previews.

Distinguish previews of unsaved edits from previews of the active policy.

If the active policy changes while a preview is open, show that the preview refers to an older version and offer recalculation.

---

## 12. Define the Integration Contract for Later Billing Phases

Document how later sales and billing services must consume the engine.

At financial finalization, the authoritative stall service must:

1. Resolve the applicable policy using the approved activation rule.
2. Validate authoritative sale inputs.
3. Recalculate commission.
4. Persist the required policy reference and calculation snapshot.
5. Commit the sale, commission snapshot, audit, and outbox changes atomically.

Policy resolution and sale persistence must be consistent with concurrent policy activation.

Do not allow a sale to store one policy version while its commission was calculated using another.

If the active policy changes between preview and finalization, follow the approved stale-preview behavior. Do not silently substitute a materially different financial result.

Historical records must retain their original policy and calculation inputs.

A new policy must not recalculate finalized sales or bills.

Future reversals must reference the original recorded commission. Corrections must follow the approved adjustment workflow.

Do not implement billing or ledger posting during this phase.

---

## 13. Integrate Audit and Outbox Events

Use existing audit and outbox conventions.

Record meaningful configuration changes, including:

- Policy version creation where applicable.
- Policy activation.
- Replacement of a previously active version.

Include:

- Tenant and stall scope.
- Actor identity.
- Policy and version identifiers.
- Previous and new active-version references.
- Operation timestamp.
- Correlation or request identifier.

Ensure event data identifies the exact immutable version and contains or references the data required by the established sync contract.

Do not expose session secrets, device credentials, or unnecessary personal information.

Audit and outbox writes must share the configuration transaction.

Do not implement the cloud sync worker in this phase.

---

## 14. Add Meaningful Automated Tests

### Domain tests

Cover:

- Valid policy selection and calculation.
- Every threshold boundary.
- Fractional prices and weights at supported precision.
- Invalid precision.
- Invalid or unsupported negative and zero inputs.
- Gaps and overlaps.
- Empty policies.
- Open-ended bands where approved.
- No matching band.
- Rounding ties and values around rounding boundaries.
- Maximum supported values and overflow protection.
- Deterministic repeated calculations.
- Approved aggregation behavior.

Use independently calculated expected amounts.

Clearly mark synthetic fixture rates as test-only.

### Repository and service tests

Cover:

- Initial activation.
- Replacement activation.
- Historical-version immutability.
- Concurrent activation conflicts.
- Idempotent retries.
- Idempotency-key payload mismatch.
- Transaction rollback.
- Atomic audit and outbox persistence.
- Tenant and stall isolation.
- Unauthorized access.
- Expired or invalid sessions.
- Missing active policy.
- Invalid persisted configuration.
- Preview without financial writes.

### UI tests

Cover:

- Active-policy display.
- Unconfigured state.
- Invalid band feedback.
- Keyboard navigation.
- Review and activation.
- Permission restrictions.
- Stale-revision conflicts.
- Disconnection and session expiry.
- Preview version visibility.

Run relevant authentication and local-data-access regression tests.

---

## 15. Verify the Operator Workflow

Prepare a manual checklist using a development or staging stall.

Do not change a live stall’s commission policy for testing.

Verify:

1. Apply pending migrations using the existing migration command.
2. Restart the stall service if required.
3. Refresh the authorized staff session if capability changes require it.
4. Open commission settings.
5. Confirm the current or unconfigured state.
6. Enter the approved test policy.
7. Verify gap and overlap validation.
8. Preview values below, at, and above every threshold.
9. Check results against independently calculated expectations.
10. Activate the policy.
11. Confirm the active version and audit record.
12. Open a second terminal or session.
13. Attempt conflicting edits and verify conflict handling.
14. Activate a replacement policy.
15. Confirm the prior version remains readable and unchanged.
16. Disconnect internet access while keeping the stall service reachable.
17. Verify local operation remains consistent with the existing offline-access policy.
18. Confirm previews created no sales, ledger entries, or payments.

For an existing database, use:

`pnpm --filter @polivo/db-local db:migrate`

Do not reinitialize or reset the database.

Record any unavailable second-terminal or operator checks as pending.

---

## 16. Update Documentation and Report Completion

Create or update:

`docs/operations/commission-configuration.md`

Document:

- Approved commission rules.
- Units, precision, and rounding.
- Boundary semantics.
- Version creation and activation.
- Required permissions.
- Configuration authority.
- Historical calculation behavior.
- Preview limitations.
- Conflict handling.
- Missing-policy behavior.
- Verification procedure.

Update the relevant context files and progress tracker.

Run the repository’s applicable:

- Formatting checks.
- Lint checks.
- Type checks.
- Domain tests.
- Service integration tests.
- Desktop tests.
- Builds.

Use actual repository scripts.

In the final implementation report, include:

1. Files and migrations changed.
2. Confirmed commission rules implemented.
3. Policy versioning and activation behavior.
4. Permission changes.
5. Tests run and their results.
6. Manual checks completed or pending.
7. Any unresolved business decisions.
8. Readiness for Phase 21.

Do not mark the phase complete while required financial decisions, authentication prerequisites, or acceptance checks remain unresolved.

## Acceptance Criteria

- Default commission bands are configurable within the approved scope.
- No vegetable or category overrides are introduced.
- Financial calculations use exact arithmetic and approved rounding.
- Band coverage and boundaries are validated.
- Published policy versions are immutable.
- Activation is authorized, concurrency-safe, and transactional.
- Audit and outbox records commit with configuration changes.
- Missing or invalid configuration produces explicit errors.
- The desktop supports policy review, activation, history, and previews.
- Historical financial records can retain reproducible commission snapshots.
- Automated tests pass, and pending manual checks are accurately recorded.