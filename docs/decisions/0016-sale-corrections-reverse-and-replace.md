# 0016 — Sale Corrections Reverse and Replace

- Status: Accepted
- Date: 2026-11-11

## Context and source

Phase 25 (`25-bill-history-corrections-and-reversals.md`) requires an auditable workflow for correcting or reversing finalized sales. ADR [0003](./0003-confirmed-financial-rules.md) confirmed correction invariants (no silent overwrite; linked correction with reason). ADR [0014](./0014-party-subledger-and-opening-balances.md) established reverse-and-replace for openings only. ADR [0005](./0005-commission-configuration-v1.md) requires snapshotted commission on finalize and forbids rewriting old bills when bands change. No prior ADR defined sale correction scope, replacement commission selection, numbering, farmer-document handling, or settlement interaction.

## Decision

1. **Financial method:** Reverse-and-replace only. Do not support delta adjustments for sales. A **correction** posts exact opposite ledger effects for the original sale, then creates and posts a linked replacement sale. A **cancellation/reversal** posts exact opposite effects only and does not create a replacement sale.

2. **Scope:** Whole finalized sale only. Partial-line reversal or correction is rejected. Draft edits remain on the existing draft workflow and must not reverse ledger entries.

3. **Immutability:** Original finalized sale snapshots, trader-bill snapshots, and posted ledger entries are never edited or deleted. Correction state is recorded via lineage links, correction operations, and rebuildable status projections. Financial snapshot columns remain immutable.

4. **Editable correction fields:** Price per kg, package weights, farmer, vegetable, package type, and line notes. Buyer change is allowed when the replacement buyer account is ready. Unsupported fields are rejected.

5. **Commission on replacement:** Recalculate replacement lines using the **same** snapshotted commission policy/version/band identity family stored on the original sale-line snapshots. Do not auto-select the newest active policy. Do not invent retroactive commission rules. Preview must show which policy identity is reused.

6. **Effective date:** Correction and reversal postings use the server UTC calendar date at commit as `business_date`. Original sale and bill business dates remain unchanged.

7. **Numbering:** Preserve original trader bill numbers and sale identities. Replacement sales issue a **new** trader bill number from the existing Phase 22 sequence. Reversal creates no new bill number and invents no credit-note numbering scheme. Historical numbers are never reused.

8. **Lineage:** Every correction or reversal references its source sale. Replacement sales set `corrects_sale_id` to the original. A finalized sale may be financially reversed at most once. Competing successors are rejected. Subsequent corrections target the current eligible replacement, never a superseded original.

9. **Farmer documents (Phase 25):** Correct and cancel are **blocked** when any source sale line has an original inclusion on an issued farmer bill. Issued farmer-bill snapshots and inclusion links are not modified. This restriction remains until a separate linked-document correction policy is accepted.

10. **Payment allocations:** Detect `payment_allocations` referencing the original trader bill (or related farmer bill). Block corrections and reversals with unsupported settlement consequences. Do not auto-refund, unallocate, or transfer payments. Phase 26 payment posting must serialize against the same obligation eligibility check.

11. **Permissions:** `bills.correct_finalized` for correction preview/commit; `bills.cancel_finalized` for reversal preview/commit. These are not granted by `bills.edit_draft` or `bills.finalize`. Recommended billing-staff and cashier defaults omit them; local owners receive the full catalog.

12. **Reason and audit:** Require a trimmed non-empty reason (bounded length). Every committed operation records actor, timestamp, source, reversal posting, and replacement identifiers when applicable. Audit and outbox commit in the same transaction as financial changes.

13. **Idempotency and concurrency:** Stable idempotency key, request fingerprint, expected source revision/correction version, and outcome lookup. Same key+payload returns the original result; key+different payload conflicts. Concurrent corrections cannot both become the current successor. Eligibility and preview fingerprint are revalidated inside the write transaction.

14. **Closed periods:** No closed-period controls exist in Phase 25; no additional gate.

## Reasoning

Reverse-and-replace matches opening-balance correction and preserves exact original amounts for reversals without inventing delta accounting. Reusing snapshotted commission identities satisfies ADR 0005. Blocking farmer-bill-included sales and allocated bills avoids silent grouping corruption and unsupported settlement until later policies exist. Dedicated capabilities keep finalize staff from correcting finalized finance by default.

## Consequences

- Local migration `011` adds correction operations, lineage/projection fields, and constraints.
- Stall-service exposes history, eligibility, preview, commit, and outcome routes with atomic reverse/replace posting through the Phase 21 ledger interface.
- Desktop adds bill history and correction/reversal workflows with uncertain-outcome recovery.
- Operator acceptance must verify farmer-inclusion and allocation blockers.
- Phase 26 must honor the shared obligation eligibility contract before attaching allocations to reversed obligations.

## Related implementation phases

- Phase 08 / ADR 0003 — correction invariants
- Phase 20 / ADR 0005 — commission snapshots
- Phase 21 / ADR 0014 — ledger posting and opening reverse/replace
- Phase 22–24 — sale finalize, buyer bills, farmer-bill inclusion
- Phase 25 — bill history, corrections, and reversals
- Phase 26 — payments and allocation serialization against correction eligibility
