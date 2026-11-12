# 27 — Cheque Payments and Settlement on Handover

## Scope Clarification

Keep the filename `27-cheque-lifecycle-and-settlement.md` for roadmap continuity.

Implement the approved simplified cheque-payment workflow:

**When a cheque is physically handed to a farmer, record it as paid immediately.**

Do not implement cheque clearance, deposit tracking, rejection tracking, maturity reminders, or an outstanding-cheque lifecycle.

The word “lifecycle” in the original filename does not override this decision.

Extend the Phase 26 payment and allocation system. Do not create a separate cheque ledger or duplicate settlement mechanism.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Approved cheque-payment decisions.
- Phase 21 ledger conventions.
- Phase 24 farmer bills and canonical entitlement references.
- Phase 25 correction and payment-dependency checks.
- Phase 26 payment posting, allocation, reversal, and recovery.
- Payment method schemas and database constraints.
- Payment permissions, audit, and outbox conventions.

Inspect actual code to determine:

1. How payment methods are represented.
2. Where method-specific validation belongs.
3. How farmer payouts reduce account balances.
4. How payments allocate to source entitlements.
5. How payment reversals restore outstanding amounts.
6. How unknown outcomes are recovered.
7. Which bank-account references already exist.

Mark Phase 27 as `IN_PROGRESS`.

Preserve pending Phase 26 operator checks.

---

## 2. Record the Approved Cheque Policy

Document these rules in the existing business-rule register or an appropriate ADR:

- Cheque is a payment method.
- Farmer settlement occurs when physical handover is recorded.
- Payment posting reduces the farmer liability immediately.
- Allocations reduce the selected obligations immediately.
- Partial handover amounts produce partial settlement.
- Full allocation produces full settlement.
- No later clearance action is required.
- The application does not independently verify the bank’s processing.
- Payment reversal follows the existing authorized correction workflow.
- Reversal is not an instruction to cancel a cheque at the bank.

This is the system’s operational settlement rule.

Do not label an account as bank-reconciled merely because a cheque payout was posted.

### Buyer cheques

The established decision specifically covers cheques handed to farmers.

Inspect approved requirements for buyer/trader cheque receipts.

If no explicit buyer-cheque recognition rule exists:

- Keep cheque unavailable for buyer receipts.
- Reject buyer-cheque submissions at the service.
- Document the unsupported direction.
- Continue implementing farmer cheque payouts.

Do not assume that receiving a buyer cheque has the same settlement semantics as issuing a farmer cheque.

---

## 3. Extend the Existing Payment Method

Add cheque support to the shared payment model using existing naming conventions.

Reuse:

- Payment identity.
- Farmer account.
- Payment direction.
- Exact amount and currency.
- Business-effective date.
- Allocation structure.
- Idempotency.
- Ledger posting.
- Audit and outbox.
- Payment history.
- Reversal handling.

Add only the required method-specific metadata.

Recommended minimum operational fields are:

- Cheque number/reference.
- Issuing bank or existing bank-account reference.
- Cheque date.
- Physical handover date.
- Optional bounded note.

Follow approved repository requirements for mandatory fields. Do not expand this into a cheque-book management system.

Store cheque numbers as strings so leading zeros are preserved.

Keep the system payment reference separate from the cheque number.

Do not store bank credentials, cheque images, signatures, or unnecessary account details.

---

## 4. Validate Cheque Input

Perform authoritative service-side validation.

Validate:

- Supported farmer payout direction.
- Eligible farmer account.
- Positive exact payment amount.
- Supported currency and precision.
- Required cheque metadata.
- Bounded reference lengths.
- Valid calendar dates.
- Approved business-date restrictions.
- Physical handover confirmation.
- Eligible allocations.

A future physical handover must not be recorded as an already-completed payout.

Keep cheque date and handover date distinct. Do not treat the cheque date as proof of handover.

Do not introduce a clearance or maturity gate based on cheque date.

If post-dated cheque restrictions are explicitly defined in the approved rules, enforce them. Otherwise, do not invent a maturity workflow.

Reject unsupported lifecycle fields such as:

- `clearedAt`
- `depositedAt`
- `bouncedAt`
- `clearanceStatus`

Do not silently accept them.

---

## 5. Implement Handover-Based Preview

Extend the Phase 26 preview service.

The preview must show:

- Selected farmer.
- Payment method: Cheque.
- Cheque reference and issuing bank.
- Cheque date.
- Physical handover date.
- Payment amount.
- Allocation breakdown.
- Remaining obligation amounts.
- Resulting farmer account effect.
- Unapplied amount only if Phase 26 explicitly supports it.

Clearly explain:

“Recording this handover counts the cheque amount as paid to the farmer.”

Preview must not change:

- Ledger balances.
- Allocations.
- Bill settlement.
- Issued payment references.

Do not post payment merely because cheque details were entered or saved as an unposted draft.

Require explicit confirmation that physical handover occurred before committing the payout.

---

## 6. Post the Cheque Payout Atomically

Extend the existing Phase 26 posting transaction.

Within one authoritative SQLite transaction:

1. Validate device, session, and payout permission.
2. Resolve tenant and stall.
3. Check idempotency.
4. Validate cheque metadata and handover confirmation.
5. Reload the farmer account and selected obligations.
6. Recheck eligibility and remaining amounts.
7. Verify the reviewed allocation state.
8. Allocate the existing payment reference.
9. Persist the cheque payment and immutable metadata.
10. Post the farmer payout effect once.
11. Persist allocations.
12. Update settlement projections.
13. Write audit records.
14. Append outbox events.
15. Store the operation result.
16. Commit.

The payment becomes posted immediately on successful commit.

Do not create a second financial event for future clearance.

Do not post a separate cash payout or bank-transfer payment for the same cheque.

If any step fails, roll back the complete operation.

---

## 7. Preserve the Existing Accounting Model

Reuse the Phase 26 farmer-payout posting logic.

For a farmer obligation of `10,000`:

- A handed-over cheque of `4,000`, allocated to that obligation, leaves `6,000` outstanding.
- A further valid payment of `6,000` settles the obligation.

These are synthetic test amounts.

Allocation must not reduce the account balance a second time.

If the existing accounting model includes cash/bank counterpart accounts, use the approved cheque mapping.

Do not introduce a new clearing account or reconciliation subsystem without an approved requirement.

If that mapping is genuinely unresolved, continue independent method and UI work while blocking the affected posting path. Do not guess account assignments.

Keep cheque totals separate from cash totals in method-based reporting.

---

## 8. Handle Duplicate Cheque References

Reuse request idempotency and business-operation uniqueness.

A cheque number alone is not a globally unique payment identity.

Inspect whether the approved system defines uniqueness using:

- Stall.
- Issuing bank account.
- Cheque number.
- Other established instrument identifiers.

Enforce an approved uniqueness rule transactionally where one exists.

Otherwise:

- Provide a warning when matching cheque metadata already exists in the stall.
- Show authorized references to potential duplicates.
- Require deliberate review according to existing duplicate-warning conventions.
- Do not reject unrelated cheques solely because their numbers match.

Do not infer a bank account identity from free-text bank names.

Do not allow retries to create a second payout, even when duplicate-reference warnings are absent.

---

## 9. Preserve Allocation and Correction Boundaries

Use the same canonical obligations as cash and bank payments.

Support the approved Phase 26 targets:

- Farmer sale entitlements.
- Farmer-bill groups resolved to source entitlements.
- Eligible farmer opening balances.

Do not create separate cheque-specific obligations.

A farmer bill must show the settlement of its underlying sources immediately after successful posting.

Keep document status separate from payment status.

Update Phase 25 dependency checks so cheque allocations block unsupported sale corrections exactly as cash and bank allocations do.

Cheque payment posting and sale correction must serialize against the same obligation state.

Do not automatically release allocations because a user edits a cheque note or opens a bill correction screen.

---

## 10. Reuse Authorized Payment Reversal

Support reversal through the existing Phase 26 payment-reversal workflow.

An authorized reversal must:

- Reference the original cheque payment.
- Require a reason.
- Reverse the original financial effect exactly.
- Release active allocations through immutable reversal records.
- Restore the affected outstanding amounts.
- Preserve cheque metadata and handover history.
- Write audit and outbox records atomically.
- Prevent a second reversal.

Label it as a payment-record reversal.

Do not label it:

- Cheque bounced.
- Cheque rejected.
- Cheque cancelled at bank.
- Cheque clearance failed.

Those lifecycle processes are outside the approved scope.

The software must not claim that reversing a record retrieves the physical cheque or stops the bank from paying it.

A replacement payout must be a separately authorized, linked payment using the existing correction conventions.

Do not automatically issue another payout after reversal.

---

## 11. Add Forward-Only Schema Changes

Inspect the Phase 26 schema before adding anything.

Extend existing payment tables or method-detail structures where appropriate.

Add only what is needed for:

- Cheque method support.
- Validated method metadata.
- Handover details.
- Required indexes.
- Approved instrument uniqueness constraints.

Use the next available migration number.

Do not edit applied migrations.

Preserve all existing cash and bank payments.

Do not convert historical bank payments into cheque payments based on notes or reference text.

Do not create:

- Clearance-state tables.
- Deposit batches.
- Maturity queues.
- Rejection workflows.
- Cheque reminder jobs.

Test both a fresh database and an upgrade containing payments, allocations, and reversals.

---

## 12. Extend Contracts, Routes, and Permissions

Extend existing Phase 26 contracts and routes where possible.

Avoid parallel cheque-payment endpoints that duplicate posting logic.

Update:

- Payment method schemas.
- Preview contracts.
- Posting contracts.
- Payment detail responses.
- Payment history filters.
- Reversal previews.
- Typed desktop client methods.

Use discriminated validation for method-specific fields.

Cash and bank requests must not require cheque metadata.

Cheque requests must not bypass required method fields.

Reuse the approved farmer-payout permission unless the capability model explicitly requires a separate cheque permission.

Do not grant payment reversal through ordinary payout permission.

Enforce unsupported buyer-cheque rejection on the service even if the UI hides that option.

Preserve device checks, session expiry, tenant isolation, and offline-access policy.

---

## 13. Extend the Desktop Payment Interface

Add Cheque to the farmer payout method selector.

When selected, show:

- Amount.
- Cheque number/reference.
- Issuing bank or bank-account selector.
- Cheque date.
- Handover date.
- Existing allocation controls.
- Optional note.
- Explicit physical-handover confirmation.

Use keyboard-accessible fields and inline validation.

The review must clearly state that posting records the farmer as paid for the allocated amount.

After commit, show:

- Payment reference.
- Cheque method and metadata.
- Recorded handover date.
- Allocations.
- Remaining outstanding amount.

Use the existing payment history for retrieval.

Do not add a separate cheque tracking dashboard.

Do not add actions for depositing, clearing, rejecting, or marking maturity.

Keep the selected amount and allocation independent of the cheque number.

---

## 14. Handle Unknown Outcomes Safely

Reuse Phase 26 operation recovery.

If the response is lost after handover:

- Show that the recording outcome is being checked.
- Preserve the original idempotency key.
- Retrieve the committed operation result.
- Retry the same request only under the established recovery rules.
- Prevent duplicate submission through repeated clicks or shortcuts.

Do not tell the operator to hand over another cheque because the request timed out.

After restart, recover through approved operation metadata or service lookup.

After session expiry, require reauthentication before displaying protected results.

Do not persist session secrets or unrestricted payment payloads in renderer storage.

---

## 15. Update History, Summaries, and Events

Payment history should support filtering by Cheque.

Show:

- Posted or reversed payment status.
- Cheque reference.
- Issuing bank.
- Handover date.
- Amount.
- Farmer.
- Allocation summary.

Do not show a clearance status.

Where existing method summaries exist:

- Report cash, bank transfer, and cheque separately.
- Avoid counting cheque payouts as cash movements.
- Distinguish original payouts from reversals.
- Preserve exact totals.

Extend existing payment events with the required cheque metadata and recognition basis.

Do not emit an additional settlement event that causes consumers to post the payout again.

Keep sensitive metadata out of unrestricted logs.

Bill settlement must derive from the same allocations used by all payment methods.

---

## 16. Add Automated Tests

### Validation tests

Cover:

- Leading zeros in cheque references.
- Missing required metadata.
- Invalid dates.
- Future physical handover.
- Invalid amounts and precision.
- Unsupported buyer-cheque submission.
- Unsupported lifecycle fields.
- Method-specific schema isolation.

### Financial tests

Cover:

- Partial cheque payout.
- Full cheque payout.
- Allocation across multiple obligations.
- Opening-balance settlement.
- Farmer-bill grouping without duplicate settlement.
- Immediate liability reduction on posting.
- No additional clearance posting.
- Exact payment reversal.
- Restoration of outstanding amounts.
- No duplicate reversal.

### Transaction and concurrency tests

Cover:

- Same-key retry.
- Key reuse with changed cheque metadata.
- Lost response after commit.
- Concurrent payments against the same remaining amount.
- Cheque payout versus sale correction.
- Duplicate-instrument policy where approved.
- Rollback after payment, ledger, allocation, audit, or outbox failure.
- Tenant and stall isolation.
- Unauthorized and expired sessions.

### UI tests

Cover:

- Farmer cheque method selection.
- Keyboard entry.
- Physical-handover confirmation.
- Review and posting.
- Duplicate-action prevention.
- Unknown-outcome recovery.
- Payment history.
- Reversal navigation.
- No clearance or rejection controls.

Run Phase 26 cash and bank regression tests to confirm their behavior remains unchanged.

---

## 17. Prepare Operator Acceptance and Documentation

Create or update:

`docs/operations/cheque-payments-and-handover.md`

Document a development/staging checklist using simulated handover and test records:

1. Back up the database.
2. Apply pending migrations without resetting it.
3. Restart service and desktop.
4. Sign in with authorized payout permissions.
5. Create or select a test farmer obligation.
6. Note the account balance and obligation outstanding.
7. Choose Cheque in the payout form.
8. Enter test cheque metadata.
9. Select a partial allocation.
10. Confirm simulated physical handover.
11. Review and post.
12. Verify the farmer liability decreases once.
13. Verify the obligation becomes partially settled immediately.
14. Confirm no clearance step is required.
15. Retrieve the payment from history.
16. Retry the same operation and confirm no duplicate.
17. Record a separate test payment for the remaining amount.
18. Verify full settlement.
19. Reverse an eligible test cheque payment.
20. Verify its allocations reverse and outstanding amounts reopen.
21. Confirm unauthorized users cannot reverse it.
22. Confirm buyer-cheque entry is unavailable unless explicitly supported.
23. Restart and verify payment history persists.
24. Test uncertain-outcome recovery in a controlled environment.

Use:

`pnpm --filter @polivo/db-local db:migrate`

Do not use a real physical cheque for automated or simulated acceptance tests.

Document:

- Settlement on physical handover.
- Required metadata.
- Duplicate-reference behavior.
- Supported payment direction.
- Reversal limitations.
- Recovery after timeout.
- Absence of bank clearance tracking.

Update roadmap descriptions so Phase 27 is described as cheque payment and handover settlement while preserving the existing filename.

Run applicable formatting, lint, type, domain, service, database, UI, end-to-end, and build checks.

Report:

1. Files and migrations changed.
2. Payment method integration.
3. Immediate settlement behavior.
4. Supported and unsupported directions.
5. Tests executed and results.
6. Manual checks completed or pending.
7. Any unresolved accounting mapping.
8. Readiness for Phase 28.

## Acceptance Criteria

- Farmer cheque payouts settle on recorded physical handover.
- Cheques reuse Phase 26 payment, allocation, and reversal infrastructure.
- Financial effects and allocations commit atomically.
- No cheque clearance, rejection, or maturity lifecycle is introduced.
- Unsupported buyer-cheque receipts are rejected explicitly.
- Cheque references preserve leading zeros.
- Retries and uncertain outcomes cannot duplicate payouts.
- Payment reversal preserves history and restores settlement accurately.
- Cash, bank transfer, and cheque remain distinguishable.
- Tests pass and pending operator verification is documented.