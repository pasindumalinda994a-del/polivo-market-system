# Bill History, Corrections, and Reversals

Phase 25 operations for searchable bill history and auditable sale correction/reversal.

## Policy

Accepted decision: [ADR 0016 — Sale corrections reverse and replace](../decisions/0016-sale-corrections-reverse-and-replace.md).

- Correction: reverse original ledger effects, then post a linked replacement sale and new trader bill.
- Cancellation/reversal: reverse original effects only (no replacement sale).
- Sales included on an issued farmer bill are **blocked** until a linked-document policy is approved.
- Bills with active payment allocations are **blocked**. Do not auto-unallocate; reverse or settle payments under Phase 26 rules first when policy allows.
- Capabilities: `bills.correct_finalized`, `bills.cancel_finalized` (not granted by `bills.finalize`).

## Migration

Apply pending local migrations without reset:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Migration `011_bill_history_corrections_and_reversals` adds correction operations and projection columns. Restart stall-service and desktop after migrate. Refresh the staff session so capability snapshots include correction caps where granted (owners already have the full catalog).

## Desktop workflow

1. Open **Bill history**.
2. Search by buyer/farmer type, bill number, or party.
3. Open a buyer bill detail to review original amount, timeline, and correction status.
4. Enter a reason. Optionally edit proposed line prices (paisa/kg) for a correction.
5. Preview reversal or correction (service calculates impact; no postings yet).
6. Review eligibility blockers (farmer inclusion, allocations, already corrected).
7. Commit explicitly. Enter does not commit. Uncertain outcomes recover via stored idempotency key.

## Staging checklist

1. Back up the local database.
2. Apply pending migrations without reset.
3. Restart the service and desktop.
4. Refresh the authorized staff session.
5. Finalize a test buyer sale.
6. Record buyer and farmer balances.
7. Find the bill in history.
8. Preview a supported price correction.
9. Verify the original remains unchanged before commit.
10. Review exact account effects.
11. Commit the correction.
12. Verify the original, reversal, and replacement links.
13. Verify balances reflect the replacement once.
14. Retry and confirm no duplicate effects.
15. Reverse a separate eligible test sale.
16. Confirm its original contribution is cancelled exactly.
17. Generate a farmer bill containing several test sales.
18. Confirm correcting an included sale is blocked with a clear message.
19. Verify unrelated sales remain intact.
20. Verify unsupported allocated-payment cases are blocked (when allocations exist).
21. Verify staff without correction permission are denied.
22. Restart and confirm history remains available.
23. Test competing requests from another terminal when available.

## Phase 26 integration

Payment posting calls the shared obligation eligibility helpers (`isTraderBillAllocatable` / active allocation detection, including farmer sale-line targets) so allocations cannot attach to reversed or superseded trader bills after a correction commits. See [cash-bank-payments-and-bill-allocation.md](./cash-bank-payments-and-bill-allocation.md).
