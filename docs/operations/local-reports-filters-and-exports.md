# Local Reports, Filters, and Exports

Phase 30 operator and development guide for authorized local reporting over the stall SQLite database.

## Capabilities

| Capability               | Use                                              |
| ------------------------ | ------------------------------------------------ |
| `reports.view_financial` | Open Reports workspace, catalog, and run reports |
| `data.export`            | Create and save CSV/PDF export jobs              |

Bill creation alone does not grant reporting or export access.

## Date and snapshot behavior

- Activity reports use sale/payment **business dates** (UTC calendar `YYYY-MM-DD`).
- Outstanding requires **as-of business date** plus a farmer or buyer id; reuses Phase 28 obligation/unapplied queries at the same watermark cutoff.
- Vegetable prices use eligible **active** finalized sale lines; average is weight-weighted from rounded line totals (`summarizePublicPrices`). Carry-forward shows the prior observation date without fabricating volume.
- Snapshots expire after 30 minutes. Expired tokens require deliberate Apply/refresh — never silent substitution.
- Summary, pages, and exports for one snapshot share one recording cutoff.

## Unavailable / out of scope

- Inventory balances
- Cash-drawer balances
- Stall profit
- Category reports
- Aging buckets
- Market-wide prices
- Account statements (remain on Phase 28 Farmers/Buyers account UI)

## Development / staging checklist

1. Sign in with authorized reporting permissions (`reports.view_financial`; add `data.export` for exports).
2. Prepare test sales across buyers, farmers, and vegetables.
3. Record cash, bank, and simulated cheque payments.
4. Include a correction and a payment reversal.
5. Open sales summary and compare totals with source details.
6. Filter by farmer, buyer, vegetable, and date.
7. Verify commission and farmer entitlement.
8. Verify payment method totals.
9. Compare outstanding with Phase 28 at the same cutoff (same party + as-of).
10. Verify daily prices and carried-forward labeling.
11. Page through a report and confirm stable totals for the snapshot.
12. Export CSV and inspect Sinhala, dates, and numeric values.
13. Confirm export includes more than the visible page.
14. Export PDF and inspect every page for clipping.
15. Verify PDF and CSV totals match the screen snapshot.
16. Post another transaction and confirm the old snapshot remains consistent.
17. Refresh deliberately and verify the new transaction appears.
18. Test denied export permission (view-only staff).
19. Cancel a save and confirm no completed artifact is reported.
20. Confirm report generation creates no financial changes (no new ledger/payment/bill rows).

## Migration

If migration `016` is pending:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Do not initialize or reset the database. Restart stall-service after migrate. Sign out/in so capability snapshots include reporting/export grants where applicable.

## CSV notes

- UTF-8 with BOM; Sinhala preserved.
- Manifest preamble lines start with `# polivo_report_manifest_v1`.
- User-controlled text is formula-injection neutralized; typed negative money cells remain numeric.
- Spreadsheet apps may still coerce leading-zero identifiers — documented limitation, not Excel type preservation.

## PDF notes

- Service stores trusted HTML for PDF jobs; Electron main converts with `printToPDF` before the native save dialog finalizes the `.pdf`.
- PDF export is not physical printing and does not consume bill numbers.
