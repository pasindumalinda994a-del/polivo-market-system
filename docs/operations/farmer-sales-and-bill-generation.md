# Farmer sales and bill generation

Operational guide for Phase 24 farmer sales queries and farmer-bill issuance.

## Purpose

- List finalized sale lines for one farmer and distinguish **Unbilled** vs **Billed** document inclusion.
- Preview and issue a farmer bill from explicit selected whole sale lines.
- Allocate farmer bill numbers from the per-stall farmer sequence starting at **`F-111111`**.
- Document existing farmer entitlements already posted at sale finalization — **do not** create another ledger payable or commission recognition.

## Capability mapping

| Operation                                      | Capability                                                  |
| ---------------------------------------------- | ----------------------------------------------------------- |
| List farmer sales / farmer bills / bill detail | Any of `bills.create`, `bills.edit_draft`, `bills.finalize` |
| Preview / issue / issuance lookup              | `bills.finalize`                                            |

Do not use `parties.register_edit` or `accounts.opening_post` for issuance.

## Rules in force

| Topic            | Rule                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Eligible sources | Finalized sale lines for the selected farmer not already on an original issued farmer bill               |
| Selection unit   | Whole sale line                                                                                          |
| Grouping         | Explicit selection; may span traders, dates, vegetables, and stored commission versions; LKR only        |
| Amounts          | Exact stored `line_sale_amount_minor`, `applied_commission_amount_minor`, `farmer_receives_minor`        |
| Recognition      | Posted at sale finalize; farmer-bill issue does not call ledger posting                                  |
| Numbering        | `F-{digits}`, stall-scoped farmer sequence from 111111; no preview allocation; retry returns same number |
| Payment          | Issuance does not mark the farmer paid                                                                   |

## API surface

| Method | Path                                      | Notes                                                        |
| ------ | ----------------------------------------- | ------------------------------------------------------------ |
| `GET`  | `/farmer-sales`                           | Requires `farmerId`; filters + summary for all matching rows |
| `POST` | `/farmer-bills/preview`                   | No writes; returns selection fingerprint                     |
| `POST` | `/farmer-bills/issue`                     | Idempotent (`Idempotency-Key`); atomic                       |
| `GET`  | `/farmer-bills/issuances/:idempotencyKey` | Recovery lookup                                              |
| `GET`  | `/farmer-bills`                           | Paginated list                                               |
| `GET`  | `/farmer-bills/:id`                       | Immutable detail                                             |

## Desktop

- Sidebar **Farmer bills** (left-rail `AppShell`, ADR 0015).
- IPC bridge `polivoFarmerBilling` with issue recovery separate from buyer finalize recovery.

## Migration

```bash
pnpm --filter @polivo/db-local db:migrate
```

Local migration `010_farmer_sales_and_bill_generation` rebuilds `farmer_bills` for multi-line bills and adds `farmer_bill_lines` with unique original inclusion of each `sale_line_id`.

## Development / staging checklist

1. Back up the local database.
2. Apply pending migrations without initialization or reset.
3. Restart the stall service.
4. Refresh the authorized staff session if permission snapshots lack `bills.*`.
5. Finalize test buyer sales using Phase 23 Billing.
6. Record farmer and buyer balances.
7. Open Farmer bills.
8. Verify source sales, weights, commission, and entitlement.
9. Select eligible lines.
10. Review independently calculated totals.
11. Issue a farmer bill.
12. Verify the number uses the farmer sequence (`F-111111` first).
13. Verify selected lines now show the issued bill reference.
14. Verify balances have not increased again.
15. Retry issuance and confirm no duplicate.
16. Change current commission settings and verify historical bill amounts remain unchanged.
17. Restart the desktop and retrieve the bill.
18. Test overlapping issuance from another terminal when available.
19. Verify unauthorized staff cannot issue bills.
20. Confirm bill generation does not mark the farmer paid.

Record unavailable physical two-terminal checks as pending.

## Correction and payment boundaries

- Phase 25 must discover the buyer sale, farmer bill inclusion, original ledger posting, and later payments without deleting original inclusion links.
- Phase 26 allocates payments against the original obligation identity; farmer-bill issuance is not payment recording.

## Pending acceptance

Operator checklist and physical two-terminal overlap checks remain pending and are not claimed passed.
