# 30 — Local Reports, Filters, and Exports

## Objective

Implement authorized local reporting and exports using the authoritative stall database.

This phase must deliver:

- Sales, commission, payment, and outstanding reports.
- Farmer, buyer, and vegetable breakdowns.
- Daily vegetable price reporting.
- Consistent filtering, pagination, and snapshot behavior.
- Exact reconciliation with existing financial records.
- CSV and PDF exports.
- Desktop report views and secure file saving.
- Export audit history and failure recovery.

All reports must work through the local stall service without requiring internet access.

Report generation and export must not create financial transactions, change allocations, or alter bill status.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Approved reporting requirements and business decisions.
- Phases 20–25 commission, sales, bills, and corrections.
- Phases 26–27 payments and cheque settlement.
- Phase 28 statements, outstanding queries, and reporting snapshots.
- Phase 29 document rendering and secure Electron printing.
- Existing permissions, query utilities, audit, and outbox conventions.

Inspect:

1. Authoritative source identities.
2. Correction and reversal relationships.
3. Business-effective dates and recording cutoffs.
4. Existing statement snapshot infrastructure.
5. Canonical obligation and allocation queries.
6. Existing report or export dependencies.
7. Any implemented inventory and price projections.

Reuse existing calculations and query services.

Mark Phase 30 as `IN_PROGRESS`.

Preserve pending physical printer and earlier operator acceptance checks without treating them as automatic blockers to independent report implementation.

---

## 2. Define the Report Catalog

Implement these reports using approved source data:

| Report | Main purpose |
|---|---|
| Sales summary | Gross sales, weight, commission, and farmer entitlement |
| Sales detail | Traceable finalized sale-line activity |
| Vegetable sales | Quantity and amount breakdown by vegetable |
| Farmer activity | Farmer-attributed sales, commission, and entitlement |
| Buyer activity | Buyer-attributed sales and obligations |
| Commission | Recorded commission by date and source |
| Payments | Receipts and payouts by method and direction |
| Outstanding | Remaining obligations and supported unapplied payments |
| Vegetable prices | Minimum, maximum, and approved average price |
| Corrections and reversals | Original, reversal, and replacement activity |

Reuse Phase 28 for account statements and historical outstanding.

Do not rebuild those calculations independently.

If an approved report depends on a feature that has not been implemented, record that dependency explicitly.

Do not fabricate:

- Inventory balances without authoritative stock movements.
- Cash-drawer balances without opening cash and complete cash activity.
- Profit without a defined revenue and expense model.
- Market-wide prices from one stall’s sales.

---

## 3. Document Each Metric

Create a report-definition registry or equivalent documented contract.

For every metric, specify:

- Source records.
- Unit of aggregation.
- Included lifecycle states.
- Date basis.
- Correction treatment.
- Currency and weight units.
- Rounding.
- Applicable filters.
- Drill-down query.

Examples:

- Sales weight comes from eligible finalized sale lines.
- Commission comes from recorded commission snapshots.
- Payments come from posted payment records and their reversals.
- Outstanding comes from canonical obligations and settlement allocations.
- Bill count counts issued documents under an explicitly labeled status rule.

Do not label gross vegetable turnover as stall profit.

Do not count farmer-bill issuance as a second sale.

Distinguish “no activity” from “data unavailable” and “access denied.”

---

## 4. Define Date and Correction Semantics

Every report must identify whether it represents:

- Activity occurring within a date range.
- Effective sales remaining valid as of a cutoff.
- Outstanding obligations at an as-of date.

Do not silently mix these models.

For activity reports, preserve signed reversal and replacement events using their approved effective dates.

For effective-sales reports, resolve the valid source state at the selected cutoff.

Example:

- An original sale occurs in one period.
- Its reversal and replacement occur in another.
- An activity report must not silently rewrite the earlier period as though the original never occurred.

Show original, reversed, and net amounts separately where useful.

Use the established stall business timezone.

Display the selected date basis and recording cutoff in the UI and exports.

Document that later backdated records can change a newly generated historical report.

---

## 5. Reuse Consistent Reporting Snapshots

Build on Phase 28 snapshot infrastructure.

A report snapshot must cover the relevant:

- Sales.
- Ledger postings.
- Payments.
- Allocations and releases.
- Corrections.
- Document relationships.

Capture report identity, normalized filters, definition version, and data cutoff.

Use consistent data for:

- Summary totals.
- Detail rows.
- Pagination.
- Drill-downs where the snapshot remains valid.
- Exports.

Do not generate a summary from one cutoff and export rows from another.

If a snapshot expires:

- Explain that the data must be refreshed.
- Regenerate deliberately.
- Do not silently substitute newer results.

Do not hold a SQLite transaction open while waiting for user interaction or a file-save dialog.

---

## 6. Implement Sales and Commission Reports

Use finalized source transactions and approved correction semantics.

Support grouping by:

- Business date.
- Vegetable.
- Farmer.
- Buyer.
- Other approved dimensions already available.

Return exact:

- Package counts where meaningful.
- Weight.
- Gross sale amount.
- Recorded commission.
- Farmer entitlement.

Preserve:

`Gross sale amount − commission = farmer entitlement`

where that relationship applies to the implemented financial model.

Do not recompute historical commission using current bands.

Show reversals with clear signs and source references.

When grouping lines with different prices, do not display a single unit price unless it is an explicitly defined aggregate.

Commission-policy version may be an optional diagnostic grouping where authorized.

Do not introduce category reports while categories remain deferred.

---

## 7. Implement Payment Reports

Report receipts and payouts separately.

Support grouping and filtering by:

- Effective date.
- Party.
- Account role.
- Payment method.
- Posted or reversed state.
- Recording staff, where permitted.

Show:

- Original posted amounts.
- Reversal amounts.
- Net amounts.
- Payment count under a defined counting rule.
- Allocated and unapplied amounts where supported.

Do not count allocations as additional receipts or payouts.

Keep methods distinct:

- Cash.
- Bank transfer.
- Cheque.

Cheque farmer payouts count at recorded physical handover.

Do not add pending-clearance totals.

A cash movement summary is not a verified cash-drawer balance.

A manually recorded bank transfer is not independently reconciled bank activity.

---

## 8. Implement Outstanding and Party Summaries

Reuse Phase 28 obligation and balance queries.

Provide:

- Buyer receivables.
- Farmer payables.
- Opening obligations.
- Unbilled farmer entitlements.
- Bill settlement summaries.
- Supported unapplied payment amounts.

Keep these separate:

- Remaining obligations.
- Unapplied funds.
- Net account balance.

Do not net different party accounts or farmer/buyer roles merely because they belong to the same person.

Do not exclude inactive parties that still have financial history or outstanding obligations.

A farmer bill and its source entitlements must not both contribute to the outstanding total.

If aging is supported, reuse Phase 28’s approved age basis and buckets.

Do not call an item overdue without a due-date rule.

---

## 9. Implement Daily Vegetable Price Reporting

Use eligible finalized sale-line prices.

For each vegetable and business date, return:

- Minimum price per kilogram.
- Maximum price per kilogram.
- Approved average price.
- Eligible line count.
- Sold weight.
- Observation date.
- Whether values were carried forward.

The first eligible sale establishes the day’s minimum and maximum.

Later eligible sales update those values.

If no eligible sales exist, preserve the last known price display according to the approved requirement, while showing:

- No sales for the selected day.
- The original observation date.
- A carried-forward indicator.

Do not manufacture sales volume or commission for carried-forward values.

If no prior observation exists, return unavailable values rather than zero prices.

Confirm the approved average definition from existing decisions:

- Arithmetic average of prices.
- Weight-weighted average.
- Another explicitly approved formula.

Do not choose silently.

If unresolved, implement minimum, maximum, volume, and carry-forward behavior while leaving the average explicitly unavailable.

For weighted averages, document whether the numerator uses exact price × weight values or rounded monetary line totals.

Recompute extrema and averages when corrections remove or replace an eligible source.

Do not average already-averaged daily values when reporting longer periods.

---

## 10. Build Shared Filters and Contracts

Provide typed report requests and responses.

Support applicable filters such as:

- Report type.
- Date range or as-of date.
- Farmer.
- Buyer.
- Vegetable.
- Payment method.
- Document or correction status.
- Approved grouping.
- Sort order.
- Pagination.
- Snapshot token.

Maintain an explicit allowlist of supported filters for each report.

Reject unsupported combinations rather than silently ignoring them.

Parameterize all query values.

Allowlist sort columns and grouping expressions.

Validate:

- Date order.
- Range limits.
- Page size.
- Identifier scope.
- Snapshot compatibility.
- Export format.
- Requested columns.

Return a consistent envelope containing:

- Report identity and definition version.
- Scope.
- Normalized filters.
- Units and currency.
- Snapshot metadata.
- Summary.
- Rows.
- Pagination.
- Relevant limitations.

---

## 11. Implement Efficient Local Queries

Keep reporting inside the stall-service data-access layer.

Avoid duplicate sums caused by joining several one-to-many relationships.

Aggregate sales, payments, allocations, and document relationships independently before combining them.

Use stable pagination.

Add indexes only after inspecting representative query plans.

Use the next available forward migration for necessary indexes or operational export metadata.

Do not create another editable source of financial truth.

Any report projection must be rebuildable from authoritative records.

Bound:

- Query duration.
- Concurrent report jobs.
- Export row counts.
- Memory usage.
- Temporary storage.

Large report generation must not block keyboard billing for prolonged periods.

Use bounded asynchronous work or a service-managed reporting worker if required by the existing architecture. Keep SQLite access within the stall-service boundary.

Do not use a network-shared SQLite file or allow the desktop to open the database.

---

## 12. Build the Desktop Reports Workspace

Use the existing app shell and design system.

Provide:

- Report selector.
- Applicable filters.
- Apply and reset actions.
- Summary totals.
- Paginated detail table.
- Snapshot freshness indicator.
- Export actions.
- Source drill-down.

Keep report filters keyboard-accessible.

Changing filters must invalidate the previous report or clearly mark it as showing the previous selection.

Ignore stale responses when the operator changes reports, parties, or dates.

Show distinct states for:

- Loading.
- No matching activity.
- Service unavailable.
- Permission denied.
- Snapshot expired.
- Report failure.
- Export preparing.

Do not retain previous totals under newly selected filters without explanation.

Add charts only where they improve interpretation. Tables and exact totals remain authoritative.

---

## 13. Implement Complete CSV Exports

Export the complete filtered report snapshot.

Do not export only the currently visible page.

CSV output must:

- Use consistent UTF-8 encoding.
- Preserve Sinhala text.
- Quote delimiters, quotes, and line breaks correctly.
- Use unambiguous date formats.
- Include currency and unit information.
- Use exact decimal serialization.
- Preserve identifier strings without treating them as financial numbers.
- Include report scope and cutoff metadata in a documented format.

Keep the tabular format suitable for machine processing.

If metadata is supplied through a companion manifest rather than CSV preamble rows, document that convention.

Protect user-controlled text against spreadsheet formula execution, including dangerous leading characters and control-character variants.

Quoting CSV cells alone is insufficient protection.

Do not neutralize legitimate typed negative numeric amounts as though they were user-entered formulas.

Document CSV’s limitations around spreadsheet applications automatically converting leading-zero identifiers.

Do not promise Excel type preservation unless providing a typed format that actually supports it.

---

## 14. Implement PDF Exports

Reuse Phase 29’s trusted rendering foundation.

PDF reports must include:

- Stall identity.
- Report name.
- Filter summary.
- Business date basis.
- Data cutoff.
- Currency and units.
- Totals.
- Complete detail rows.
- Page numbers where supported.
- Generation timestamp.

Use appropriate page size and orientation.

Repeat table headers and avoid clipped columns.

Support Sinhala through bundled fonts.

Escape user-controlled content and block external resource loading.

Do not shrink dense reports into unreadable text. Use pagination or separate summary/detail sections.

A PDF export is not an issued bill and must not consume a bill number.

Saving a PDF must not be reported as physical printing.

---

## 15. Secure File Saving and Export Jobs

Use a narrow Electron main-process export boundary.

The renderer may request a typed report export and invoke the native save dialog.

It must not provide arbitrary HTML, URLs, shell commands, or unrestricted filesystem paths to privileged handlers.

Use server-authorized report data or an authorized export-job reference.

Validate the IPC sender, format, filename, and artifact identity.

Use safe default filenames without unnecessary personal information.

Handle:

- User cancellation.
- Existing-file overwrite through the native confirmation flow.
- Disk full.
- Permission denied.
- Connection loss.
- Application shutdown.
- Snapshot expiration.

Write to a temporary artifact and finalize the destination only after successful generation.

Clean up partial files and temporary artifacts.

Never label a truncated export as complete.

If a report exceeds supported limits, explain the limit and request a narrower range instead of silently dropping rows.

---

## 16. Add Authorization and Audit

Inspect existing reporting and export capabilities.

Separate report viewing from export permission where the approved model requires it.

Do not assume access to bill creation grants access to all financial reports.

Enforce scope and field restrictions at the service.

Revalidate authorization when retrieving a prepared export.

Bind export jobs to the appropriate tenant, stall, user/session policy, and snapshot.

Prevent export-job IDs from exposing another account’s files.

Do not include hidden sensitive columns in exported data merely because they are absent from the screen.

Record operational export metadata such as:

- Report type.
- Actor and device.
- Scope.
- Normalized filters.
- Snapshot reference.
- Format.
- Row count.
- Generation outcome.

Distinguish service generation from successful local file saving when those outcomes are reported separately.

Avoid storing full report contents or local filesystem paths in general audit logs.

Report generation may create operational audit records, but no financial entries or financial outbox events.

---

## 17. Verify Reconciliation and Export Fidelity

Implement checks that confirm:

- Summary totals equal complete detail totals.
- Group totals sum to report totals.
- Commission matches recorded source commission.
- Farmer entitlement reconciles with gross minus commission.
- Payment totals exclude allocation-only events.
- Outstanding matches Phase 28 at the same cutoff.
- PDF and CSV represent the same snapshot.
- Reprints and document issuance do not increase sales.
- Corrections follow the selected reporting date model.

Do not conceal discrepancies by rounding differences away or inserting balancing rows.

Return actionable diagnostics through existing logging conventions.

Preserve enough source references for authorized drill-down.

Do not automatically repair financial data from a report screen.

---

## 18. Add Automated Tests

### Report calculation tests

Cover:

- Multiple farmers and buyers.
- Multiple vegetables and prices.
- Partial payments.
- Opening balances.
- Cheque payouts at handover.
- Payment reversal.
- Sale reversal and replacement.
- Farmer-bill generation without duplicate sales.
- Allocation release without duplicate money movement.
- Inactive parties.
- Empty periods.
- Multiple currencies remaining separate.

### Price tests

Cover:

- First sale establishes minimum and maximum.
- Later lower and higher prices.
- Approved average formula.
- Unequal sold weights.
- Removal of an extreme through correction.
- No-sale day with prior observation.
- No-sale day without prior observation.
- Correct carry-forward after a historical correction.

### Snapshot and query tests

Cover:

- Concurrent posting during pagination.
- Concurrent allocation without a ledger entry.
- Backdated records.
- Expired snapshots.
- Invalid cursors and sort fields.
- Correct totals across all pages.
- No multiplication of amounts through joins.

### Export tests

Cover:

- All rows exported beyond the first page.
- CSV delimiters, quotes, newlines, and Sinhala.
- Formula-injection strings.
- Exact large monetary values.
- Leading-zero identifier behavior.
- Multi-page PDF rendering.
- Long text and wide columns.
- Cancellation and partial-file cleanup.
- Disk-write failure.
- Unauthorized export retrieval.
- PDF/CSV totals matching the report snapshot.

Verify that reporting and export leave financial records unchanged.

---

## 19. Prepare Operator Acceptance and Documentation

Create or update:

`docs/operations/local-reports-filters-and-exports.md`

Include a development/staging checklist:

1. Sign in with authorized reporting permissions.
2. Prepare test sales across buyers, farmers, and vegetables.
3. Record cash, bank, and simulated cheque payments.
4. Include a correction and a payment reversal.
5. Open sales summary and compare totals with source details.
6. Filter by farmer, buyer, vegetable, and date.
7. Verify commission and farmer entitlement.
8. Verify payment method totals.
9. Compare outstanding with Phase 28 at the same cutoff.
10. Verify daily prices and carried-forward labeling.
11. Page through a report and confirm stable totals.
12. Export CSV and inspect Sinhala, dates, and numeric values.
13. Confirm export includes more than the visible page.
14. Export PDF and inspect every page for clipping.
15. Verify PDF and CSV totals match the screen snapshot.
16. Post another transaction and confirm the old snapshot remains consistent.
17. Refresh deliberately and verify the new transaction appears.
18. Test denied export permission.
19. Cancel a save and confirm no completed artifact is reported.
20. Confirm report generation creates no financial changes.

If migrations are required, back up and run:

`pnpm --filter @polivo/db-local db:migrate`

Do not initialize or reset the database.

Record any unresolved average-price definition, missing source feature, or export limitation explicitly.

Update context files and the progress tracker.

Run applicable formatting, lint, type, domain, query, service, UI, export-rendering, integration, and build checks.

Report:

1. Reports implemented.
2. Metric and date definitions.
3. Filters and snapshot behavior.
4. Supported export formats.
5. Security and permissions.
6. Tests and rendered-output checks.
7. Manual checks completed or pending.
8. Performance measurements and limitations.
9. Dependencies still outstanding.
10. Readiness for Phase 31.

## Acceptance Criteria

- Reports use authoritative local sources and exact calculations.
- Sales, documents, payments, and allocations are not double-counted.
- Correction and date semantics are explicit.
- Daily prices use approved formulas and truthful carry-forward labels.
- Outstanding reports reconcile with Phase 28.
- Filters, summaries, pagination, and exports share one snapshot.
- CSV and PDF include the complete selected dataset.
- Exports protect against formula injection and unsafe filesystem access.
- Sinhala text and multi-page layouts are verified.
- Reporting remains usable without internet access.
- Financial records remain unchanged by report generation.
- Tests pass and remaining acceptance work is documented.