# Read-Only Web Dashboard and Reports

Phase 35 operator and development guide for the authenticated cloud reporting dashboard.

The local stall service remains authoritative for operational transactions. The web dashboard is read-only over synchronized cloud copies.

## Available pages

| Path | Purpose |
|------|---------|
| `/tenants/[tenantId]` | Stall overview metrics + freshness |
| `/tenants/[tenantId]/sales` | Sales / commission / corrections reports |
| `/tenants/[tenantId]/payments` | Payment activity |
| `/tenants/[tenantId]/outstanding` | Outstanding obligations + unapplied |
| `/tenants/[tenantId]/prices` | Stall vegetable prices (carry-forward aware) |
| `/tenants/[tenantId]/farmers` | Farmer list and account entry |
| `/tenants/[tenantId]/farmers/[farmerId]` | Farmer detail |
| `/tenants/[tenantId]/buyers` | Buyer list and account entry |
| `/tenants/[tenantId]/buyers/[buyerId]` | Buyer detail |
| `/tenants/[tenantId]/statements/[partyKind]/[partyId]` | Account statement |
| `/tenants/[tenantId]/bills/[billKind]/[billId]` | Read-only bill detail |
| `/tenants/[tenantId]/payments/[paymentId]` | Read-only payment detail |
| `/tenants/[tenantId]/sync-diagnostics` | Cloud-observable sync freshness (when permitted) |

Owner administration (Members, Permissions, Devices) remains separate from financial reporting.

## Permission matrix

| Surface | Access |
|---------|--------|
| Dashboard, sales, payments, outstanding, prices, farmers/buyers, bills, payments detail | Stall **owner** OR membership capability `reports.view_financial` |
| Account statements | Owner OR `reports.view_financial` OR `accounts.view` |
| CSV / PDF export create and retrieve | Owner OR `data.export` (re-checked on artifact download) |
| Sync diagnostics page | Owner OR `sync.view` |
| Basic freshness banner on reporting pages | Same as reporting access |
| Members / Permissions / Devices | Owner only |

Hiding a navigation item is not authorization. Every protected API and page re-resolves membership and capabilities on the server.

Do not treat local staff codes or desktop capability snapshots as web identities.

## Read-only boundary

Authorized users may:

- View dashboard summaries and reports
- Filter, search, and paginate
- Inspect bills, payments, parties, and statements
- Download authorized exports
- Refresh displayed cloud data (re-query only; does not force a host upload)

Web reporting must not:

- Create, edit, finalize, reverse, settle, or delete financial transactions
- Change opening balances or recalculate historical commission
- Repair cloud projections
- Connect the browser to a stall LAN service
- Mutate replicated financial rows via Supabase, RPCs, or server actions

Export jobs and access audit metadata are allowed operational side effects.

## Metric definitions

Reuse Phase 30 / ADR 0020 definitions (`REPORT_DEFINITIONS` in `@polivo/domain`):

- Gross sales, sold weight, recorded commission, farmer entitlement, buyer receipts, farmer payouts, outstanding amounts
- Separate **period activity**, **outstanding as of a date**, **account balance**, and **document counts**
- Do not label vegetable turnover as stall profit
- Do not count farmer-bill issuance as another sale
- Do not count allocations as additional payments
- Commission uses original recorded snapshots (not current cloud configuration)

## Date and snapshot semantics

- Activity reports: business-effective date ranges; signed reversals/replacements retained on effective dates
- Outstanding: as-of business date + recording cutoff watermarks
- Prices: eligible active finalized sources at cutoff; carry-forward shows original observation date without fabricated volume
- Snapshots bind stall, report type, definition version, filters, Phase 28-style watermarks (`maxPostingSequence`, allocation/payment tails), and applied sync cursor metadata
- Snapshot TTL: **30 minutes**. Expired tokens require deliberate refresh — never silent substitution
- Summary cards, tables, pagination, and exports for one token share one cutoff
- New sync arrivals do not change totals mid-pagination for an existing snapshot

## Freshness labels

Cloud-observable signals come from `get_stall_reporting_freshness` (reporting members) and related sync receipts.

| Label | Meaning |
|-------|---------|
| No synchronized data yet | No applied upload / ledger evidence |
| Cloud data through… | Totals reflect the last applied cutoff (not guaranteed current stall balances) |
| Host contact stale | Host was observed recently enough for contact metadata, but that does **not** prove financial currency |
| Freshness unknown | Applied timing could not be determined |

Never display “Live” or “Fully up to date” without evidence that supports the exact claim. A successful configuration acknowledgement does not prove sales uploads are current. Reconciliation mismatch is shown only when cloud-observable; otherwise treat as unknown.

## Report limitations

Unavailable / out of scope (same as Phase 30):

- Inventory, cash-drawer, profit, categories, aging, market-wide prices

Cloud-specific limitations:

- Opening-balance **draft** obligations are limited until opening drafts are fully replicated; trader bills, farmer sale-line entitlements, unapplied payments, and ledger balances at cutoff are included
- Historical outstanding reconstruction (Phase 28 historical route) is not fully mirrored on web
- Live local/cloud financial parity is not claimed until enrolled-host Phase 31–34 smoke and the comparison checklist below succeed

## Cache isolation

- Reporting pages and APIs use `force-dynamic` and `Cache-Control: private, no-store`
- Application caches (if any) must be scoped by tenant/stall, visibility, report/filter identity, snapshot, and authorization version
- Authenticate and authorize before serving cached protected results
- After logout, tenant switch, or access loss: clear client state keyed by tenant; ignore late responses for the wrong stall
- Do not put financial responses in public service-worker caches
- Ordinary reporting uses the Clerk user-context Supabase client — never the privileged secret client

## Export behavior

- Formats: CSV and PDF from the **same** report snapshot
- CSV: UTF-8 BOM, Phase 30 manifest preamble, formula-injection neutralization, Sinhala preserved
- PDF: trusted HTML from `renderReportPdfHtml`, converted with Playwright Chromium on the Node server (`runtime = "nodejs"`). Deploy hosts need Chromium installed (`npx playwright install chromium`)
- Artifacts stored in private `report_export_jobs` rows; download requires re-authorized GET for the creating subject
- No public download URLs; do not email or auto-share exports
- Row/time limits follow Phase 30 (`REPORT_EXPORT_MAX_ROWS`, 30-minute job TTL)

## Cloud migrations

Forward-only migrations (apply only to the selected development/staging project during verification):

- `20261119120000_web_reporting_schema_and_access.sql` — posting/correction columns, sale-line denormalization, capability-aware financial SELECT, export jobs, freshness + watermark RPCs
- `20261119120100_web_reporting_query_rpcs.sql` — report/statement query RPCs
- `20261119120200_web_reporting_apply_posting_fields.sql` — apply persistence + backfill for posting/correction fields
- `20261119130000_backfill_sale_line_report_snapshots.sql` — backfill legacy vegetable/farmer line snapshots; `list_report_sale_lines` catalog COALESCE (fixes empty `vegetable_code` 500)

Keep the Supabase CLI linked to the same project as `.env.local` (polivo-dev) before `db push`.

## Local / cloud comparison procedure

Use synthetic data in the development stall. Mocked fixtures alone do not establish production sync correctness.

1. Confirm Phase 31–34 upload path on an enrolled host
2. Finalize a local sale and upload it
3. Sign in on the web as an authorized stall member
4. Verify stall identity and freshness (“Cloud data through…”)
5. Compare sales, commission, and farmer entitlement with local reports at the same cutoff
6. Upload a partial buyer receipt and farmer payout; verify payments and outstanding
7. Include a simulated cheque handover; verify immediate settlement on web
8. Upload a correction and a payment reversal; verify lineage and revised totals
9. Compare an account statement across local and cloud
10. Disconnect the host; create another local transaction; confirm web does not include it until upload
11. Restore internet; refresh; verify new applied cutoff
12. Test a reporting-only membership; revoke it; confirm subsequent access denied
13. Attempt another stall’s document URL; confirm safe denial
14. Export CSV and PDF; compare totals with the selected snapshot
15. Confirm no web action changed local or cloud financial facts

Record unresolved live sync checks as pending in `docs/context/progress-tracker.md`.
