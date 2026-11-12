-- Phase 28: account statement reporting support (ADR 0019).
-- Adds allocation release timestamps for historical outstanding reconstruction
-- and scoped indexes for statement/outstanding reads.
-- Does not create an authoritative balance cache.
-- Migrations 001–013 remain unchanged.

ALTER TABLE payment_allocations ADD COLUMN released_at TEXT;

-- Allow status + released_at updates for reversal; keep financial columns immutable.
-- Once released_at is set, it cannot change.
DROP TRIGGER IF EXISTS trg_payment_allocations_immutable_active;

CREATE TRIGGER trg_payment_allocations_immutable_active
BEFORE UPDATE ON payment_allocations
FOR EACH ROW
WHEN
  NEW.payment_id != OLD.payment_id
  OR NEW.obligation_kind != OLD.obligation_kind
  OR NEW.trader_bill_id IS NOT OLD.trader_bill_id
  OR NEW.sale_line_id IS NOT OLD.sale_line_id
  OR NEW.opening_draft_id IS NOT OLD.opening_draft_id
  OR NEW.farmer_bill_id IS NOT OLD.farmer_bill_id
  OR NEW.applied_amount_minor != OLD.applied_amount_minor
  OR NEW.created_at != OLD.created_at
  OR NEW.reverses_allocation_id IS NOT OLD.reverses_allocation_id
  OR (
    OLD.released_at IS NOT NULL
    AND (
      NEW.released_at IS NULL
      OR NEW.released_at != OLD.released_at
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'payment_allocations financial columns are immutable');
END;

CREATE INDEX idx_payment_allocations_stall_created
  ON payment_allocations (stall_id, created_at, id);

CREATE INDEX idx_payment_allocations_stall_released
  ON payment_allocations (stall_id, released_at)
  WHERE released_at IS NOT NULL;

CREATE INDEX idx_ledger_entries_account_business_sequence
  ON ledger_entries (stall_id, party_kind, party_id, posting_sequence);

CREATE INDEX idx_ledger_postings_stall_business_date
  ON ledger_postings (stall_id, business_date, recorded_at);

CREATE INDEX idx_payments_stall_party_unapplied
  ON payments (stall_id, party_kind, farmer_id, trader_id, status, recorded_at);
