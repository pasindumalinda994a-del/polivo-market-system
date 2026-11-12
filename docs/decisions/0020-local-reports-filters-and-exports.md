# 0020 — Local Reports, Filters, and Exports

- Status: Accepted
- Date: 2026-11-12

## Context and source

Phase 30 (`30-local-reports-filters-and-exports.md`) requires authorized local reporting and CSV/PDF exports over the authoritative stall database. Phase 28 ([0019](./0019-account-statements-and-outstanding.md)) defined reporting snapshots and outstanding reconstruction but deferred exports. Phase 08 / [0003](./0003-confirmed-financial-rules.md) already defined public vegetable price math in domain. Capability catalog already includes `reports.view_financial` and `data.export`.

## Decision

1. **Reports are read-only.** Generating, paging, or exporting a report must not create financial transactions, change allocations, alter bill status, or emit financial outbox events. Operational audit and export-job metadata are allowed.

2. **Report catalog (v1).** Supported reports: `sales_summary`, `sales_detail`, `vegetable_sales`, `farmer_activity`, `buyer_activity`, `commission`, `payments`, `outstanding`, `vegetable_prices`, `corrections_reversals`. Account statements remain on Phase 28 APIs. Inventory balances, cash-drawer balances, profit, category reports, aging, and market-wide prices are unavailable / out of scope.

3. **Date models are explicit.** Activity reports use business-effective date ranges and preserve signed reversal/replacement events on their effective dates. Outstanding uses as-of business date plus recording cutoff. Effective-sales / price reports resolve eligible finalized sources at the selected cutoff. UI and exports always display date basis and recording cutoff. Later backdated records can change a newly generated historical report.

4. **Snapshots reuse Phase 28 watermarks.** Capture `maxPostingSequence`, allocation, and payment watermarks in a short SQLite read. Bind opaque report snapshot tokens to stall, report type, definition version, normalized filters, and watermarks. Summary, detail pages, drill-downs, and exports for one token share one cutoff. Expired tokens require deliberate refresh — never silent substitution. Do not hold a SQLite transaction open across save dialogs.

5. **Vegetable average price.** Use Phase 08 weight-weighted average: total rounded line `saleAmountMinor` ÷ total net kg, half-up (`summarizePublicPrices`). Numerator is rounded monetary line totals, not exact price×weight before rounding. Carry-forward shows last known min/max/average with original observation date and carried-forward indicator; no fabricated volume or commission. No prior observation → unavailable values, not zeros. Do not average daily averages across longer periods.

6. **Permissions.** Viewing reports requires `reports.view_financial`. Preparing or retrieving export artifacts requires `data.export` (revalidated on retrieval). Do not grant all financial reports from bill-creation alone.

7. **Exports.** CSV and PDF export the complete filtered snapshot (not the visible page). CSV is UTF-8 with formula-injection neutralization for user-controlled text (leading `=`, `+`, `-`, `@`, tab, CR) while preserving legitimate typed negative money cells. PDF reuses Phase 29 trusted HTML escaping and Electron main-process rendering (`printToPDF`); PDF save is not physical printing and does not consume bill numbers. Renderer never supplies arbitrary HTML, URLs, shell commands, or unrestricted paths.

8. **Outstanding reuse.** Outstanding reports call Phase 28 obligation/unapplied loaders at the same cutoff; do not rebuild those calculations independently.

9. **Business timezone.** Local stall financial dates continue as UTC calendar `YYYY-MM-DD` (existing convention).

## Reasoning

Reusing Phase 28 watermarks and outstanding queries prevents divergent financial totals. Separating view and export capabilities matches the existing permission catalog. Documenting the Phase 08 average numerator closes the Phase 30 confirmation gate without inventing a second formula. Explicit unavailable report types prevent fabricated inventory/cash-drawer/profit figures.

## Consequences

- Local migration `016` stores operational export-job metadata and report-oriented indexes as needed.
- Contracts/domain add report definitions, envelopes, snapshot tokens, CSV/PDF helpers.
- Stall-service exposes `/reports` read and export-job routes.
- Desktop adds Reports workspace + `polivoReports` IPC with native save dialog.
- Ops guide documents operator checklist and limitations.

## Related implementation phases

- Phase 08 / ADR 0003 — public price math
- Phase 28 / ADR 0019 — snapshots and outstanding
- Phase 29 — trusted document rendering
- Phase 30 — local reports, filters, and exports
