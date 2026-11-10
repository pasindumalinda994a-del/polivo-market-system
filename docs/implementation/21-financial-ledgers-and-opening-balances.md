# 21 — Financial Ledgers and Opening Balances

## Objective

Implement the financial ledger foundation and controlled opening-balance workflow for the Polivo Market System.

This phase must deliver:

- Exact, auditable farmer and buyer/trader account movements.
- A shared posting interface for later sales, billing, and payment phases.
- Deterministic balance calculations.
- Authorized opening-balance entry and posting.
- Immutable posted financial records.
- Transactional audit and outbox integration.
- Desktop account views and opening-balance controls.
- Tests for financial correctness, retries, concurrency, and tenant isolation.

Follow the approved accounting model from Phase 08. Do not introduce a general ledger, chart of accounts, or accounting treatment that has not been approved.

This phase establishes the foundation. Sales posting, payment allocation, full statements, and production data import belong to later phases.

---

## 1. Review the Existing Repository

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical files in `docs/context/`.
- Phase 08 financial rules and decision records.
- Existing local schema and migrations.
- Farmer and buyer/trader implementations.
- Phase 20 commission engine and immutable policy versions.
- Money, currency, timestamp, and business-date utilities.
- Authentication and capability conventions.
- Transaction, idempotency, audit, and outbox implementations.

Inspect existing sales, bills, payments, and balance fields before designing additions.

Identify:

1. The approved accounting model.
2. The authoritative source of account balances.
3. Existing financial tables that should be extended.
4. How parties and their farmer/buyer roles are represented.
5. How tenant and stall scope is enforced.
6. Which workflows will call the posting interface later.

Do not create a parallel ledger if an appropriate foundation already exists.

Mark Phase 21 as `IN_PROGRESS`.

Previously pending operator checks must remain accurately recorded. Determine which genuinely block this phase rather than silently marking earlier work complete.

---

## 2. Confirm the Accounting Rules

Create a concise accounting-rule map from approved requirements.

Confirm:

| Decision | Required definition |
|---|---|
| Accounting model | Party subledger, double-entry ledger, or approved alternative |
| Buyer balance | Meaning of an amount owed by or owed to a buyer |
| Farmer balance | Meaning of an amount owed to or owed by a farmer |
| Balance signs | Stored sign convention and human-readable labels |
| Currency | Supported currency and monetary precision |
| Account scope | Tenant, stall, party, and role dimensions |
| Opening cutoff | Which historical activity an opening amount includes |
| Business dates | Timezone and date semantics |
| Opening corrections | Approved reversal and replacement behavior |
| Overpayments/advances | Whether opposite-direction balances are supported |
| Permissions | Who may view, prepare, and post opening balances |

A person who is both farmer and buyer must follow the approved account-separation rules. Do not automatically net farmer payables against buyer receivables.

For a party-subledger model, define how each future source affects the party balance.

For an approved double-entry model, also define:

- Required account mappings.
- Debit and credit conventions.
- The approved opening-balance counterpart.
- Per-currency balancing rules.

Do not invent an opening-equity or suspense account.

If a rule remains unresolved:

- Document it.
- Continue independent implementation.
- Keep dependent posting unavailable with an explicit error.
- Use clearly labeled synthetic rules only in automated tests.

---

## 3. Establish Financial Invariants

Enforce these invariants at the appropriate domain, service, and database layers:

1. Posted financial entries are immutable.
2. Balances derive from posted entries.
3. Drafts have no financial effect.
4. Every posting has an identifiable source.
5. Repeating a successful operation does not duplicate its financial effect.
6. A posting cannot reference another stall’s party or source.
7. All amounts use the project’s exact money representation.
8. Corrections preserve the original entry and its audit trail.
9. A failed transaction leaves no partial financial changes.
10. Account deactivation never deletes financial history.
11. Different currencies are never summed into one balance.
12. Posted entries cannot be edited through ordinary CRUD operations.

If double-entry accounting is approved, additionally require every posted journal to balance per currency before commit.

A cache or summary table may improve reads, but it must be reconstructible from authoritative entries.

Do not maintain an independently editable `currentBalance` field on a party record.

---

## 4. Implement Shared Domain Types and Calculations

Use the existing domain and contracts packages.

Define or extend types for:

- Financial account identity.
- Posting source identity.
- Posting or journal identifier.
- Ledger entry.
- Opening-balance draft.
- Opening-balance posting result.
- Reversal reference.
- Account balance result.
- Paginated movement query.

Use project naming conventions.

Represent source identity with enough information to distinguish legitimate events, such as:

- Source type.
- Source identifier.
- Financial event type.
- Relevant event version or sequence, where required.

Do not rely solely on a request idempotency key to prevent duplicate business postings.

Implement pure functions for:

- Validating amounts.
- Applying the approved sign convention.
- Summing movements exactly.
- Deriving balance direction and display labels.
- Validating opening entries.
- Constructing an exact reversal.

Avoid ambiguous UI labels such as “positive balance.”

Use explicit labels derived from the approved convention, such as:

- Buyer owes stall.
- Stall owes buyer.
- Stall owes farmer.
- Farmer owes stall.

Support only approved balance directions.

For zero opening amounts, record completion through opening-workflow metadata if needed rather than creating meaningless zero-value financial movements.

---

## 5. Add Forward-Only Database Migrations

Inspect the current migration sequence and use the next available number.

Never edit applied migrations or reset an existing database.

Reuse or extend existing structures for:

- Financial accounts, if required by the approved model.
- Posting headers and entry lines.
- Source references.
- Opening drafts or opening batches.
- Opening completion and cutoff metadata.
- Reversal links.
- Revisions and idempotency records.

Store, as appropriate:

- Tenant and stall scope.
- Party and role/account identity.
- Currency.
- Exact amount.
- Posting source and event.
- Business-effective date.
- Recorded timestamp.
- Actor identity.
- Description or reason.
- Original posting reference for reversals.

Add:

- Foreign keys.
- Scope-safe relationships.
- Unique business-event constraints.
- Amount and status checks.
- Indexes for account history and source lookup.
- Protection against duplicate opening completion.

Enforce posted-record immutability using existing project conventions and database safeguards where practical.

Ensure uniqueness includes the correct account, currency, scope, and event dimensions.

Do not use a nullable uniqueness design that unintentionally permits duplicate financial effects.

Test both a fresh database and an upgrade containing existing party and configuration data.

---

## 6. Implement a Transaction-Aware Posting Service

Create an internal posting interface that later business services can call within an existing SQLite transaction.

A future sale or payment must be able to commit:

- Its business record.
- Its ledger effects.
- Audit records.
- Outbox events.
- Idempotency result.

All must succeed or fail together.

Do not commit a ledger transaction independently from the source business operation.

The posting service must:

1. Validate the source operation and account references.
2. Verify scope.
3. Validate the financial entries.
4. Enforce business-event uniqueness.
5. Persist immutable posting records.
6. Update any rebuildable projections.
7. Return a stable posting result.

Keep source-specific accounting rules in domain services.

Do not expose an unrestricted endpoint that lets clients submit arbitrary ledger lines.

Opening-balance routes must build their posting through the authorized opening-balance service.

Later billing and payment services must do the same for their respective source events.

---

## 7. Implement Balance and Movement Queries

Provide scoped queries for:

- Current account balance.
- Balance at an approved business date.
- Paginated account movements.
- Posting details.
- Source lookup.
- Reversal relationships.

Use only posted entries.

Define how business-effective dates differ from recording timestamps.

Use a deterministic ordering key for entries sharing a date or timestamp. Follow the existing sequence convention or introduce an explicit local posting sequence if necessary.

For running balances:

- Include the balance preceding the requested page.
- Do not restart the running balance at zero on every page.
- Use a consistent read snapshot where multiple queries form one response.

Clearly document whether historical queries represent:

- Entries effective by a business date, or
- Entries known to the system at a particular recording time.

Do not silently treat these as equivalent.

Keep query results scoped to the authenticated stall.

For newly created accounts with no entries, return an explicit zero balance.

Keep inactive parties’ histories accessible to authorized users.

---

## 8. Implement Controlled Opening-Balance Preparation

Opening balances represent pre-system outstanding amounts at an approved cutoff.

They are not ordinary payments, sales, or commission income.

Provide a preparation workflow that allows authorized staff to:

1. Select an existing farmer or buyer account.
2. Select the approved balance direction.
3. Enter an exact amount.
4. Supply the opening cutoff or use the established batch cutoff.
5. Add a reference and explanation.
6. Review the resulting account effect.
7. Save a draft where supported.

Validate:

- Party and account existence.
- Correct stall and tenant.
- Currency and precision.
- Supported balance direction.
- Cutoff consistency.
- Duplicate opening attempts.
- Existing operational activity under the approved cutover rule.

Do not silently assume that every farmer opening is payable or every buyer opening is receivable.

An opening amount must never be automatically allocated to fabricated historical bills.

If later payment allocation needs to settle an opening amount, document a dedicated opening-item reference or the approved alternative for that later phase.

Do not implement payment allocation now.

---

## 9. Post Opening Balances Atomically

Provide an explicit review and confirmation action.

Within one transaction:

1. Revalidate authentication, permissions, and scope.
2. Check the expected draft or batch revision.
3. Recheck opening eligibility.
4. Check business-event uniqueness.
5. Create the immutable financial posting.
6. Mark the opening workflow complete.
7. Write audit records.
8. Append outbox events.
9. Persist the idempotent operation result.

Protect eligibility checks against concurrent operational postings.

The check that an account may receive an opening balance must not race with a sale or payment being recorded.

Use the existing SQLite transaction strategy and approved cutover rule.

Do not allow users to repeatedly add “opening balances” to adjust an account.

Do not mark all accounts initialized merely because one account has been posted.

If batch posting is supported, define whether posting is atomic for the entire batch or per account. Show partial completion explicitly when using per-account transactions.

Avoid building bulk import in this phase.

---

## 10. Preserve Opening-Balance Corrections

Posted opening balances must not be edited or deleted.

If opening correction is approved for this phase, implement a restricted workflow that:

- Requires the appropriate permission.
- Requires a reason.
- References the original opening posting.
- Creates an exact reversal.
- Creates the approved replacement when required.
- Preserves the original cutoff semantics.
- Commits related changes atomically.
- Prevents a second reversal of the same posting.

Determine from approved rules whether correction remains allowed after operational activity or allocation begins.

If that rule is unresolved, deny correction in those conditions.

Do not create a generic balance-adjustment endpoint as a shortcut.

A replacement must correct the original opening event rather than create an unrelated second opening.

---

## 11. Add Contracts, Permissions, and Routes

Follow established service routing and schema conventions.

Expose only the necessary operations:

- Account balance.
- Account movement history.
- Posting detail.
- Opening draft preparation and editing, if supported.
- Opening review.
- Opening posting.
- Restricted opening correction, if approved.

Apply existing local session and device authorization.

Separate permissions for:

- Viewing account balances.
- Preparing opening balances.
- Posting opening balances.
- Correcting posted openings, where supported.

Reuse approved capabilities or register clearly scoped new ones through the existing capability system.

Do not reuse `parties.register_edit`, `catalog.manage`, or `commission.manage` merely to avoid adding the correct permission.

Do not grant financial posting to billing staff or cashiers by assumption.

Existing users may require a trusted permission refresh. Document this without weakening session checks.

Keep unresolved production authentication policy fail-closed.

Validate all request bodies, query parameters, pagination limits, and identifiers.

Never trust client-provided account balances, actor identities, or tenant scope.

---

## 12. Build the Desktop Account and Opening Interfaces

Use the existing app shell and design system.

### Account summary

Within the appropriate farmer or buyer detail view, show:

- Balance amount.
- Clear balance direction.
- Currency.
- Opening status.
- Link to account movements.

### Account movements

Show:

- Business date.
- Recording time where useful.
- Source type and reference.
- Description.
- Movement amount and direction.
- Running balance.
- Reversal relationship.

Use pagination.

Distinguish opening entries from sales, payments, and reversals.

### Opening-balance editor

Provide:

- Party/account selection.
- Balance direction.
- Exact amount input.
- Cutoff details.
- Reference and explanation.
- Review summary.
- Explicit posting action.

Make it clear when a draft has no financial effect.

After successful posting, show the committed reference and updated balance.

Handle:

- Missing permission.
- Invalid input.
- Duplicate opening.
- Stale revision.
- Service disconnection.
- Session expiry.
- Unknown request outcome after connection loss.

For an unknown outcome, retry or look up the original operation using its stable idempotency identity. Do not create a new financial operation automatically.

Clear account data and drafts on logout according to existing security rules.

---

## 13. Integrate Audit and Outbox Records

Use existing event conventions.

Opening posting and correction events must identify:

- Tenant and stall.
- Account and party.
- Posting identifier.
- Source operation.
- Exact financial amounts.
- Currency.
- Business-effective date.
- Recording timestamp.
- Actor.
- Reversal or replacement links.
- Event schema version.

Persist events in the same transaction as the financial operation.

Keep event payloads sufficient for the planned cloud reporting projection without exposing credentials or unnecessary personal data.

Do not synchronize a mutable balance as the sole financial truth.

Do not build cloud ingestion or the sync worker during this phase.

---

## 14. Add Financial and Failure Tests

### Domain tests

Cover:

- Approved farmer and buyer balance directions.
- Exact addition and subtraction.
- Zero balances.
- Supported opposite-direction balances.
- Invalid precision and numeric range.
- Currency separation.
- Exact reversals.
- Approved double-entry balancing, if applicable.

### Repository and service tests

Cover:

- Opening posting.
- Duplicate business-source rejection.
- Idempotent retry.
- Reused idempotency key with changed input.
- Concurrent opening attempts.
- Stale draft revisions.
- Race between opening eligibility and operational posting.
- Full rollback after an injected failure.
- Atomic audit and outbox persistence.
- Posted-entry immutability.
- Reversal uniqueness.
- Tenant and stall isolation.
- Unauthorized and expired sessions.
- Inactive party history.
- Current and historical balances.
- Running balances across pages.
- Deterministic ordering.
- Projection rebuild, if a projection exists.

Verify that creating or reprinting a bill will not become a second posting source for a sale already posted under the chosen financial event model. Document the integration contract for later phases.

### UI tests

Cover:

- Clear balance direction labels.
- Draft versus posted state.
- Review and confirmation.
- Permission restrictions.
- Duplicate-submission handling.
- Connection loss after commit.
- Logout state clearing.

Use synthetic financial fixtures with independently calculated expected results.

---

## 15. Prepare the Operator Acceptance Checklist

Document this checklist for a development or staging stall:

1. Back up the existing local database.
2. Apply pending migrations without resetting the database.
3. Restart the stall service.
4. Refresh the authorized local session if capabilities changed.
5. Open a test farmer account with no entries.
6. Verify zero balance and opening status.
7. Prepare an approved test opening amount.
8. Confirm the draft does not change the balance.
9. Post it and verify the balance and movement.
10. Retry the operation and confirm no duplicate effect.
11. Verify a second opening attempt is rejected.
12. Repeat for a test buyer account.
13. Test opposite-direction balances only if supported.
14. Verify unauthorized staff cannot post openings.
15. Check audit and outbox records.
16. Test an approved opening correction, if implemented.
17. Confirm the original entry remains visible.
18. Verify balances persist after service restart.
19. Check a second terminal sees the same committed result when available.

For an existing database, use:

`pnpm --filter @polivo/db-local db:migrate`

Do not run database initialization or reset commands.

Record checks that could not be performed as pending.

---

## 16. Document and Report Completion

Create or update:

- `docs/operations/financial-ledgers-and-opening-balances.md`
- Relevant architecture and business-rule documentation.
- The progress tracker.

Document:

- Account scope and sign convention.
- Authoritative posting sources.
- Opening cutoff semantics.
- Exact-money representation.
- Permissions.
- Posting and reversal invariants.
- Duplicate prevention.
- Balance-query semantics.
- Future sales and payment integration.
- Outstanding decisions and acceptance checks.

Run applicable repository scripts for:

- Formatting.
- Linting.
- Type checking.
- Domain tests.
- Database and service integration tests.
- Desktop tests.
- Builds.

Report:

1. Files and migrations changed.
2. Accounting rules implemented.
3. Posting and opening-balance behavior.
4. Permission changes.
5. Tests executed and results.
6. Manual checks completed or pending.
7. Unresolved decisions.
8. Readiness for Phase 22.

Separate implementation completion from operator acceptance and production readiness.

## Acceptance Criteria

- Financial balances derive from immutable posted entries.
- Money calculations are exact.
- Approved account signs and directions are explicit.
- Opening amounts have a defined cutoff and controlled posting workflow.
- Duplicate requests and duplicate source events cannot double-post.
- Opening eligibility is safe under concurrent operations.
- Corrections preserve original history.
- Financial changes, audit, and outbox records commit atomically.
- Tenant and stall boundaries are enforced.
- Desktop users can review account balances and authorized opening entries.
- Later sales and payment services can reuse the posting interface within their own transactions.
- Tests pass and outstanding acceptance work is documented accurately.