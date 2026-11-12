# 22 — Sales and Buyer Billing Service

## Objective

Implement the authoritative local service for recording vegetable sales and finalizing buyer/trader bills.

This phase must deliver:

- Persisted, editable sale drafts.
- Validated farmer, buyer, vegetable, package, weight, and price references.
- Exact service-side financial calculations.
- Immutable commission snapshots.
- Atomic sale finalization and buyer-bill numbering.
- Financial posting through the Phase 21 interface.
- Safe retries and concurrent-terminal behavior.
- Authenticated APIs for the Phase 23 billing interface.
- Audit records and transactional outbox events.

The stall service remains the sole writer to the local SQLite database.

Build the service and shared contracts in this phase. The keyboard-first billing screen follows in Phase 23.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical files under `docs/context/`.
- Phase 08 business and financial decisions.
- Existing sales, sale-line, bill, payment, and numbering schemas.
- Phase 17 farmer management.
- Phase 18 buyer/trader management.
- Phase 19 package and weight implementation.
- Phase 20 commission engine.
- Phase 21 ledger and opening-balance implementation.
- Authentication, capability, transaction, audit, and outbox conventions.

Inspect actual code before deciding which structures need extending.

Confirm the Phase 21 posting interface and its transaction requirements.

Check the recorded Phase 21 operator acceptance status. Preserve outstanding checks and identify any that block safe billing verification.

Mark Phase 22 as `IN_PROGRESS`.

Do not introduce a second implementation of money calculations, commission rules, ledger posting, or idempotency.

---

## 2. Confirm Sale and Bill Semantics

Document the approved relationship between:

- A sale.
- A sale line.
- A buyer bill.
- A farmer’s entitlement.
- A later farmer bill.
- A payment.

Determine whether a buyer bill contains one sale or groups several sale records.

Use the existing approved model rather than assuming that these entities are interchangeable.

Confirm:

| Decision | Required definition |
|---|---|
| Buyer scope | Whether one bill contains exactly one buyer |
| Farmer attribution | Where each sold quantity identifies its farmer |
| Grouping | Which lines may appear on one buyer bill |
| Weight basis | Approved gross/net weight and deductions |
| Price basis | Currency per kilogram and supported precision |
| Commission | Who bears it and when it is recognized |
| Buyer amount | Exact formula for the buyer’s obligation |
| Farmer amount | Exact formula and recognition point |
| Rounding | Line and bill rounding rules |
| Finalization | Business event that creates financial effects |
| Business date | Timezone, allowed dates, and backdating rules |
| Numbering | Scope, starting value, formatting, and reset policy |
| Draft access | Which staff may view or edit a draft |
| Opening readiness | When operational posting is permitted |

Preserve these established decisions:

- Default commission bands only.
- No vegetable or category commission overrides.
- No lorry-owner field.
- Categories remain deferred unless a later approved decision changes that.
- Farmers and buyers are existing stall-managed records.
- Drafts can be corrected before finalization.
- Finalized financial records require an auditable correction workflow.

Do not assume that commission increases the buyer’s bill or reduces farmer proceeds without checking the approved formula.

If a required financial rule is unresolved, implement independent mechanics and keep affected finalization unavailable with an explicit error.

---

## 3. Define the Lifecycle and Invariants

Use the existing lifecycle where possible.

At minimum, distinguish:

- Editable draft.
- Finalized financial record.
- Abandoned or cancelled draft, if supported.

Define permitted transitions explicitly.

Enforce:

1. Drafts have no ledger effect.
2. Drafts have no issued buyer-bill number.
3. Finalized amounts are calculated by the stall service.
4. Finalized financial fields and snapshots are immutable.
5. A sale can be finalized only once.
6. One business event produces its financial effect only once.
7. Buyer-bill issuance cannot duplicate sale postings.
8. Every finalized line has valid farmer attribution.
9. All referenced entities belong to the authenticated stall.
10. A failed finalization leaves no partial bill or ledger effect.
11. Master-data edits do not rewrite historical bill details.
12. Internet connectivity is not required for an authorized local operation.

Do not implement finalized-sale deletion or arbitrary financial updates.

Phase 25 will provide the full correction and reversal workflow.

---

## 4. Define Shared Input and Output Contracts

Extend the existing contracts package.

Provide schemas for:

- Creating a draft.
- Reading a draft.
- Listing accessible drafts.
- Updating a draft with an expected revision.
- Abandoning a draft, if supported.
- Requesting an authoritative calculation preview.
- Finalizing a draft.
- Looking up a finalization outcome.
- Reading a finalized buyer bill.
- Listing finalized buyer bills.

Use stable identifiers for drafts and lines.

Line inputs should include the approved fields, such as:

- Farmer reference.
- Vegetable reference.
- Package-type reference.
- Individual weight rows.
- Unit price.
- Approved explicit deductions, if supported.
- Optional bounded notes.

The header should contain the buyer and approved bill-level metadata.

Do not accept client-provided totals, commission amounts, actor identities, or tenant scope as authoritative.

Reject unsupported fields rather than silently accepting hidden discounts or charges.

Define limits for:

- Lines per draft.
- Weight rows per line.
- Numeric ranges.
- Notes.
- Search queries.
- Pagination.
- Request-body size.

Use the project’s exact decimal and money serialization conventions.

---

## 5. Implement Pure Sale Calculations

Use the existing domain package.

Compose Phase 19 weight calculations and Phase 20 commission calculations.

For each line:

1. Validate every weight row.
2. Calculate the approved total weight.
3. Apply only approved deductions.
4. Determine the chargeable weight.
5. Calculate the sale amount using exact arithmetic.
6. Select the applicable commission policy and band.
7. Calculate commission.
8. Calculate the approved buyer and farmer amounts.
9. Apply rounding at the approved stages.

For the bill:

- Aggregate line results using the approved rounding model.
- Preserve individual farmer attribution.
- Return a transparent breakdown.
- Validate all totals and numeric bounds.

Do not multiply individually summed bag weights by the bag count again.

Do not use JavaScript floating-point arithmetic for money or weight calculations.

Do not introduce taxes, discounts, transport fees, package charges, or other deductions without approved requirements.

A missing commission policy or invalid calculation must block affected finalization. It must not produce a silent zero commission.

---

## 6. Preserve Authoritative Calculation Snapshots

Persist enough data to reproduce and explain a finalized transaction.

Include the approved snapshot fields:

- Party IDs and historical display details required for bills.
- Vegetable ID, code, and display name.
- Package type and relevant unit details.
- Individual weight rows.
- Gross, deducted, and chargeable weights where applicable.
- Unit price and currency.
- Line amounts.
- Commission policy version.
- Applied band and rate.
- Rounding rule or calculation-version reference.
- Buyer and farmer financial effects.
- Bill totals.
- Business date and recording timestamp.

Minimize personal data to what the bill and audit requirements need.

Use snapshots for historical display. Keep stable IDs for relationships and reporting.

A renamed or deactivated party, vegetable, or package type must not change an already-issued bill.

Do not recalculate historical commission using the currently active policy.

---

## 7. Add Forward-Only Schema Changes

Inspect existing tables before creating new ones.

Add only the structures required for:

- Draft persistence and revisions.
- Stable line identities and weight details.
- Finalized calculation snapshots.
- Buyer-bill references and numbering.
- Business-source uniqueness.
- Finalization operation results.
- Relevant lookup indexes.

Use the next available migration number.

Do not edit applied migrations.

Enforce through appropriate constraints:

- Scoped references.
- Unique finalized business events.
- Unique buyer-bill numbers within their numbering scope.
- Valid lifecycle values.
- Required finalization metadata.
- Prevention of duplicate line relationships.
- Posted-record immutability.

Preserve existing data.

If old records cannot safely satisfy a new invariant, document and implement an explicit migration strategy. Do not fabricate historical amounts or silently finalize legacy rows.

Test fresh installation and upgrade paths.

---

## 8. Implement Persisted Draft Operations

Drafts must survive desktop restarts because they are stored through the stall service.

Implement:

- Creation.
- Retrieval.
- Paginated listing.
- Revision-checked updates.
- Approved abandonment.

Use optimistic concurrency.

If two terminals edit the same revision:

- Accept one update.
- Reject the stale update with a conflict.
- Return enough information for the client to reload and resolve it.

Do not silently overwrite another operator’s changes.

Define whether draft updates replace the complete draft or apply structured changes. Follow one consistent contract.

Allow incomplete drafts where useful, but reject malformed or out-of-range values.

Return structured completion errors when a draft is not ready to finalize.

Separate draft validity from finalization readiness.

Do not generate a bill number or post ledger entries when saving a draft.

Keep draft visibility and editing subject to the approved permissions.

---

## 9. Implement Authoritative Preview and Stale-Result Detection

Provide a service-side preview using current authoritative references and policies.

Return:

- Draft revision.
- Applicable commission version.
- Calculation breakdown.
- Validation errors.
- Relevant reference revisions or a calculation fingerprint.
- Readiness to finalize.

A preview is advisory until finalization commits.

During finalization, recalculate within the authoritative transaction.

If relevant inputs or policy changed since the operator reviewed the preview:

- Return an explicit stale-calculation conflict.
- Supply or enable retrieval of the updated calculation.
- Require the client to review and resubmit under the approved workflow.

Do not silently finalize a materially different amount.

Use a server-verifiable revision or fingerprint mechanism. Do not treat a client-submitted total as evidence that a calculation was reviewed.

No ledger or financial outbox effects should result from preview requests.

---

## 10. Implement Buyer-Bill Number Allocation

The requested trader/buyer bill sequence starts at `444444`.

The farmer sequence starts at `111111` and remains separate for Phase 24.

Inspect existing numbering decisions and implementation before extending them.

Confirm:

- Numbering scope.
- Prefix or formatting, if any.
- Whether sequences reset.
- How restored databases preserve numbering.
- How bill types remain distinguishable as sequences grow.

Do not rely solely on the starting digits to identify a bill type.

Use an explicit bill-type field and separate sequence identity.

Allocate the buyer-bill number inside the finalization transaction.

Do not use `MAX(number) + 1`.

Use a concurrency-safe sequence operation consistent with SQLite transactions.

Ensure:

- Concurrent terminals receive unique numbers.
- A retried finalization returns the original number.
- Drafts do not consume issued numbers.
- Previously issued numbers are never reused after cancellation or reversal.
- Existing sequences are not reset by a migration or service restart.

Document the approved treatment of rollback-related gaps without claiming gapless numbering unless it is explicitly required and implemented.

---

## 11. Implement Atomic Finalization

Use one authoritative SQLite transaction.

The finalization flow must:

1. Authenticate the staff session and device.
2. Verify the finalization capability.
3. Resolve the authenticated tenant and stall.
4. Check the idempotency operation.
5. Load the draft and expected revision.
6. Verify that it is eligible for finalization.
7. Validate buyer, farmers, vegetables, and package references.
8. Apply the approved active/inactive-reference rules.
9. Check account opening and cutover readiness.
10. Resolve the applicable commission policy.
11. Recompute all weights and financial amounts.
12. Detect stale reviewed calculations.
13. Allocate the buyer-bill number.
14. Persist finalized sale data and snapshots.
15. Create the buyer-bill record and relationships.
16. Post approved financial effects through Phase 21.
17. Record audit events.
18. Append outbox events.
19. Store the stable finalization result.
20. Commit.

Return success only after commit.

Do not perform network requests, printing, or cloud synchronization inside the transaction.

If any required step fails, roll back all financial and bill changes.

Use bounded handling for SQLite lock contention. Do not retry indefinitely.

---

## 12. Integrate Financial Posting Without Duplication

Use the Phase 21 posting interface within the same transaction.

Document an explicit source-to-posting map for:

- Buyer obligation.
- Farmer entitlement.
- Commission recognition, where represented by the approved accounting model.

Follow the approved recognition point for each effect.

If farmer entitlement is recognized when the sale finalizes, Phase 24 farmer-bill generation must only reference those existing effects.

If it is recognized at a later approved event, persist the necessary sale linkage and ensure that later event posts exactly once.

Do not choose the recognition point merely to simplify this phase.

Buyer-bill creation, retrieval, printing, and reprinting must not create a second financial effect.

Do not automatically apply an existing buyer credit to the bill unless the approved allocation workflow supports it.

Do not mark a bill paid because an unrelated account-level balance happens to be zero.

Payment collection and allocation belong to Phase 26.

Do not create synthetic cash payments as part of sale finalization.

---

## 13. Make Retries and Concurrent Requests Safe

Use both:

- Request-level idempotency.
- Database-enforced business-event uniqueness.

Require a stable idempotency key for finalization.

Persist the request fingerprint and committed result according to existing conventions.

Guarantee:

- Same key and same request returns the original result.
- Same key and different request returns a conflict.
- Two keys targeting the same draft cannot finalize it twice.
- A timeout after commit can be resolved without issuing a new bill.
- Concurrent draft updates and finalization cannot produce mixed revisions.
- Concurrent policy activation cannot produce mismatched calculation snapshots.

Revalidate authorization when returning a previous operation result.

Do not reveal another user’s or stall’s result through idempotency lookup.

Provide a scoped lookup path that Phase 23 can use after an uncertain network outcome.

---

## 14. Add Authenticated Service Routes

Use existing Fastify conventions and shared schemas.

Expose the draft, preview, finalization, operation-lookup, and finalized-bill read operations.

Register appropriate sales and billing capabilities through the existing permission model.

Separate draft editing, finalization, and bill viewing where the approved role model requires it.

Do not automatically give cashiers billing privileges.

Do not reuse `commission.manage` or `accounts.opening_post` as billing permissions.

Enforce:

- Device authorization.
- Valid local staff session.
- Capability checks.
- Tenant and stall isolation.
- Existing offline policy restrictions.
- Request validation.
- Safe error responses.

Use stable error codes for:

- Incomplete draft.
- Stale revision.
- Stale calculation.
- Inactive reference.
- Missing commission policy.
- Account not ready.
- Already finalized.
- Idempotency conflict.
- Authorization failure.
- Temporary service contention.

Keep credentials and financial request payloads out of unrestricted logs.

Use the existing narrow desktop IPC and service-client patterns when adding client methods for Phase 23.

Do not expose SQLite or session secrets to the renderer.

---

## 15. Preserve Reporting and Later-Phase Integration

Finalized sale data must support later:

- Farmer bill generation.
- Buyer bill history.
- Payments and allocation.
- Corrections and reversals.
- Printing.
- Account statements.
- Cloud reporting.
- Vegetable price reporting.

Keep one authoritative identity for each sale and line.

Do not duplicate sale records to generate farmer bills.

Expose finalized price and weight facts for later price aggregation.

Only finalized, eligible sales may contribute to price reporting. Drafts must not affect minimum, maximum, or average prices.

If price aggregates already exist, follow their approved formula and update them transactionally or through a replay-safe projection.

If average-price semantics remain unresolved, preserve the raw facts and record the decision for the reporting phase. Do not invent a weighted or unweighted average.

Preserve any existing approved inventory linkage. Do not invent stock deductions or availability rules without the required inventory model.

Record missing inventory dependencies explicitly.

---

## 16. Add Audit and Outbox Events

Use established event schemas and naming.

Capture:

- Draft lifecycle events where required by the audit policy.
- Sale finalization.
- Buyer-bill issuance.
- Associated financial posting references.

Financial events must identify:

- Tenant and stall.
- Sale and line IDs.
- Buyer bill ID and number.
- Party references.
- Exact amounts and currency.
- Weight and price snapshots.
- Commission version.
- Ledger posting references.
- Business date.
- Actor and device.
- Event schema version.

Keep finalization events in the same database transaction.

Define which event represents each business effect so future consumers do not count both sale finalization and bill issuance as separate revenue or quantity.

Do not implement cloud ingestion or the sync worker now.

---

## 17. Add Automated Tests

### Domain tests

Cover:

- Multiple unequal bag weights.
- Multiple vegetables.
- Multiple farmers on a bill if approved.
- Exact unit-price multiplication.
- Supported weight deductions.
- Commission thresholds.
- Line and bill rounding.
- Numeric limits and overflow.
- Missing or invalid policies.
- Invalid and incomplete inputs.

Use independently calculated expected values.

### Service and database tests

Cover:

- Draft creation and persistence.
- Draft updates without financial effects.
- Concurrent draft edits.
- Preview without writes to financial tables.
- Successful finalization.
- Immutable snapshots after master-data changes.
- Policy changes between preview and finalization.
- Concurrent policy activation.
- Idempotent retry.
- Reused key with a different payload.
- Two keys finalizing the same draft.
- Concurrent bill-number allocation.
- Timeout or lost response after commit.
- Transaction rollback at injected failure points.
- Atomic ledger, audit, and outbox writes.
- Opening-readiness checks.
- Tenant and stall isolation.
- Unauthorized and expired sessions.
- Finalized-record mutation rejection.
- Bill retrieval without duplicate posting.
- Fresh and upgraded databases.

Assert exact record counts and balances after retries and failures.

Verify that no partial bill, sale posting, or outbox effect survives a failed finalization.

### Regression tests

Run relevant tests from:

- Weight calculations.
- Commission.
- Ledgers.
- Local authentication.
- Party management.

Do not create production sample sales as part of automated testing.

---

## 18. Prepare Service-Level Operator Verification

Document an authenticated development or staging checklist.

The full billing UI is not required yet. Use the existing trusted development client or test harness without exposing credentials in shell history or logs.

Verify:

1. Back up the local database.
2. Apply pending migrations without resetting it.
3. Restart the stall service.
4. Refresh the authorized staff session if capabilities changed.
5. Confirm required Phase 21 account readiness.
6. Confirm valid test farmer, buyer, vegetable, and package records.
7. Confirm a valid test commission policy.
8. Create and save a draft.
9. Edit its weights and price.
10. Confirm balances remain unchanged.
11. Request a preview and independently check the result.
12. Finalize the draft.
13. Verify the buyer-bill number and immutable details.
14. Verify the expected ledger movements.
15. Retry the same finalization and confirm the same result.
16. Attempt finalization with another key and confirm no duplication.
17. Test a stale draft revision.
18. Test a policy change between preview and finalization.
19. Verify unauthorized staff cannot finalize.
20. Restart the service and retrieve the issued bill.
21. Verify operation without internet while the local service remains reachable and access policy permits it.

Use:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset an existing database.

Record manual checks that remain pending.

---

## 19. Update Documentation and Report Completion

Create or update:

`docs/operations/sales-and-buyer-billing.md`

Document:

- Sale and bill relationships.
- Financial formulas.
- Finalization lifecycle.
- Source-to-ledger posting map.
- Buyer-bill numbering.
- Draft concurrency.
- Preview freshness.
- Idempotency and uncertain-outcome recovery.
- Required permissions.
- Phase 23 API integration.
- Phase 24 farmer-bill integration.
- Deferred payment, correction, printing, and reporting work.

Update relevant context files and the progress tracker.

Run the repository’s applicable:

- Formatting checks.
- Lint checks.
- Type checks.
- Domain tests.
- Database and service tests.
- Relevant desktop-client tests.
- Builds.

In the completion report, include:

1. Files and migrations changed.
2. Business rules implemented.
3. Routes and capabilities added.
4. Finalization transaction behavior.
5. Financial posting and numbering guarantees.
6. Tests executed and results.
7. Manual checks completed or pending.
8. Unresolved decisions or dependencies.
9. Readiness for Phase 23.

Distinguish implementation completion, operator acceptance, and production readiness.

## Acceptance Criteria

- Drafts are persisted, revision-controlled, and financially inactive.
- The service validates all authoritative references and inputs.
- Weight, money, and commission calculations are exact.
- Finalized records preserve immutable calculation snapshots.
- Buyer-bill numbering is scoped, concurrency-safe, and retry-safe.
- Sale finalization, financial posting, audit, and outbox writes commit atomically.
- Duplicate requests cannot create duplicate bills or ledger effects.
- Stale calculations require review before finalization.
- Farmer and buyer obligations follow the approved recognition rules.
- Later farmer-bill generation cannot double-post the same sale.
- Authenticated local operation works within the established offline policy.
- Phase 23 has stable contracts for drafting, previewing, finalizing, and recovering uncertain outcomes.
- Tests pass and outstanding manual verification is documented.