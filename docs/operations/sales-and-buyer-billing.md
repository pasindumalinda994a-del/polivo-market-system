# Sales and Buyer Billing (Phase 22)

Authoritative local stall-service path for draft vegetable sales and finalized buyer/trader bills. The keyboard-first billing UI is Phase 23.

## Sale and bill relationships

- One **sale** (`sales` row) is the foundation for one **buyer/trader bill** (`trader_bills`).
- A sale contains many **lines** (vegetables). Each line has one **farmer**, a package type, individual bag weights, and a unit price.
- Farmer attribution is stored on the line and in `sale_farmer_allocations` (full line net weight).
- Farmer bills (Phase 24) reference the same sale effects; they must not create a second ledger posting for the same sale.

## Financial formulas

Integer paisa and hundredths-kg only (ADR 0003).

Per line:

1. Gross weight = sum of individual bag weights (never bag-count × sum).
2. Net weight = gross − packaging (packaging defaults to 0).
3. Sale amount = half-up(`unitPricePerKg × netWeight`).
4. Commission = half-up(`ratePerKg × netWeight`) from the **active** Phase 20 policy band for the selling price.
5. Buyer pays the full sale amount.
6. Farmer receives `sale − commission` (before Phase 26 money deductions).

Bill totals = sum of rounded line amounts.

## Finalization lifecycle

| Status                        | Bill number       | Ledger      |
| ----------------------------- | ----------------- | ----------- |
| `draft`                       | none              | none        |
| `finalized`                   | `T-{n}` allocated | posted once |
| `cancelled` (abandoned draft) | none              | none        |

Finalized amounts, snapshots, and bill numbers are immutable. Corrections belong to Phase 25.

## Source-to-ledger posting map

Posted inside the same SQLite transaction as finalize via `postLedgerEntries`:

| Effect             | Party       | Sign | Amount                             |
| ------------------ | ----------- | ---- | ---------------------------------- |
| Buyer obligation   | trader      | +    | total trader pays                  |
| Farmer entitlement | each farmer | +    | sum of that farmer’s line receipts |

- `source_type = sale`
- `source_id = sale.id`
- `financial_event_type = sale_finalized`
- `event_sequence = 1`

Commission is the residual between buyer and farmer amounts (no separate party posting). Buyer-bill create/get/reprint must not post again.

## Buyer-bill numbering

- Explicit `bill_type = trader` on `trader_bills`.
- Sequence table `bill_sequences` per stall; trader starts at **444444**, farmer at **111111** (farmer unused until Phase 24).
- Allocation uses `allocateNextBillSequence` (not `MAX+1`).
- Display form `T-{digits}` via `formatBillNumber`.
- Drafts do not consume numbers. Issued numbers are never reused. Rollback gaps are allowed.

## Draft concurrency

- Optimistic `revision` on sale drafts.
- Updates replace the complete draft (header + lines).
- Stale revision → `CONFLICT`; client must reload.

## Preview freshness

- `POST /sales/drafts/:id/preview` recalculates with the current active commission policy.
- Returns `calculationFingerprint` (SHA-256 of revision + policy version + line calc material).
- Finalize requires `expectedRevision` + `expectedCalculationFingerprint`.
- Policy/input change after preview → stale-calculation `CONFLICT`; re-preview required.
- Preview never writes ledger, bills, or outbox financial effects.

## Idempotency and uncertain-outcome recovery

- Finalize requires `Idempotency-Key`.
- Same key + same payload → original result.
- Same key + different payload → conflict.
- Two keys cannot finalize the same draft twice (sale status + ledger uniqueness + unique trader bill per sale).
- After timeout: `GET /sales/finalizations/:idempotencyKey` (scoped to principal).

## Required permissions

| Operation                   | Capability         |
| --------------------------- | ------------------ |
| Create draft                | `bills.create`     |
| Update / abandon / preview  | `bills.edit_draft` |
| Finalize / operation lookup | `bills.finalize`   |
| List/get drafts and bills   | any of the above   |

Cashiers without `bills.*` are denied. Do not reuse `commission.manage` or `accounts.opening_post` for billing.

## Opening readiness

Finalize requires the buyer and every line farmer to have `opening_status` in `opened` or `opened_zero`.

## Routes

- `POST /sales/drafts`
- `GET /sales/drafts`, `GET /sales/drafts/:id`
- `PUT /sales/drafts/:id`
- `POST /sales/drafts/:id/abandon`
- `POST /sales/drafts/:id/preview`
- `POST /sales/drafts/:id/finalize`
- `GET /sales/finalizations/:idempotencyKey`
- `GET /trader-bills`, `GET /trader-bills/:id`

Desktop IPC bridge: `polivoSalesBilling` (Phase 23 UI consumer).

## Phase 23 / 24 integration

- Phase 23 UI ops: [`keyboard-first-pos-billing.md`](keyboard-first-pos-billing.md) (AppShell chrome per ADR 0015).
- Phase 23: use contracts + IPC for draft/preview/finalize/lookup; do not recalculate money in the renderer.
- Phase 24: farmer bills reference existing sale ledger effects; allocate farmer sequence starting at `111111`.

## Deferred

- Payment collection and allocation (Phase 26)
- Corrections / reversals (Phase 25)
- Printing / reprinting
- Cloud sync ingestion
- Inventory stock deductions
- Business-date backdating policy (open question; calendar `YYYY-MM-DD` accepted)

## Operator verification checklist

1. Back up the local database.
2. `pnpm --filter @polivo/db-local db:migrate` (do not init/reset).
3. Restart the stall service.
4. Refresh staff session if capability snapshots predate `bills.*`.
5. Confirm Phase 21 openings for test farmer and buyer.
6. Confirm farmer, buyer, vegetable, package, and active commission policy.
7. Create and edit a draft; confirm balances unchanged.
8. Preview and independently check amounts.
9. Finalize; verify `T-444444` (or next) and ledger movements.
10. Retry same idempotency key; confirm same bill.
11. Second key → no duplicate bill/posting.
12. Stale revision and stale fingerprint conflicts.
13. Unauthorized staff cannot finalize.
14. Restart service; retrieve issued bill.
15. Local operation without internet while host remains reachable.

Record pending manual checks in the progress tracker.
