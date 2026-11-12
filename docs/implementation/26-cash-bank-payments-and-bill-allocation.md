# 26 — Cash, Bank Payments, and Bill Allocation

## Objective

Implement local payment recording and allocation for buyer collections and farmer payouts.

This phase must deliver:

- Cash and bank payment recording.
- Buyer receipts and farmer payouts.
- Partial and full settlement.
- Allocation across eligible obligations.
- Settlement of opening balances.
- Exact account and bill outstanding calculations.
- Safe payment reversal.
- Integration with Phase 25 correction restrictions.
- Desktop payment entry, review, history, and recovery.
- Atomic ledger, allocation, audit, and outbox writes.

A payment records money received or paid. An allocation identifies which obligations that payment settles.

These are separate effects: allocating an already-posted payment must not post the money movement again.

This phase records externally completed cash or bank activity. It does not initiate bank transfers or integrate with a payment gateway.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 08 financial decisions.
- Phase 21 ledgers and opening balances.
- Phase 22 sale obligations and buyer bills.
- Phase 24 farmer bills and source grouping.
- Phase 25 corrections, reversals, and allocation guards.
- Existing payment and allocation tables.
- Permissions, idempotency, numbering, audit, and outbox conventions.

Inspect the actual repository to determine:

1. The canonical identity of each buyer and farmer obligation.
2. How account balance signs work.
3. Which postings already recognize sale obligations.
4. How opening balances are represented.
5. How corrections retire or replace obligations.
6. Whether cash or bank account tracking already exists.
7. Which payment capabilities are available.

Reuse existing financial primitives.

Mark Phase 26 as `IN_PROGRESS`.

Preserve outstanding operator checks from previous phases.

---

## 2. Confirm Payment Rules

Document approved rules before implementing dependent posting.

| Decision | Required definition |
|---|---|
| Buyer receipt | Money received from a buyer |
| Farmer payout | Money paid to a farmer |
| Supported methods | Cash and manually recorded bank transfer |
| Recognition | When a payment is considered completed |
| Allocation | Explicit selection or approved automatic ordering |
| Partial settlement | Amounts allowed against each obligation |
| Excess amount | Rejection or approved unapplied credit/advance |
| Opening balances | Eligible direction and settlement identity |
| Bank metadata | Required account, reference, and transaction date |
| Payment date | Business-effective date and backdating restrictions |
| Reversal | Who may reverse and under which conditions |
| References | Receipt/payout numbering conventions |
| Cash/bank accounts | Tracking model required by the approved architecture |

Follow existing decisions instead of reopening resolved choices.

If allocation ordering is unspecified, provide explicit operator-selected allocations. Do not silently assume FIFO.

Do not enable unapplied credits, advances, refunds, or opposite-direction payments without approved semantics.

Continue independent work when a rule is unresolved. Keep only the affected operation unavailable.

---

## 3. Define Financial Effects Clearly

Use the Phase 21 sign convention.

A buyer receipt reduces the buyer’s obligation to the stall.

A farmer payout reduces the stall’s obligation to the farmer.

The payment amount affects the party account once.

Allocation changes which obligations remain outstanding. It does not independently change the party account balance.

For example, using synthetic amounts:

- Buyer obligations total `10,000`.
- A receipt of `4,000` reduces the account balance to `6,000`.
- Allocating that receipt to a bill reduces that bill’s outstanding amount by `4,000`.
- The allocation must not reduce the account balance by another `4,000`.

If double-entry accounting is already approved, also post the required cash/bank counterpart.

If the system uses party subledgers, preserve that model. Do not introduce an unrelated general ledger in this phase.

Do not recognize sales or commission again when collecting or paying money.

---

## 4. Establish Payment and Allocation Invariants

Enforce:

1. Posted payment amounts, methods, parties, and financial dates are immutable.
2. Every payment has a stable source identity.
3. Each payment posts its financial effect once.
4. Active allocations cannot exceed the payment’s available amount.
5. Active allocations cannot exceed the target obligation’s remaining amount.
6. Payment and obligation must share the permitted party account, stall, currency, and settlement direction.
7. Reversed or superseded obligations cannot receive new allocations.
8. A payment cannot settle the same underlying entitlement twice through different documents.
9. Drafts and previews have no financial effect.
10. Failed transactions leave no partial payment or allocation.
11. Reversal preserves the original payment and allocation history.
12. Bill status derives from authoritative obligations and allocations.
13. Account balance and bill outstanding are distinct values.

Use exact money arithmetic.

Never use floating-point tolerances to hide allocation differences.

---

## 5. Reuse Canonical Obligation Identities

Build allocation targets from the existing financial source model.

Support approved targets such as:

- Buyer sale obligations.
- Farmer sale entitlements.
- Posted opening-balance obligations.

Buyer and farmer bills provide navigation and grouping.

They must not introduce duplicate settlement targets for the same financial obligation.

For a farmer bill containing several source entitlements:

- Expand selection into its eligible source obligations.
- Allocate using explicit amounts or the approved deterministic distribution rule.
- Preserve source-level allocation references.
- Derive bill settlement from those underlying allocations.

A payment against a farmer bill must not coexist with another allocation against the same source entitlement beyond its remaining amount.

Opening balances must remain distinguishable from sales.

Do not fabricate historical bills to settle an opening balance.

Respect Phase 25 correction lineage when identifying current eligible obligations.

---

## 6. Implement Exact Allocation Calculations

Create or extend pure domain functions for:

- Payment amount validation.
- Available payment amount.
- Obligation remaining amount.
- Allocation proposal validation.
- Bill outstanding aggregation.
- Payment reversal effects.

Use these conceptual relationships with the repository’s approved representation:

`Payment available = posted payment amount − active allocations`

`Obligation remaining = effective obligation amount − active settlement allocations`

Account for reversals and correction lineage explicitly.

Reject invalid negative results rather than silently clamping them to zero.

For supported unapplied payments:

`Payment amount = allocated amount + unapplied amount`

For fully allocated-only workflows:

`Payment amount = allocated amount`

Validate duplicate targets and unsupported precision.

If automatic allocation is approved, define deterministic ordering, including tie-breaking. Return the proposed allocation breakdown for review before posting.

Do not redistribute amounts silently during commit.

---

## 7. Implement Cash and Bank Method Validation

### Cash

Record:

- Party account.
- Direction.
- Exact amount and currency.
- Business-effective date.
- Relevant cash location/account if already required.
- Actor and recording timestamp.
- Optional bounded reference or note.

Do not infer cash-drawer opening funds or available physical cash from party ledger balances.

### Bank transfer

Record the approved metadata, including:

- Stall bank-account reference where required.
- Transfer reference.
- Transfer date.
- Exact amount and currency.
- Direction.
- Confirmation that the operator is recording completed activity.

A typed transfer reference is not independent bank verification.

Do not mark a pending bank instruction as completed money movement.

If pending transfers are required later, keep them separate from posted payments.

Do not store bank passwords, login credentials, or unnecessary full account details.

Do not enforce global uniqueness on human-entered bank references unless the business rule supports it. Use them for duplicate warnings where appropriate.

Cheques are outside this phase. Do not represent them as cash or bank transfers to bypass method rules.

---

## 8. Add Shared Contracts and Forward Migrations

Extend contracts for:

- Eligible obligation queries.
- Payment preview.
- Payment posting with allocations.
- Payment detail and history.
- Allocation of an existing unapplied payment, if supported.
- Allocation release/reassignment, if approved.
- Payment reversal preview and commit.
- Operation outcome lookup.

Client requests must not control tenant scope, actor identity, calculated balances, or ledger lines.

Use forward-only migrations for necessary:

- Payment headers.
- Immutable financial metadata.
- Allocation events or records.
- Allocation release/reversal relationships.
- Payment reversal relationships.
- Receipt/payout references.
- Idempotency results.
- Scope-safe indexes and constraints.

Use the next available migration number.

Do not edit applied migrations.

Prevent duplicate business postings and repeated allocation reversals.

Cross-row allocation totals must be checked inside the authoritative write transaction; row-level constraints alone are insufficient.

Test upgrades containing finalized bills, farmer-bill groups, openings, and corrected sales.

---

## 9. Implement Authoritative Payment Preview

The preview service must:

1. Authenticate the operation.
2. Resolve the party account and direction.
3. Load selected current obligations.
4. Check eligibility and remaining amounts.
5. Validate method metadata.
6. Validate the payment amount.
7. Build or validate explicit allocations.
8. Calculate unapplied remainder if supported.
9. Return account and obligation effects.
10. Return a verifiable revision/fingerprint.

Show:

- Party.
- Receive/pay direction.
- Method.
- Payment amount.
- Allocations.
- Remaining amounts after payment.
- Unapplied amount, if permitted.
- Account balance effect.
- Blocking validation errors.

Preview must not post money, allocate funds, or consume issued references.

If another operation changes outstanding amounts, require a refreshed review.

Do not silently reduce the payment or change its allocations.

---

## 10. Post Payments Atomically

Use one authoritative SQLite transaction.

The operation must:

1. Validate device, session, and capability.
2. Resolve tenant and stall.
3. Check idempotency.
4. Reload the party and selected obligations.
5. Recheck account readiness and correction state.
6. Recheck outstanding amounts and reviewed versions.
7. Validate method metadata and exact allocation totals.
8. Allocate the approved payment reference.
9. Persist the immutable payment.
10. Post its financial effect through Phase 21.
11. Persist its allocations.
12. Update rebuildable settlement projections.
13. Write audit records.
14. Append outbox events.
15. Persist the operation result.
16. Commit.

Do not commit the payment and its requested allocations separately.

A stale allocation must cause the whole operation to fail with a reviewable conflict.

Do not automatically record an unapplied payment after an allocation failure unless the user explicitly reviewed that outcome.

Keep external network calls and printing outside the transaction.

---

## 11. Support Existing Unapplied Payments Only Where Approved

If credits or advances are supported, allow authorized allocation of their remaining amount.

This operation must:

- Reference the original payment.
- Validate the same account, currency, and direction.
- Recheck the payment’s available amount.
- Recheck target eligibility.
- Record allocations atomically.
- Write audit and outbox records.
- Leave the account ledger balance unchanged.

If releasing or reassigning allocations is approved:

- Preserve original allocation records.
- Add linked release/reversal events.
- Require a reason and appropriate permission.
- Prevent releasing an allocation twice.
- Commit release and reassignment atomically when requested together.

Do not post another receipt or payout during reassignment.

Do not use allocation release to conceal an actual refund or new cash movement.

If these workflows are unsupported, return explicit errors and document the limitation.

---

## 12. Implement Payment Reversal

Provide a restricted full-payment reversal workflow for recording errors.

The preview must show:

- Original payment.
- Original financial effect.
- Allocations that will be released.
- Obligations that will reopen.
- Resulting account balance effect.
- Required reason.

Within one transaction:

1. Verify authorization and payment eligibility.
2. Recheck current allocation dependencies.
3. Create an exact opposite financial posting.
4. Reverse the payment’s active allocations.
5. Link the reversal to the original payment.
6. Update settlement projections.
7. Record audit and outbox events.
8. Persist the idempotent result.

Do not delete or edit the original payment.

Prevent duplicate reversal.

A bookkeeping reversal is not a bank transfer or cash refund. Label the workflow accordingly.

Do not implement refunds or partial payment reversals unless approved. Block unsupported downstream dependencies rather than partially reversing a payment.

A corrected payment can be recorded as a new linked operation under the approved workflow.

---

## 13. Integrate with Phase 25 Corrections

Update Phase 25 dependency checks to use real allocation state.

Corrections and payment posting must serialize against the same obligation eligibility.

Guarantee:

- A payment cannot allocate to an obligation reversed concurrently.
- A correction cannot overlook an allocation committed concurrently.
- Unsupported corrections to allocated obligations remain blocked.
- Replacement obligations do not inherit allocations automatically.
- Released allocations remain visible in history.

Recheck dependencies inside write transactions.

Do not automatically reverse a payment to permit sale correction.

Add a clear path from blocked correction details to the relevant payment history, subject to permissions.

If allocation release later permits a correction, the resulting unapplied payment must remain accounted for and visible.

---

## 14. Derive Bill Settlement Status

Add authoritative settlement summaries to bill APIs.

For eligible current obligations, derive:

- Original/effective amount.
- Active allocated amount.
- Remaining amount.
- Settlement status.

Use statuses such as:

- Unpaid.
- Partially paid.
- Paid.

Handle zero-value obligations explicitly under the approved rule.

Keep reversed, superseded, and adjusted document status separate.

Do not display a reversed document as “Paid” merely because its current collectible amount is zero.

For farmer bills, aggregate the underlying source entitlements without creating new debt.

A bill generated after an entitlement was already settled must show the existing settlement.

Do not determine bill status from the party’s net account balance.

Do not apply unapplied account credits automatically without an allocation operation.

---

## 15. Add Permissions and Service Routes

Follow existing route and capability conventions.

Provide appropriate separation for:

- Viewing payments.
- Recording buyer receipts.
- Recording farmer payouts.
- Allocating existing payments.
- Releasing allocations, if supported.
- Reversing payments.
- Managing payment account references, if required.

Inspect existing cashier permissions before assigning defaults.

Do not grant payment reversal simply because a user can collect cash.

Do not reuse bill-finalization or opening-posting capabilities as payment authorization.

All routes must enforce:

- Device authorization.
- Valid staff session.
- Tenant and stall isolation.
- Capability checks.
- Existing offline-access restrictions.
- Bounded inputs and queries.

Use stable errors for stale allocations, insufficient remainder, ineligible obligation, duplicate operation, reversed payment, and permission denial.

Preserve production fail-closed authentication.

---

## 16. Build the Desktop Payment Workflow

Use the existing app shell and design system.

Provide entry points from:

- Buyer account.
- Farmer account.
- Eligible bill detail.
- Payment workspace.

### Entry

Show:

- Selected party and account role.
- Clear “Receive from buyer” or “Pay farmer” action.
- Cash or bank method.
- Amount.
- Date.
- Required method metadata.
- Eligible obligations and proposed allocations.

Keep account balance separate from selected bill outstanding.

### Review

Show:

- Money direction.
- Amount and method.
- Allocation breakdown.
- Remaining balances.
- Unapplied amount, if supported.

Require an explicit posting action.

### Result and history

Show:

- Committed payment reference.
- Method and direction.
- Amount.
- Allocation details.
- Reversal links.
- Recording actor and dates.

Provide keyboard navigation and inline validation.

Do not label a preview as a receipt.

Do not add printer integration before Phase 29.

---

## 17. Handle Retries and Connection Failures

Reuse the existing operation-recovery pattern.

Before posting, establish a stable idempotency key and fixed reviewed payload.

Repeated clicks or shortcuts must not create new operations.

If the response is lost:

- Show an unknown-outcome state.
- Retain the original operation identity.
- Look up the outcome.
- Retry the same payload and key when appropriate.
- Do not instruct the operator to collect or pay the money again.

The application records physical activity; a network timeout does not prove that money was not exchanged.

For different idempotency keys, warn about suspiciously similar recent payments where useful, but do not reject legitimate equal-value payments solely because their amounts match.

Require authentication before recovering protected results.

Preserve approved operation metadata across restart without storing session secrets or sensitive payloads in renderer storage.

---

## 18. Add Audit and Outbox Events

Capture:

- Payment posted.
- Allocation created.
- Allocation released, where supported.
- Payment reversed.

Include:

- Tenant and stall.
- Party account.
- Payment and operation IDs.
- Direction and method.
- Exact amount and currency.
- Business date and recording timestamp.
- Obligation and allocation references.
- Ledger posting references.
- Actor and device.
- Reversal relationships.
- Event schema version.

Commit events with their source operation.

Document that allocation events do not represent additional cash movement.

Future cloud consumers must not count both payment posting and allocation as separate receipts or payouts.

Avoid unnecessary sensitive bank data in events and logs.

---

## 19. Add Financial and Concurrency Tests

Use independently calculated synthetic fixtures.

### Core examples

- Obligation `10,000`; payment `4,000` → remaining `6,000`.
- Second payment `6,000` → remaining `0`.
- Obligations `3,000` and `7,000`; payment `5,000` allocated `3,000 + 2,000` → remaining `0` and `5,000`.
- Reversal of the first partial payment restores the corresponding remaining amount exactly.
- Allocation of an existing unapplied payment changes bill outstanding but not account balance.

### Service tests

Cover:

- Buyer receipt and farmer payout signs.
- Cash and bank metadata validation.
- Opening-balance settlement.
- Farmer-bill expansion to source obligations.
- Same obligation selected through multiple document paths.
- Partial and full allocation.
- Excess payment rejection or approved remainder.
- Duplicate target IDs.
- Currency, account, and scope mismatch.
- Idempotent retry and payload mismatch.
- Concurrent payments against the same remaining amount.
- Concurrent allocations from the same unapplied payment.
- Payment versus sale-correction races.
- Payment reversal versus allocation races.
- Exact reversal and prevention of double reversal.
- Rollback after ledger, allocation, audit, or outbox failure.
- Lost response after commit.
- Unauthorized and expired sessions.

### UI and integration tests

Cover:

- Keyboard entry and review.
- Stale outstanding amounts.
- Duplicate-action prevention.
- Unknown-outcome recovery.
- Accurate bill statuses.
- Logout and late responses.
- Payment history and reversal navigation.
- Sales → farmer bill → payout without duplicate obligations.

Run relevant Phase 21–25 regression tests.

---

## 20. Document Operator Acceptance and Completion

Create or update:

`docs/operations/cash-bank-payments-and-bill-allocation.md`

Include a development/staging checklist:

1. Back up the database.
2. Apply pending migrations without reset.
3. Restart service and desktop.
4. Refresh authorized staff permissions.
5. Finalize a test buyer sale.
6. Record a partial cash receipt.
7. Verify one ledger effect and partial bill settlement.
8. Record the remainder by bank transfer.
9. Verify full settlement.
10. Generate a farmer bill.
11. Record a partial farmer payout.
12. Verify farmer liability decreases once.
13. Allocate across multiple eligible obligations.
14. Settle a supported opening balance.
15. Retry a posted operation and verify no duplication.
16. Reverse a test payment and verify obligations reopen.
17. Verify a sale correction with active allocations is blocked where unsupported.
18. Test unapplied-payment allocation only if implemented.
19. Test concurrent settlement from another terminal when available.
20. Verify restricted staff cannot reverse payments.
21. Restart and recover payment history and statuses.

Use:

`pnpm --filter @polivo/db-local db:migrate`

Record pending physical-terminal checks accurately.

Document:

- Supported methods and directions.
- Recognition rules.
- Allocation identity and ordering.
- Excess-payment behavior.
- Reversal versus refund.
- Correction restrictions.
- Payment and bill status meanings.
- Recovery after uncertain outcomes.
- Cheque integration boundary for Phase 27.

Update context files and the progress tracker.

Run applicable formatting, lint, type, domain, database, service, UI, end-to-end, and build checks.

Report files changed, migrations, financial behavior, permissions, test results, pending checks, and readiness for Phase 27.

## Acceptance Criteria

- Buyer receipts and farmer payouts post exact financial effects once.
- Cash and bank payments use validated method metadata.
- Partial and full allocations are supported.
- Opening obligations remain separately identifiable.
- Bills share canonical obligations without duplicate settlement.
- Allocations never post the money movement again.
- Concurrent operations cannot overallocate.
- Payment reversal preserves history and restores settlement correctly.
- Phase 25 checks real payment dependencies.
- Bill settlement is derived independently of account net balance.
- Retries and uncertain outcomes cannot duplicate payments.
- Financial, allocation, audit, and outbox changes commit atomically.
- Tests pass and remaining acceptance work is documented.