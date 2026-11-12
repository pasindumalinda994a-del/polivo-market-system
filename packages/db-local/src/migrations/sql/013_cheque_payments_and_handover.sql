-- Phase 27: farmer cheque payment metadata and handover settlement (ADR 0018).
-- Extends payments from migration 012; preserves existing cash/bank rows and allocations.
-- Does not add clearance, deposit, bounce, or maturity tables.
--
-- IMPORTANT: The migration runner wraps each migration in BEGIN IMMEDIATE, so
-- PRAGMA foreign_keys = OFF is a no-op mid-transaction. Rebuild with FKs ON by
-- copying into new tables, dropping the child (payment_allocations) first, then
-- the parent (payments), then renaming.

CREATE TABLE payments_new (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  farmer_id TEXT,
  trader_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('receive', 'pay')),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'LKR' CHECK (currency = 'LKR'),
  business_date TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('posted', 'reversed')),
  paid_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  actor_staff_id TEXT NOT NULL,
  posting_id TEXT NOT NULL,
  reverses_payment_id TEXT,
  reversed_by_payment_id TEXT,
  bank_transfer_reference TEXT,
  bank_transfer_date TEXT,
  bank_account_label TEXT,
  cheque_number TEXT,
  issuing_bank_label TEXT,
  cheque_date TEXT,
  physical_handover_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, reference_number),
  CHECK (
    (party_kind = 'farmer' AND farmer_id IS NOT NULL AND trader_id IS NULL AND direction = 'pay')
    OR (party_kind = 'trader' AND trader_id IS NOT NULL AND farmer_id IS NULL AND direction = 'receive')
  ),
  CHECK (
    (method = 'bank_transfer' AND bank_transfer_reference IS NOT NULL AND length(trim(bank_transfer_reference)) > 0
      AND bank_transfer_date IS NOT NULL)
    OR (method != 'bank_transfer' AND bank_transfer_reference IS NULL AND bank_transfer_date IS NULL
      AND bank_account_label IS NULL)
  ),
  CHECK (
    (method = 'cheque'
      AND cheque_number IS NOT NULL AND length(trim(cheque_number)) > 0
      AND issuing_bank_label IS NOT NULL AND length(trim(issuing_bank_label)) > 0
      AND cheque_date IS NOT NULL
      AND physical_handover_date IS NOT NULL)
    OR (method != 'cheque'
      AND cheque_number IS NULL
      AND issuing_bank_label IS NULL
      AND cheque_date IS NULL
      AND physical_handover_date IS NULL)
  ),
  CHECK (
    (status = 'posted' AND reverses_payment_id IS NULL)
    OR (status = 'reversed' AND reverses_payment_id IS NULL)
    OR (reverses_payment_id IS NOT NULL)
  ),
  FOREIGN KEY (farmer_id, stall_id) REFERENCES farmers (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (trader_id, stall_id) REFERENCES traders (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (posting_id, stall_id) REFERENCES ledger_postings (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (reverses_payment_id, stall_id) REFERENCES payments_new (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversed_by_payment_id, stall_id) REFERENCES payments_new (id, stall_id) ON DELETE RESTRICT
);

INSERT INTO payments_new (
  id, stall_id, party_kind, farmer_id, trader_id, direction, method, amount_minor, currency,
  business_date, reference_number, status, paid_at, recorded_at, actor_staff_id, posting_id,
  reverses_payment_id, reversed_by_payment_id, bank_transfer_reference, bank_transfer_date,
  bank_account_label, cheque_number, issuing_bank_label, cheque_date, physical_handover_date,
  note, created_at
)
SELECT
  id, stall_id, party_kind, farmer_id, trader_id, direction, method, amount_minor, currency,
  business_date, reference_number, status, paid_at, recorded_at, actor_staff_id, posting_id,
  reverses_payment_id, reversed_by_payment_id, bank_transfer_reference, bank_transfer_date,
  bank_account_label, NULL, NULL, NULL, NULL,
  note, created_at
FROM payments;

CREATE TABLE payment_allocations_new (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  obligation_kind TEXT NOT NULL CHECK (
    obligation_kind IN ('trader_bill', 'farmer_sale_line', 'opening_balance')
  ),
  trader_bill_id TEXT,
  sale_line_id TEXT,
  opening_draft_id TEXT,
  farmer_bill_id TEXT,
  applied_amount_minor INTEGER NOT NULL CHECK (applied_amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'reversed')),
  reverses_allocation_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  CHECK (
    (obligation_kind = 'trader_bill' AND trader_bill_id IS NOT NULL AND sale_line_id IS NULL AND opening_draft_id IS NULL)
    OR (obligation_kind = 'farmer_sale_line' AND sale_line_id IS NOT NULL AND trader_bill_id IS NULL AND opening_draft_id IS NULL)
    OR (obligation_kind = 'opening_balance' AND opening_draft_id IS NOT NULL AND trader_bill_id IS NULL AND sale_line_id IS NULL)
  ),
  CHECK (
    (status = 'active' AND reverses_allocation_id IS NULL)
    OR (status = 'reversed')
  ),
  FOREIGN KEY (payment_id, stall_id) REFERENCES payments_new (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (trader_bill_id, stall_id) REFERENCES trader_bills (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_line_id, stall_id) REFERENCES sale_lines (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (opening_draft_id, stall_id) REFERENCES opening_balance_drafts (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (farmer_bill_id, stall_id) REFERENCES farmer_bills (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (reverses_allocation_id, stall_id) REFERENCES payment_allocations_new (id, stall_id) ON DELETE RESTRICT
);

INSERT INTO payment_allocations_new (
  id, stall_id, payment_id, obligation_kind, trader_bill_id, sale_line_id,
  opening_draft_id, farmer_bill_id, applied_amount_minor, status, reverses_allocation_id, created_at
)
SELECT
  id, stall_id, payment_id, obligation_kind, trader_bill_id, sale_line_id,
  opening_draft_id, farmer_bill_id, applied_amount_minor, status, reverses_allocation_id, created_at
FROM payment_allocations;

-- Child table first (FK ON inside runner transaction).
DROP TABLE payment_allocations;
DROP TABLE payments;

ALTER TABLE payments_new RENAME TO payments;
ALTER TABLE payment_allocations_new RENAME TO payment_allocations;

CREATE INDEX idx_payments_stall_party_trader
  ON payments (stall_id, trader_id, business_date DESC);
CREATE INDEX idx_payments_stall_party_farmer
  ON payments (stall_id, farmer_id, business_date DESC);
CREATE INDEX idx_payments_stall_status_recorded
  ON payments (stall_id, status, recorded_at DESC);
CREATE INDEX idx_payments_stall_reference
  ON payments (stall_id, reference_number);
CREATE INDEX idx_payments_stall_method_recorded
  ON payments (stall_id, method, recorded_at DESC);
CREATE INDEX idx_payments_stall_cheque_number
  ON payments (stall_id, cheque_number);

CREATE INDEX idx_payment_allocations_payment
  ON payment_allocations (stall_id, payment_id, status);
CREATE INDEX idx_payment_allocations_trader_bill
  ON payment_allocations (stall_id, trader_bill_id, status);
CREATE INDEX idx_payment_allocations_sale_line
  ON payment_allocations (stall_id, sale_line_id, status);
CREATE INDEX idx_payment_allocations_opening_draft
  ON payment_allocations (stall_id, opening_draft_id, status);
CREATE INDEX idx_payment_allocations_farmer_bill
  ON payment_allocations (stall_id, farmer_bill_id, status);

CREATE TRIGGER trg_payments_immutable_financial
BEFORE UPDATE ON payments
FOR EACH ROW
WHEN
  NEW.amount_minor != OLD.amount_minor
  OR NEW.method != OLD.method
  OR NEW.party_kind != OLD.party_kind
  OR NEW.farmer_id IS NOT OLD.farmer_id
  OR NEW.trader_id IS NOT OLD.trader_id
  OR NEW.direction != OLD.direction
  OR NEW.business_date != OLD.business_date
  OR NEW.currency != OLD.currency
  OR NEW.reference_number != OLD.reference_number
  OR NEW.posting_id != OLD.posting_id
  OR NEW.paid_at != OLD.paid_at
  OR NEW.recorded_at != OLD.recorded_at
  OR NEW.actor_staff_id != OLD.actor_staff_id
  OR NEW.bank_transfer_reference IS NOT OLD.bank_transfer_reference
  OR NEW.bank_transfer_date IS NOT OLD.bank_transfer_date
  OR NEW.bank_account_label IS NOT OLD.bank_account_label
  OR NEW.cheque_number IS NOT OLD.cheque_number
  OR NEW.issuing_bank_label IS NOT OLD.issuing_bank_label
  OR NEW.cheque_date IS NOT OLD.cheque_date
  OR NEW.physical_handover_date IS NOT OLD.physical_handover_date
  OR NEW.note IS NOT OLD.note
  OR NEW.reverses_payment_id IS NOT OLD.reverses_payment_id
BEGIN
  SELECT RAISE(ABORT, 'payments financial columns are immutable');
END;

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
BEGIN
  SELECT RAISE(ABORT, 'payment_allocations financial columns are immutable');
END;
