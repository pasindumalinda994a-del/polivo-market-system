# Commission configuration

Phase 20 operations guide for stall default commission bands. Source rules: ADRs [0003](../decisions/0003-confirmed-financial-rules.md) and [0005](../decisions/0005-commission-configuration-v1.md). Implementation guide: [`20-configurable-commission-engine.md`](../implementation/20-configurable-commission-engine.md).

## Approved rules (v1)

- Stall default bands only. No vegetable, category, or per-sale overrides.
- Band selection uses selling price per kilogram (integer paisa).
- Rate basis is currency per net kilogram (integer paisa per kg).
- Chargeable weight is net weight (integer hundredths of a kilogram).
- Boundaries: inclusive lower; inclusive upper when set; final band open-ended (`max = null`).
- Aggregation: per sale line (bag).
- Rounding: half-up via `roundMoneyTimesWeight` at the per-line stage (`half_up_money_times_weight_v1`).
- Missing or invalid active policy must return an explicit error. Never treat failure as zero commission.
- Do not seed example rates as live business settings.

Reference defaults (ADR / test fixtures only):

| Selling price / kg         | Rate / kg |
| -------------------------- | --------- |
| Rs 0.00–199.99 inclusive   | Rs 5.00   |
| Rs 200.00–400.00 inclusive | Rs 15.00  |
| Rs 400.01 and above        | Rs 50.00  |

## Authority

- The stall service is the only writer for local commission configuration.
- Desktop terminals call the stall-service API; they never open SQLite.
- Cloud sync of outbox events is a later phase. Local activation still writes audit + outbox in the same transaction.

## Permissions

- Capability: `commission.manage` (view active policy, history, preview, activate).
- Included in billing-staff recommended defaults; cashiers do not receive it by default.
- Local owners receive the full capability catalog.
- Existing staff snapshots need a trusted permission refresh (and re-sign-in) before the new capability appears.
- Do not reuse `catalog.manage`, `parties.register_edit`, or `bills.change_commission` for policy administration.

## Versioning and activation

- One active version per stall (`commission_policies.active_band_set_id`).
- Activation creates a new immutable `commission_band_sets` row plus bands, then updates the active pointer and bumps `revision`.
- Request body must include `expectedRevision`. Stale revisions return HTTP 409.
- Mutations require an `Idempotency-Key`. Replays with the same key and payload return the original result; mismatched payloads conflict.
- Published versions are read-only. Editing means submitting a replacement version.
- New versions apply to **new** sales only.

## API surface

| Method | Path                              | Notes                                      |
| ------ | --------------------------------- | ------------------------------------------ |
| GET    | `/commission-policy`              | Active policy or unconfigured              |
| GET    | `/commission-policy/versions`     | Paginated history                          |
| GET    | `/commission-policy/versions/:id` | Immutable version detail                   |
| POST   | `/commission-policy/activate`     | Validate + activate replacement            |
| POST   | `/commission-policy/preview`      | Transient calculation; no financial writes |

## Preview limitations

- Preview is not a sale, bill, payment, or ledger entry.
- Preview does not write audit or outbox events.
- Distinguish previews of the active version from older versions.
- If the active policy changes while a preview is open, recalculate.

## Historical calculation (later billing phases)

At financial finalization the stall service must:

1. Resolve the applicable active policy using the activation rule in force at commit time.
2. Validate authoritative sale inputs.
3. Recalculate commission with the shared domain engine.
4. Persist policy/version references and the calculation snapshot on the sale line (`applied_commission_rate_per_kg_minor`, `applied_commission_amount_minor`).
5. Commit sale, snapshot, audit, and outbox atomically.

Do not allow a sale to store one policy version while commission was calculated with another. Finalized records keep their original snapshot; later policy changes must not recalculate them. Corrections follow the approved adjustment workflow.

## Conflict and missing-policy behavior

- Concurrent activation with a stale revision → conflict; reload and retry.
- No active policy → configuration / preview errors; sales finalization (later) must fail closed.
- Invalid persisted bands → explicit validation error (fail closed).

## Migration

For an existing local database:

```bash
pnpm --filter @polivo/db-local db:migrate
```

Migration `007_commission_policy_versioning` adds `commission_policies` and metadata columns on `commission_band_sets`. Do not reinitialize or reset the database. Restart the stall service after migrate. Staff who need `commission.manage` must refresh permissions / re-sign-in.

## Desktop Settings

Settings → Commission settings:

1. View configuration status, active version, bands with inclusive boundary labels, and rounding summary.
2. Edit candidate bands, validate gaps/overlaps, review, then activate.
3. Browse version history (read-only).
4. Run service-validated calculation previews.

## Verification checklist

1. Apply migration `007` with `db:migrate`.
2. Restart stall service.
3. Refresh authorized staff session if capability changed.
4. Open Settings → Commission.
5. Confirm unconfigured or current state.
6. Enter a validated test policy (synthetic rates OK in non-production).
7. Verify gap/overlap validation.
8. Preview below, at, and above every threshold against independently calculated expectations.
9. Activate; confirm active version and audit/outbox rows.
10. Attempt a conflicting edit from a second session; expect revision conflict.
11. Activate a replacement; confirm prior version remains readable and unchanged.
12. Confirm previews created no sales, payments, or ledger rows.

Record unavailable second-terminal or operator checks as pending in the progress tracker.
