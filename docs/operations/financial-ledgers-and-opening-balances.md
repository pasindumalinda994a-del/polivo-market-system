# Financial Ledgers and Opening Balances

Phase 21 foundation for party-role subledgers and controlled opening balances. Implementation guide: [`docs/implementation/21-financial-ledgers-and-opening-balances.md`](../implementation/21-financial-ledgers-and-opening-balances.md). Decision: [`docs/decisions/0014-party-subledger-and-opening-balances.md`](../decisions/0014-party-subledger-and-opening-balances.md).

## Approved rules

- Party-role subledger only (farmer vs trader/buyer). No chart of accounts / GL.
- Natural signs: farmer positive = stall owes farmer; buyer positive = buyer owes stall. Opposite directions supported.
- Balances derive only from immutable posted `ledger_entries`. Drafts have no effect.
- Opening = pre-system outstanding at a `YYYY-MM-DD` cutoff. One completed opening per account.
- Corrections = reverse + optional replace; denied after operational ledger activity.
- Currency: LKR integer paisa only.

## Authority

Only the stall service writes ledger and opening data through SQLite transactions. Desktop terminals call authenticated HTTPS APIs. The Electron renderer never opens SQLite or receives privileged credentials.

## Permissions

| Capability | Purpose |
|---|---|
| `accounts.view` | Balance and movements |
| `accounts.opening_prepare` | Create/edit opening drafts |
| `accounts.opening_post` | Post openings |
| `accounts.opening_correct` | Reverse/replace openings |

Recommended billing-staff defaults include view + prepare only. Cashier defaults include view. Post/correct are not in billing-staff or cashier recommended profiles (local owners receive the full catalog).

Existing staff capability snapshots need a trusted permission refresh or owner re-sign-in before new capabilities appear.

## API surface

| Method | Path | Capability |
|---|---|---|
| GET | `/accounts/:partyKind/:partyId/balance` | `accounts.view` |
| GET | `/accounts/:partyKind/:partyId/movements` | `accounts.view` |
| GET | `/ledger/postings/:postingId` | `accounts.view` |
| GET | `/accounts/:partyKind/:partyId/opening-draft` | `accounts.opening_prepare` |
| GET | `/openings/drafts/:draftId` | `accounts.opening_prepare` |
| POST | `/openings/drafts` | `accounts.opening_prepare` |
| PATCH | `/openings/drafts/:draftId` | `accounts.opening_prepare` |
| POST | `/openings/drafts/:draftId/post` | `accounts.opening_post` |
| POST | `/openings/correct` | `accounts.opening_correct` |

Mutations require `Idempotency-Key`. There is no unrestricted client ledger-line endpoint. Later sales/payment services must call the internal `postLedgerEntries` repository helper inside their own transaction with audit and outbox.

## Balance-query semantics

- Current balance = sum of all posted entry amounts for the account.
- Historical `asOfBusinessDate` = sum of entries whose posting `business_date` is on or before that date (business-effective, not recording-time as-of).
- Movement pages include `precedingBalanceMinor` so running balances do not restart at zero.
- Ordering key: monotonic `posting_sequence` per stall.

## Opening eligibility and duplicates

Opening post fails when:

- Opening already completed for the account
- Any non-`opening_balance` ledger posting exists for the account
- Finalized bills or payments already reference the party
- Business-event uniqueness would be violated
- Draft revision is stale

Zero openings complete via account metadata without a zero-value movement.

## Future sales and payment integration

Documented source effects (not implemented in Phase 21):

- Sale finalize → buyer + / farmer +
- Trader payment → buyer −
- Farmer payment → farmer −
- Opening/reversal/replace as directed

Bill create/reprint must not become a second posting source for a sale already posted. Payment allocation against openings is deferred; later phases may use a dedicated opening-item reference.

## Migration

Forward-only local migration `008_financial_ledgers_and_opening_balances`.

For an existing database:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Then restart the stall service. Do **not** run database initialization or reset commands.

## Desktop UX

Farmers and Buyers panels show account summary for the selected party, paginated movements, and an opening editor when prepare/post capabilities allow. Logout / staff switch clears account and draft UI state.

## Operator acceptance checklist

1. Back up the existing local database.
2. Apply pending migrations without resetting the database.
3. Restart the stall service.
4. Refresh the authorized local session if capabilities changed.
5. Open a test farmer account with no entries.
6. Verify zero balance and opening status.
7. Prepare an approved test opening amount.
8. Confirm the draft does not change the balance.
9. Post it and verify the balance and movement.
10. Retry the operation and confirm no duplicate effect.
11. Verify a second opening attempt is rejected.
12. Repeat for a test buyer account.
13. Test opposite-direction balances if needed.
14. Verify unauthorized staff cannot post openings.
15. Check audit and outbox records.
16. Test an approved opening correction.
17. Confirm the original entry remains visible.
18. Verify balances persist after service restart.
19. Check a second terminal sees the same committed result when available.
