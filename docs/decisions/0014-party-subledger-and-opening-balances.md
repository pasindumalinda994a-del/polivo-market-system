# 0014 — Party Subledger and Opening Balances

- Status: Accepted
- Date: 2026-11-09

## Context and source

Phase 21 (`21-financial-ledgers-and-opening-balances.md`) requires an accounting-rule map before ledger persistence. ADR [0003](./0003-confirmed-financial-rules.md) confirmed money precision, separate farmer/buyer balances, overpayment credit, farmer advances, and correction invariants, but did not choose a ledger shape or opening-balance workflow. Project overview forbids a full general ledger / chart of accounts.

## Decision

1. **Accounting model:** Party-role **subledger** only. One financial account per `(stall_id, party_kind, party_id)` where `party_kind` is `farmer` or `trader` (buyer). Farmer and buyer balances are never auto-netted. Do not introduce a chart of accounts, opening-equity, or suspense account.

2. **Natural sign convention (stored `amount_minor`):**
   - Farmer account: positive = stall owes farmer (payable); negative = farmer owes stall (advance-like).
   - Buyer/trader account: positive = buyer owes stall (receivable); negative = stall owes buyer (credit).
   - Display labels must be explicit: “Stall owes farmer”, “Farmer owes stall”, “Buyer owes stall”, “Stall owes buyer”. Never “positive balance.”

3. **Currency:** LKR as integer paisa only. Different currencies must never be summed into one balance.

4. **Authoritative balances:** Derive from immutable posted `ledger_entries` only. Drafts have no financial effect. Do not store an independently editable `currentBalance` on party rows. Any projection must be reconstructible from entries.

5. **Opening balances:** Represent pre-system outstanding amounts at an approved `YYYY-MM-DD` business cutoff. They are not sales, payments, or commission income. Zero openings complete via account metadata without a zero-value movement. At most one completed opening per account. Eligibility fails if any non-opening posted ledger source exists for the account, or if finalized bills / payments already reference the party (cutover safety).

6. **Corrections:** Posted openings are never edited or deleted. Restricted reverse + optional replace requires `accounts.opening_correct`, a reason, and references the original posting. Deny correction when later operational postings exist. A posting may be reversed at most once. Replacement corrects the original opening event (same business source identity family), not a second unrelated opening.

7. **Permissions:**
   - `accounts.view` — balances and movements
   - `accounts.opening_prepare` — create/edit opening drafts
   - `accounts.opening_post` — post openings
   - `accounts.opening_correct` — reverse/replace openings
   - Recommended billing-staff defaults include view + prepare only. Cashier defaults include view. Post and correct are not in billing-staff or cashier recommended profiles (owner receives the full catalog locally).

8. **Future source effects (documentation contract for later phases; not posted in Phase 21):**
   - Sale finalize → buyer balance + (receivable) and farmer balance + (payable) for net amounts.
   - Trader payment receive → buyer balance −
   - Farmer payment pay → farmer balance −
   - Opening / reversal → as directed by natural sign and direction selection
   - Bill create/reprint must not become a second posting source for a sale already posted under the chosen financial event model.

9. **Payment allocation against openings:** Deferred. Later phases may settle openings via a dedicated opening-item reference rather than fabricated historical bills.

## Reasoning

A party-role subledger matches approved separate farmer payable / buyer receivable language without inventing a GL. Natural signs align UI labels with stall economics (payables and receivables). Explicit opening eligibility and correction gates preserve immutability and prevent cutover races with later operational posting. Dedicated capabilities avoid overloading party/catalog/commission permissions for financial posting.

## Consequences

- Local migration `008` introduces `party_accounts`, `ledger_postings`, `ledger_entries`, and `opening_balance_drafts`.
- Stall-service exposes an internal in-transaction posting interface and authorized opening routes only — no unrestricted client ledger-line API.
- Existing local staff capability snapshots lack the new capabilities until trusted permission refresh or owner re-sign-in.
- Sales, payments, and cloud ledger sync remain later phases; they must call the same posting interface inside their own transactions.

## Related implementation phases

- Phase 08 / ADR 0003 — confirmed financial calculation rules
- Phase 21 — financial ledgers and opening balances
- Later billing / payment phases — operational posting and opening settlement
