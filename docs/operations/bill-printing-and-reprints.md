# Bill printing and reprints

Phase 29 operations guide for desktop printing of buyer bills, farmer bills, payment receipts, and account statements.

## Boundaries

- Stall service authorizes document access, creates durable print jobs/attempts, and records audit/outbox events.
- Electron main enumerates Windows-session printers, renders trusted templates, and submits once to the OS print system.
- The renderer only uses typed `polivoPrint` IPC. It must not send arbitrary HTML, URLs, paths, or shell commands.
- Printing never creates sales, issues bill numbers, posts payments, allocates funds, or changes balances.

## Capabilities

| Capability | Meaning |
| --- | --- |
| `documents.print` | Initial print / preview / test page |
| `documents.reprint` | Additional copies with a required reason |

Document view still requires the existing bill/payment/accounts view gates. Cashier defaults include `documents.print` only. Billing-staff defaults include both print and reprint.

After adding capabilities, sign out/in (or run trusted permission refresh) so staff snapshots include the new grants.

## Migration

Apply local migration `015_bill_printing_and_reprints`:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Then restart stall-service. Do not initialize or reset an operational database.

Migration `015` adds:

- `stall_print_identity`
- `print_jobs` / `print_attempts`
- nullable `stall_display_name` / `stall_address` on trader and farmer bills for newly issued documents

## Terminal printer setup

1. Open **Settings → Printing**.
2. Select the exact system printer for **this** Windows terminal.
3. Choose a labeled test profile:
   - `thermal-80mm-test` (uncalibrated)
   - `a4-paged-test` (uncalibrated)
4. Save stall print display name/address used for headers and new-bill snapshots.
5. Print the nonfinancial Polivo test page.
6. Verify margins, Sinhala text, and alignment before printing real bills.

Printer configuration is stored under the desktop `userData/printing/` directory for that device only. A printer available on one terminal is not assumed to exist on another. If the configured printer disappears, Polivo requires deliberate reselection and does not silently fall back to another default.

## Paper profiles and templates

| Profile | Intent | Calibration |
| --- | --- | --- |
| `thermal-80mm-test` | ~80 mm roll layout | Pending physical acceptance |
| `a4-paged-test` | A4 paged layout | Pending physical acceptance |

Template version for all document kinds: `1` (`buyer_bill`, `farmer_bill`, `payment_receipt`, `account_statement`, `test_page`).

Historical pixel-identical reproduction after app upgrades is **not** claimed unless retained artifacts are present. Each attempt stores template version + payload hash.

Fonts: Inter + Noto Sans Sinhala (offline local/system fallbacks). Wait for fonts before print submission.

## Print-status meanings

| Outcome | Meaning |
| --- | --- |
| `prepared` | Durable attempt created; not submitted |
| `submitting` | Submission started |
| `accepted_by_print_system` | Windows/Electron accepted the job into the spooler — **not** proof of paper delivery |
| `failed_before_submission` | Known failure before spooler acceptance |
| `cancelled_before_submission` | Cancelled (for example preview closed) |
| `outcome_unknown` | Crash/timeout/ambiguous result |

Unknown outcomes never auto-resubmit. Operators must check the printer/Windows queue and choose an explicit retry/reprint.

## Initial print and reprint policy

- Explicit Print only after finalize/issue (no automatic print-on-commit).
- One copy per normal submission.
- Reprint requires `documents.reprint`, a reason, and shows a clear **REPRINT** label.
- Reprints preserve original bill number, issue date, amounts, and party/item snapshots.
- Prior accepted or unknown attempts force reprint classification for additional copies.
- Confirmed pre-submission failures may retry as initial under service policy.

## Recovery

1. If the app crashes after submission before reporting, recover marks the attempt `outcome_unknown`.
2. Pending outcome reports are stored under `userData/printing/pending-outcome.json` and flushed without reprinting when the service is reachable again.
3. Do not create a new bill or re-finalize to retry printing — use the committed document id.

## Windows queue troubleshooting

- Confirm the selected printer in Windows Settings.
- Check the print queue for paused/offline printers.
- Reprint only after verifying whether a physical copy already emerged.
- Network printers must be installed in the local Windows session; USB printers on another PC are not used directly.

## Temporary artifacts

Preferred rendering uses in-memory/`data:` HTML. No durable personal document copies are retained by default. Audit metadata (attempt ids, outcomes, template version, payload hash) is retained in SQLite without logging full document contents.

## Physical acceptance checklist

Follow the 20-step checklist in `docs/implementation/29-bill-printing-and-reprint-management.md` §19. Record printer model, driver, Windows version, connection type, paper profile, successful document types, and limitations.

**Physical printer acceptance is pending** until that checklist is completed on target hardware. Automated mocks do not count as physical verification.

## Related

- Implementation guide: `docs/implementation/29-bill-printing-and-reprint-management.md`
- Desktop settings UI for printer + stall identity
- Print actions on finalized buyer bills, farmer bill detail, bill history, payment detail, and account statements
