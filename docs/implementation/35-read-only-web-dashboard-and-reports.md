# 35 — Read-Only Web Dashboard and Reports

## Objective

Implement the authenticated web dashboard for viewing a stall’s synchronized financial and operational information.

This phase must deliver:

- A responsive stall dashboard.
- Cloud-backed sales, commission, payment, and outstanding reports.
- Farmer and buyer account views.
- Read-only bill and payment details.
- Accurate synchronization freshness indicators.
- Consistent filters, pagination, and reporting snapshots.
- Authorized report exports.
- Strong tenant isolation and cache safety.
- Verification against local reports at the same cutoff.

The local stall service remains authoritative for operational transactions.

The web dashboard must not create, edit, finalize, reverse, settle, or delete financial transactions.

Existing authorized membership and configuration administration remain separate workflows.

---

## 1. Review the Existing Implementation

Read:

- `AGENTS.md` and applicable Cursor rules.
- All six canonical context files.
- Phase 07 web design system and app shell.
- Phases 11–13 Supabase isolation, Clerk authentication, and membership.
- Phases 21–28 financial semantics and statements.
- Phase 30 report definitions and exports.
- Phases 31–34 ingestion, sync status, and reconciliation.

Inspect:

1. Existing authenticated dashboard routes.
2. Tenant and stall selection.
3. Cloud membership and reporting permissions.
4. Replicated source tables and reporting projections.
5. Applied transaction-group boundaries.
6. Reporting cutoff support.
7. Cloud-observable freshness metadata.
8. Existing server/client data-fetching and caching conventions.

Confirm installed library versions before using version-sensitive APIs.

Reuse the existing web architecture.

Mark Phase 35 as `IN_PROGRESS`.

Review the Phase 31–34 live acceptance record. Independent UI work may proceed, but financial correctness must not be declared verified without a real synchronized-data comparison.

---

## 2. Define the Read-Only Boundary

Allow authorized users to:

- View dashboard summaries.
- Filter and search reports.
- Inspect bills and payments.
- View account statements and outstanding obligations.
- Download authorized exports.
- Refresh displayed cloud data.

Do not expose financial actions such as:

- Create sale.
- Edit finalized bill.
- Record payment.
- Allocate funds.
- Reverse transaction.
- Change an opening balance.
- Recalculate historical commission.
- Repair cloud projections.

Link authorized users to existing administration or sync-diagnostic pages where appropriate.

A dashboard refresh re-queries cloud data. It does not force an offline host to upload.

Do not connect the browser directly to a stall’s LAN service.

---

## 3. Map Web Reporting Permissions

Use Clerk authentication and the existing cloud membership model.

Do not treat local staff codes or desktop capability snapshots as web identities.

Create a permission matrix covering:

- Dashboard summary.
- Sales and commission.
- Farmer and buyer financial details.
- Payment details.
- Statements.
- Outstanding balances.
- Exports.
- Sync diagnostics.

Reuse existing reporting roles and capabilities where their meaning matches.

Do not assume every tenant member can view all financial fields.

Do not grant a market/platform administrator unrestricted stall finance access unless the approved role model explicitly allows it.

Apply authorization on every protected route and data operation.

Hiding a navigation item is not an authorization check.

---

## 4. Preserve Tenant and Stall Isolation

Resolve the authenticated user and current membership on the server.

Treat route parameters and selected stall IDs as untrusted input.

For every query, verify:

- Active membership.
- Authorized tenant.
- Authorized stall.
- Required reporting capability.

Use the existing Clerk–Supabase integration and RLS-aware query path where appropriate.

Do not use a privileged Supabase client as a shortcut for ordinary user reporting.

For database views and functions:

- Preserve caller scope and RLS behavior.
- Restrict execution grants.
- Validate scope explicitly where privileged execution is necessary.
- Prevent joins from exposing related records from another stall.

Direct requests for another stall’s bill, payment, export, or snapshot must fail safely.

Unauthorized access must not reveal whether a protected identifier exists.

---

## 5. Define Dashboard Metrics

Reuse the Phase 30 metric definitions.

Provide a focused overview containing applicable metrics such as:

- Gross sales for the selected period.
- Sold weight.
- Recorded commission.
- Farmer entitlement.
- Buyer receipts.
- Farmer payouts.
- Buyer outstanding.
- Farmer outstanding.

Clearly separate:

- Period activity.
- Outstanding as of a date.
- Account balance.
- Document count.

Do not label vegetable turnover as stall profit.

Do not count farmer-bill issuance as another sale.

Do not count allocations as additional payments.

Use exact recorded monetary amounts and approved units.

Where a comparison with an earlier period is shown, apply equivalent filters, date semantics, and data-quality checks. Avoid misleading percentage changes from zero or incomplete baselines.

---

## 6. Show Data Freshness Honestly

Display a visible data-status area.

Include appropriate cloud-observable information:

- Last committed ingestion time.
- Applied reporting cutoff.
- Last host contact.
- Host-reported local tail and its observation time, if available.
- Latest reconciliation result and its compared cutoff.

Distinguish:

- No data received yet.
- Data available through a stated cutoff.
- Host has reported pending uploads.
- Host contact is stale.
- Known reconciliation mismatch.
- Freshness unknown.

A recent host contact does not prove financial data is current.

A successful configuration acknowledgement does not prove sales uploads are current.

Do not display “Live” or “Fully up to date” unless the available evidence supports the exact claim.

Show “Cloud data through…” rather than presenting cloud values as guaranteed current stall balances.

---

## 7. Use Consistent Report Snapshots

Build on the existing cloud reporting and reconciliation cutoff model.

Capture a complete applied transaction-group boundary for each report snapshot.

Keep these consistent:

- Summary cards.
- Charts.
- Detail tables.
- Pagination.
- Exported results.

Return snapshot metadata with responses.

Do not filter mutable current-state projections by an old receipt cursor and assume this reconstructs historical state.

Use versioned facts, event history, or a validated materialized report snapshot.

If historical reconstruction is unavailable for a domain, report that limitation explicitly.

New sync arrivals must not silently change totals halfway through pagination.

Offer a deliberate refresh to obtain a newer snapshot.

Handle expired snapshots with a clear refresh action.

---

## 8. Implement Cloud Reporting Queries

Reuse shared report contracts and pure financial utilities.

Implement Postgres query adapters for the cloud source model.

Keep business semantics aligned with the local reports:

- Effective-date versus activity-date behavior.
- Correction and reversal treatment.
- Opening balance treatment.
- Payment allocation semantics.
- Currency separation.
- Exact money and weight representation.

Do not fetch complete raw tables into the browser to calculate totals.

Aggregate at the service/database boundary.

Prevent amount multiplication from one-to-many joins by aggregating independent sources before combining them.

Parameterize values and allowlist grouping and sort expressions.

Bound date ranges, pagination, and response sizes.

Add indexes through forward-only migrations where query plans justify them.

---

## 9. Build Sales and Commission Reports

Provide:

- Sales summary.
- Sale-line detail.
- Sales by vegetable.
- Sales by farmer.
- Sales by buyer.
- Recorded commission breakdown.
- Correction and reversal activity.

Support approved filters:

- Date range.
- Farmer.
- Buyer.
- Vegetable.
- Relevant status.
- Grouping and sort.

Show source references for authorized drill-down.

Preserve original commission snapshots.

Do not recompute historical commission using current cloud configuration.

Show original, reversed, replacement, and net activity according to the selected report definition.

Do not introduce vegetable-category filters while categories remain deferred.

---

## 10. Build Payment and Outstanding Reports

For payments, show:

- Receipts and payouts separately.
- Cash, bank transfer, and cheque separately.
- Posted amounts.
- Reversal amounts.
- Net amounts.
- Allocation details where permitted.
- Supported unapplied amounts.

Farmer cheque payouts settle at recorded handover.

Do not add clearance or rejection status.

For outstanding, reuse canonical obligation relationships.

Include:

- Buyer sale obligations.
- Farmer entitlements.
- Opening obligations.
- Eligible unbilled farmer entitlements.
- Related bill references.
- Remaining amounts.

Do not count both a farmer bill and its underlying entitlements as separate liabilities.

A net-zero party account may still have an unpaid obligation and an unapplied payment. Show those separately.

---

## 11. Add Read-Only Party and Document Views

Provide authorized farmer and buyer pages with:

- Identity and status.
- Account balance at the displayed cutoff.
- Outstanding obligations.
- Related bills.
- Payments.
- Statement navigation.

Keep farmer and buyer account roles separate.

Inactive parties with financial history must remain accessible to authorized users.

Bill details must show:

- Original issued number and type.
- Historical party/item snapshots.
- Original amounts.
- Current correction/document status.
- Linked reversal or replacement.
- Settlement information with its cutoff.

Do not replace original bill totals with replacement totals.

Do not label a reversed document “Paid” simply because its collectible amount is zero.

Payment details must preserve original metadata and reversal links.

---

## 12. Implement Web Account Statements

Reuse Phase 28 semantics.

Provide:

- Period selection.
- Opening balance.
- Period increases and decreases.
- Ordered movements.
- Running balances.
- Closing balance.
- Source-document links.

Do not count imported opening balances twice.

Do not treat allocation events as additional monetary movements.

Ensure running balances continue across pages.

Display business timezone, date basis, and recording cutoff.

Keep statement closing balance separate from the latest current cloud balance.

A statement is a read-only report and must not receive a bill number.

---

## 13. Add Vegetable Price Views

Reuse Phase 30’s approved price-report logic.

Show:

- Vegetable.
- Observation date.
- Minimum price.
- Maximum price.
- Approved average.
- Sold weight.
- Eligible observation count.
- Carried-forward indicator where applicable.

If no sales occurred, clearly identify carried-forward values and their original observation date.

Do not generate volume for carried-forward prices.

If average semantics remain unresolved, show that metric as unavailable.

Label prices as belonging to the selected stall.

Do not present one stall’s prices as a market-wide average.

Public price publication and cross-stall aggregation require their separately approved scope.

---

## 14. Implement Responsive Dashboard Navigation

Use the existing web app shell and design system.

Provide clear navigation for:

- Overview.
- Sales.
- Payments.
- Outstanding.
- Farmers.
- Buyers.
- Statements or account-level statement entry points.

Keep the selected stall visible.

When switching stalls:

- Cancel or invalidate previous requests.
- Clear prior sensitive data.
- Reset incompatible filters and snapshots.
- Prevent late responses from repopulating the wrong stall.

Support desktop, tablet, and mobile viewing.

Use accessible tables, labels, focus states, and chart alternatives.

Charts should explain trends without replacing exact totals.

Handle loading, empty, unavailable, stale, and denied states separately.

Do not display zero values while data is still loading or inaccessible.

---

## 15. Secure Caching and Refresh Behavior

Inspect the actual framework and deployment caching behavior.

Ensure private financial data cannot enter shared public caches.

Scope any permitted application cache by:

- Tenant and stall.
- Authorized visibility.
- Report/filter identity.
- Snapshot.
- Relevant authorization version.

Authenticate and authorize before serving cached protected results.

Do not cache membership decisions indefinitely.

After logout, tenant switching, or access loss:

- Clear relevant client caches.
- Prevent stale responses from displaying protected data.
- Reauthorize subsequent requests.

Exclude financial responses from public service-worker caches.

If realtime subscriptions are used, apply scope and authorization consistently. Use them to signal refreshed data availability rather than silently changing an active report snapshot.

Do not require realtime infrastructure when bounded refresh is sufficient.

---

## 16. Add Authorized Web Exports

Reuse Phase 30 report schemas and export definitions.

Support approved CSV and PDF exports from the same report snapshot.

The web implementation must use a web-compatible server rendering/export path. Do not depend on Electron being available in the browser.

Exports must:

- Include the complete filtered dataset.
- Include scope, filters, units, and cutoff.
- Preserve exact values.
- Support Sinhala.
- Protect against CSV formula injection.
- Avoid unsafe HTML or remote resource loading.
- Enforce row, time, and resource limits.

Check export permission separately where required.

For prepared export jobs, reauthorize retrieval.

Use private storage or protected streaming. Do not create public financial download URLs.

If temporary signed URLs are used, document their lifetime and bearer-access limitations.

Do not email, publish, or share exported reports automatically.

---

## 17. Preserve the Financial Write Boundary

Audit all newly added routes, actions, functions, and browser permissions.

Verify that reporting users cannot mutate replicated financial records through:

- Direct Supabase requests.
- Database functions.
- Server actions.
- Hidden endpoints.
- Modified browser requests.

Read-only reporting may create bounded operational metadata such as an export job or access audit record.

It must not change business facts.

Keep existing owner configuration administration intact, but visibly separate it from financial reporting.

Do not add a browser “fix sync” or “edit balance” shortcut.

Link to approved diagnostic workflows only when the user has permission.

---

## 18. Add Automated Tests

### Authorization tests

Cover:

- Authorized owner.
- Approved reporting-only member.
- Member without financial access.
- Revoked membership.
- Cross-tenant route manipulation.
- Direct bill/payment identifier access.
- Export permission denial.
- View/function RLS behavior.
- Direct financial write rejection.

### Financial query tests

Use shared fixtures with the local report implementation.

Cover:

- Openings.
- Sales.
- Recorded commission.
- Farmer-bill grouping.
- Cash and bank payments.
- Cheque handover.
- Partial allocations.
- Payment reversals.
- Sale corrections.
- Unapplied payments where supported.
- Inactive parties.

Verify exact local/cloud parity at the same applied cutoff.

### Snapshot and cache tests

Cover:

- New ingestion during pagination.
- Stale host-reported tail.
- No initial sync.
- Partial backlog.
- Known reconciliation mismatch.
- Membership loss before a cached response.
- Tenant switching during requests.
- Logout and late responses.
- Export snapshot consistency.

### UI and export tests

Cover:

- Responsive layouts.
- Keyboard filters and navigation.
- Accurate empty/loading states.
- Read-only document detail.
- Full multi-page statements.
- CSV injection protection.
- PDF pagination and Sinhala text.
- No financial mutations from viewing or exporting.

---

## 19. Complete Live Development Acceptance

Use synthetic data in the development stall.

1. Verify the real Phase 31–34 upload path.
2. Finalize a local sale and upload it.
3. Sign in on the web as an authorized stall member.
4. Verify the correct stall and freshness information.
5. Compare sales, commission, and farmer entitlement with local reports at the same cutoff.
6. Upload a partial buyer receipt and farmer payout.
7. Verify payments and outstanding.
8. Include a simulated cheque handover and verify immediate settlement.
9. Upload a correction and a payment reversal.
10. Verify document lineage and revised totals.
11. Compare an account statement across local and cloud.
12. Disconnect the host from internet.
13. Create another permitted local transaction.
14. Verify the web does not pretend the missing transaction is already included.
15. Restore internet and verify the new applied cutoff after refresh.
16. Test a reporting-only account.
17. Revoke that account’s membership and verify subsequent protected access is denied.
18. Attempt another stall’s document URL and verify denial.
19. Export CSV and PDF and compare totals with the selected snapshot.
20. Confirm no web action changed local or cloud financial facts.

Record unresolved live sync checks as pending.

Mocked cloud fixtures do not establish production synchronization correctness.

---

## 20. Update Documentation and Report Completion

Create or update:

`docs/operations/read-only-web-dashboard-and-reports.md`

Document:

- Available pages and reports.
- Permission matrix.
- Read-only boundaries.
- Metric definitions.
- Date and snapshot semantics.
- Freshness labels.
- Report limitations.
- Cache isolation.
- Export behavior.
- Local/cloud comparison procedure.

Use forward-only cloud migrations where required.

Apply them only to the explicitly selected development/staging project during verification.

Update context files and the progress tracker.

Run applicable formatting, lint, type, SQL/RLS, report-query, web component, end-to-end, export, and production-build checks.

Report:

1. Pages and reports implemented.
2. Cloud queries and migrations.
3. Authorization and cache protections.
4. Financial parity results.
5. Freshness and snapshot behavior.
6. Export support.
7. Automated tests and results.
8. Live checks completed or pending.
9. Known data or compatibility limitations.
10. Readiness for Phase 36.

## Acceptance Criteria

- Authorized users can view their stall’s synchronized reports.
- Financial reporting is read-only at both UI and backend boundaries.
- Tenant isolation applies to pages, queries, drill-downs, caches, and exports.
- Metrics match local definitions at equivalent cutoffs.
- Bill grouping and payment allocations are not double-counted.
- Statements and outstanding preserve historical semantics.
- Cloud freshness is displayed without claiming knowledge of unseen offline transactions.
- Report pages and exports use consistent snapshots.
- Mobile and desktop views are accessible and usable.
- Live sync verification is distinguished from mocked tests.
- Tests pass and remaining acceptance work is documented.