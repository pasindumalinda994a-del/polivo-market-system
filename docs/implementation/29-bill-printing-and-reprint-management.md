# 29 — Bill Printing and Reprint Management

## Objective

Implement reliable desktop printing for issued buyer and farmer bills, with auditable reprints and clear handling of uncertain printer outcomes.

This phase must deliver:

- Print templates for buyer and farmer bills.
- Authoritative print-data retrieval.
- Desktop printer discovery and configuration.
- Print preview.
- Printing through the Electron main process.
- Durable print-attempt tracking.
- Permission-controlled, clearly marked reprints.
- Safe recovery from failures without duplicate financial effects.
- A reusable printing foundation for payment receipts and account statements.

Printing must never create a sale, issue another bill number, post a payment, allocate funds, or change a financial balance.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Existing bill-layout requirements and approved sample documents.
- Phase 22 buyer-bill snapshots.
- Phase 23 finalized-bill UI and operation recovery.
- Phase 24 farmer-bill snapshots.
- Phase 25 correction and reversal relationships.
- Phases 26–27 payment records.
- Phase 28 statement snapshots.
- Electron main/preload security and IPC conventions.
- Local authentication, permissions, audit, and outbox patterns.

Inspect:

1. Installed Electron version and supported printing APIs.
2. Existing print or PDF dependencies.
3. Actual buyer and farmer bill view models.
4. Approved paper sizes and printer requirements.
5. Historical stall identity available in issued documents.
6. Current printer-routing assumptions.
7. Existing permission names.

Consult official documentation matching installed dependencies when implementing version-sensitive APIs.

Mark Phase 29 as `IN_PROGRESS`.

Do not assume that physical printer acceptance has already passed.

---

## 2. Establish Printing Boundaries

Use this responsibility split:

### Stall service

- Authorizes document access and print operations.
- Retrieves authoritative issued snapshots.
- Creates print jobs and attempts.
- Records audit history.
- Enforces reprint rules.

### Electron main process

- Enumerates printers available to that Windows session.
- Validates printer selection.
- Renders trusted print templates.
- Submits output to the operating-system print system.
- Reports the observed submission outcome.

### Desktop renderer

- Displays preview and status.
- Collects printer selection and reprint reason.
- Invokes narrow, typed IPC operations.

The renderer must not open SQLite, run shell commands, submit arbitrary HTML to a privileged print operation, or access session secrets.

Do not expose an unauthenticated LAN printing endpoint.

---

## 3. Confirm the Supported Printer Profile

Read approved hardware and layout requirements.

Record:

- Paper size or roll width.
- Printable width and margins.
- Supported orientation.
- Required language support.
- Intended number of copies.
- Local USB or Windows-installed network printer.
- Whether an approved printer requires vendor-specific behavior.

Do not assume all stalls use the same printer.

If physical hardware details are unavailable:

- Implement configurable profiles and preview rendering.
- Use explicitly labeled test profiles.
- Leave physical calibration pending.
- Do not claim support for an untested printer.

Prefer Windows-driver printing through the existing Electron stack unless an approved requirement calls for another approach.

Do not introduce raw ESC/POS commands, cash-drawer activation, or hardware cutter control without verified device requirements.

---

## 4. Define Document and Reprint Semantics

Distinguish:

- Issued bill.
- Print job.
- Submission attempt.
- Additional physical copy.
- Reprint.

An issued bill already exists before printing begins.

A failed print does not reverse or invalidate the bill.

A reprint preserves:

- Original document ID.
- Original bill number.
- Original issue date.
- Original financial amounts.
- Original party and item snapshots.

Add clearly separate print metadata:

- Reprint label.
- Print date/time.
- Copy or attempt reference where appropriate.

Do not replace the original issue date with the printing date.

Use one copy per normal submission unless the approved operational workflow requires multiple copies.

Any request for extra copies must be deliberate and auditable.

---

## 5. Build Authoritative Print View Models

Extend shared contracts with typed print view models.

For buyer bills, include approved customer-facing fields:

- Stall identity.
- Explicit buyer/trader bill type.
- Issued bill number.
- Buyer snapshot.
- Business and issue dates.
- Vegetable and package details.
- Weight and price.
- Line amounts.
- Bill total.

For farmer bills, include:

- Stall identity.
- Explicit farmer bill type.
- Issued bill number.
- Farmer snapshot.
- Covered sales dates.
- Source details required by the approved layout.
- Gross amounts.
- Recorded commission.
- Net entitlement.

Preserve the repository’s approved visible number formats, including existing type prefixes.

Do not disclose internal commission details on buyer bills or buyer personal information on farmer bills unless the approved layout requires them.

Use exact stored amounts. Printing must not recalculate commission or financial totals.

---

## 6. Separate Historical Content from Current Status

Use immutable issued snapshots for original bill content.

Represent later status separately, such as:

- Reversed.
- Superseded.
- Adjusted.
- Replacement reference.

A reprinted superseded bill must not look like the current valid replacement.

Keep original totals visible and clearly identify the document’s later status.

Do not overwrite the original document with replacement financial values.

If adding current payment information:

- Label it with its observation date or cutoff.
- Keep it separate from original issued amounts.
- Derive it from authoritative allocation data.
- Do not label an unpaid bill “Paid” merely because it was printed.

If historical stall name or address was not captured, document the limitation. Do not present current master data as a verified historical snapshot.

For new bills, extend snapshot capture through forward-compatible changes where needed.

---

## 7. Implement Versioned Print Templates

Create reusable templates with explicit template identifiers and versions.

Separate:

- Authoritative document data.
- Print-status annotations.
- Layout profile.
- Template rendering.

Support:

- Buyer bill.
- Farmer bill.
- Approved paper profiles.

Use local bundled assets and fonts.

Ensure Sinhala and English names render correctly without internet access.

Escape all user-controlled text.

Treat party names, notes, references, and item names as text, never executable markup.

Handle:

- Long names.
- Long vegetable descriptions.
- Large amounts.
- Multiple pages.
- Many weight rows.
- Mixed Sinhala and English.
- Missing optional fields.
- Leading-zero references.

Do not shrink text until it becomes unreadable merely to force everything onto one page.

Preserve a stable print payload and template version for each recorded attempt, or an equivalent reproducible representation with an integrity hash.

Document whether old layouts can be reproduced after application upgrades. Never claim pixel-identical historical reproduction without retaining the necessary artifacts.

---

## 8. Implement Pagination and Layout Rules

For paged paper:

- Repeat column headers where appropriate.
- Avoid splitting short item rows.
- Keep totals readable.
- Include document identity and page numbering where supported.
- Avoid orphaned headings.

For roll paper:

- Respect configured printable width.
- Wrap long text.
- Handle content exceeding driver-supported page height.
- Avoid clipping totals or producing large unexplained blank sections.

Use physical units for printer profiles.

Do not assume that a preview fitting a browser viewport guarantees correct physical output.

Wait for fonts and required assets to finish loading before preview capture or printer submission.

Use the same document model and template for preview and printing.

---

## 9. Add Printer Discovery and Configuration

Enumerate printers through Electron’s supported APIs.

Store settings per terminal/device where appropriate:

- Exact system printer identifier.
- Display label.
- Document profile.
- Paper configuration.
- Approved copy count.

A printer available on one terminal may not exist on another.

Do not store a single stall-wide printer name as though it is valid everywhere.

If a selected printer disappears:

- Show an actionable error.
- Require deliberate reselection.
- Do not silently send financial documents to another default printer.

Validate configuration before submission.

Provide a nonfinancial test page containing:

- Application and profile identifier.
- Alignment markers.
- Sinhala and English sample text.
- Representative numeric columns.
- A clear TEST label.

Test pages must not use real bill numbers or create financial records.

---

## 10. Use Terminal-Local Printing for the Initial Path

Submit printing from the desktop terminal that initiated it, using printers installed for that Windows session.

A Windows-installed network printer may be selected through the same mechanism.

Do not assume a terminal can directly use a USB printer attached to another PC.

If shared printing is required, document the Windows setup or follow an already-approved print-routing architecture.

Do not silently add a host print server, service-account printer access, or remote print agent.

Keep the architecture ready for an explicitly approved routing extension without implementing unnecessary infrastructure now.

---

## 11. Create Durable Print Jobs and Attempts

Inspect existing operational-event structures.

Add forward-only schema changes only where needed for:

- Print job identity.
- Document ID and type.
- Requested actor and device.
- Target printer/profile.
- Template version.
- Payload identity/hash.
- Initial print or reprint classification.
- Reprint reason.
- Submission attempts.
- Observed outcomes.
- Timestamps and correlation IDs.

Use the next available migration number.

Do not modify issued bill records to store a single unreliable `printed = true` flag.

Track states that reflect actual evidence, such as:

- Prepared.
- Submitting.
- Accepted by print system.
- Failed before submission.
- Cancelled before submission.
- Outcome unknown.

An application callback or spooler acceptance does not prove that paper physically emerged.

If operator confirmation is supported, record it separately as an operator observation.

---

## 12. Handle the Database-to-Printer Boundary Honestly

SQLite and the operating-system print spooler cannot share one atomic transaction.

Design explicitly for this boundary.

A safe flow is:

1. Authorize and prepare a durable attempt.
2. Obtain the trusted print payload.
3. Record that submission is starting.
4. Submit once from Electron main.
5. Record the observed result.
6. Display the corresponding status.

Do not hold a database transaction open while rendering or printing.

If the application crashes after submission but before recording the result, mark the recovered attempt as outcome unknown.

Do not automatically resubmit an unknown attempt.

If the service becomes unavailable after submission, retry reporting the same attempt result without submitting the document again.

Do not promise exactly-once physical printing.

Prevent avoidable duplicate application submissions and make unavoidable uncertainty visible.

---

## 13. Implement Idempotency and Reprint Controls

Use stable operation identities for job creation and attempt reporting.

Guarantee:

- Repeated job-creation requests return the same job.
- Repeated status reports do not create new attempts.
- Double clicks do not submit two copies.
- A reprint creates a new, explicitly authorized attempt.
- A new attempt never creates a new bill number.

Before resubmitting after an unknown outcome:

- Show the previous attempt.
- Ask the operator to check the printer and Windows queue.
- Require an explicit retry/reprint action.
- Mark the additional copy clearly.
- Record the reason.

Inspect the shared service history when multiple terminals print the same document.

Classify additional attempts conservatively when a prior submission was accepted or remains uncertain.

A confirmed failure before submission may be retried under the approved initial-print policy.

Do not classify every failed attempt as proof that no paper was printed.

---

## 14. Enforce Security and Permissions

Inspect existing print and reprint capabilities.

Require:

- Document-view permission.
- Appropriate print permission.
- Reprint permission where the approved model distinguishes it.

Do not assume `bills.finalize` authorizes unrestricted historical reprints.

Authorize at the service and validate IPC calls in Electron main.

Print IPC must accept bounded typed requests, not arbitrary:

- HTML.
- URLs.
- Filesystem paths.
- Shell commands.
- Printer control commands.

Validate the sender and expected application context.

Use a restricted print-rendering window with the project’s secure Electron settings.

Block unapproved navigation and external resource loading.

Keep credentials and financial payloads out of logs.

Clean up temporary print artifacts according to an explicit retention policy. Retain audit metadata without retaining unnecessary duplicate personal data.

---

## 15. Integrate Printing into Desktop Workflows

Add Print and Preview to:

- Finalized buyer-bill view.
- Farmer-bill detail.
- Bill history.

Show:

- Selected printer.
- Paper profile.
- Original versus reprint classification.
- Current document status.
- Submission outcome.
- Previous attempt history where authorized.

After sale finalization, printing must use the committed bill ID.

Do not resubmit sale finalization to retry printing.

If automatic printing after finalization is approved:

- Trigger it only after confirmed commit.
- Create one durable print operation.
- Do not retrigger from component rerenders, navigation, or duplicate responses.
- Keep bill success separate from print failure.

Otherwise, provide an explicit Print action.

Support keyboard navigation without allowing an ordinary Enter keypress in unrelated fields to submit another copy.

---

## 16. Support Receipts and Statements Through the Same Foundation

Reuse the print infrastructure for:

- Buyer payment receipts.
- Farmer payout acknowledgements.
- Account statements.

Keep templates and permissions distinct.

Payment documents must identify:

- Existing payment reference.
- Direction.
- Method.
- Exact amount.
- Allocation summary where appropriate.
- Reversal status.

Cheque payout acknowledgements may show recorded handover details. Do not imply bank clearance.

Account statements must use the complete Phase 28 snapshot:

- Party/account identity.
- Date range.
- Data cutoff.
- Opening balance.
- All ordered movements.
- Period totals.
- Closing balance.

Do not print only the visible UI page.

If the statement snapshot expires during preparation, require regeneration rather than mixing pages from different cutoffs.

Statements do not receive bill numbers.

Printing a receipt does not record another payment.

---

## 17. Record Audit and Operational Events

Record:

- Print request.
- Target document.
- Initial print or reprint.
- Reason for additional copy.
- Actor and terminal.
- Printer/profile.
- Template version.
- Attempt identity.
- Observed submission outcome.

Treat client-reported printer results as observations, not verified physical delivery.

Follow existing audit and outbox conventions where print history is intended to sync.

Print events must be operational events with no sales, payment, or ledger effect.

If result reporting fails, preserve enough approved local metadata to report the same attempt later.

Do not log full document contents by default.

---

## 18. Add Automated Tests

### Template tests

Cover:

- Buyer and farmer layouts.
- Exact stored monetary values.
- Sinhala and English text.
- Long names and descriptions.
- Multiple pages.
- Large amounts.
- Reprint labels.
- Reversed and superseded annotations.
- Historical snapshots after master-data changes.
- Receipt and statement variants.

Generate rendered previews and inspect representative output for clipping and pagination.

### Service and state tests

Cover:

- Scoped document retrieval.
- Permission denial.
- Job-creation idempotency.
- Duplicate attempt reporting.
- Concurrent requests from two terminals.
- Reprint classification.
- Unknown-outcome recovery.
- Result reporting after service reconnection.
- Payload/version integrity.
- No changes to bills, balances, payments, or allocations.

### Electron adapter tests

Mock the printer boundary to cover:

- No printers installed.
- Missing configured printer.
- Cancelled dialog.
- Accepted submission.
- Known pre-submission failure.
- Timeout or ambiguous failure.
- Crash-recovery state.
- Repeated button activation.
- Safe cleanup.
- Rejection of arbitrary HTML, URLs, and paths.

Automated mocks do not count as physical printer verification.

---

## 19. Prepare Physical Operator Acceptance

Document a development/staging checklist:

1. Confirm the Windows test page prints.
2. Select the exact printer in Polivo.
3. Choose the correct paper profile.
4. Print the Polivo nonfinancial test page.
5. Verify margins, alignment, and Sinhala text.
6. Preview and print a finalized buyer bill.
7. Verify the number and amounts against the screen.
8. Print a farmer bill and check gross, commission, and net.
9. Print a long bill and verify all lines and totals.
10. Reprint an existing bill with a reason.
11. Verify the same bill number and a clear reprint label.
12. Print a corrected or superseded document and verify its annotation.
13. Print a payment receipt and a multi-page statement.
14. Confirm statements include all pages and the correct cutoff.
15. Test a missing or offline printer using test documents.
16. Verify the UI reports uncertainty accurately.
17. Confirm no automatic duplicate submission after restart.
18. Test another terminal’s own printer configuration.
19. Verify restricted users cannot reprint protected documents.
20. Confirm financial balances and document counts remain unchanged.

Record:

- Printer model.
- Driver version.
- Windows version.
- Connection type.
- Paper profile.
- Successful document types.
- Known limitations.

If hardware is unavailable, leave physical acceptance pending. Do not mark production printing verified.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/bill-printing-and-reprints.md`

Document:

- Printer setup and routing.
- Supported paper profiles.
- Template versions.
- Print-status meanings.
- Initial print and reprint policy.
- Recovery after unknown outcomes.
- Windows queue troubleshooting.
- Permissions.
- Temporary-file retention.
- Physical acceptance results.

Update context files and the progress tracker.

Run applicable formatting, lint, type, service, renderer, Electron-adapter, integration, and build checks.

Use a database migration only where required, with backup and migration instructions. Never initialize or reset an existing operational database.

Report:

1. Files and migrations changed.
2. Supported document templates.
3. Printer profiles and routing.
4. Attempt tracking and recovery behavior.
5. Reprint permissions.
6. Automated test results.
7. Rendered-output checks.
8. Physical printer checks completed or pending.
9. Known device limitations.
10. Readiness for Phase 30.

## Acceptance Criteria

- Buyer and farmer bills print from authoritative issued snapshots.
- Original document identities and amounts remain unchanged.
- Templates support readable Sinhala and English.
- Printer configuration is correct for each terminal.
- Print requests use a narrow, secured Electron boundary.
- Attempts and reprints are durable and auditable.
- Spooler acceptance is not misrepresented as physical delivery.
- Unknown outcomes never trigger automatic resubmission.
- Reprints are clearly marked and permission-controlled.
- Receipts and statements reuse the same safe infrastructure.
- Printing has no financial side effects.
- Automated and physical verification are reported separately.