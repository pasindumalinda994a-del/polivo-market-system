-- Phase 25: sale correction operations, lineage projections, history indexes.
-- Original finalized financial snapshots remain immutable (ADR 0016).

-- Correction / reversal operation records (immutable after commit).
CREATE TABLE sale_correction_operations (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('correct', 'reverse')),
  source_sale_id TEXT NOT NULL,
  replacement_sale_id TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 500),
  actor_staff_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  preview_fingerprint TEXT NOT NULL,
  source_revision_expected INTEGER NOT NULL CHECK (source_revision_expected >= 1),
  status TEXT NOT NULL CHECK (status IN ('committed')),
  reversal_posting_id TEXT NOT NULL,
  replacement_posting_id TEXT,
  original_trader_bill_id TEXT,
  replacement_trader_bill_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, source_sale_id),
  CHECK (
    (action = 'reverse' AND replacement_sale_id IS NULL AND replacement_posting_id IS NULL AND replacement_trader_bill_id IS NULL)
    OR
    (action = 'correct' AND replacement_sale_id IS NOT NULL AND replacement_posting_id IS NOT NULL)
  ),
  CHECK (replacement_sale_id IS NULL OR replacement_sale_id != source_sale_id),
  FOREIGN KEY (source_sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (replacement_sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversal_posting_id, stall_id) REFERENCES ledger_postings (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (replacement_posting_id, stall_id) REFERENCES ledger_postings (id, stall_id) ON DELETE RESTRICT
);

CREATE INDEX idx_sale_correction_ops_stall_recorded
  ON sale_correction_operations (stall_id, recorded_at DESC);

CREATE INDEX idx_sale_correction_ops_stall_replacement
  ON sale_correction_operations (stall_id, replacement_sale_id);

-- Rebuildable correction projections on sales (financial snapshot columns stay immutable).
ALTER TABLE sales ADD COLUMN correction_status TEXT NOT NULL DEFAULT 'active'
  CHECK (correction_status IN ('active', 'reversed', 'superseded'));

ALTER TABLE sales ADD COLUMN correction_operation_id TEXT;

ALTER TABLE sales ADD COLUMN replacement_sale_id TEXT;

ALTER TABLE sales ADD COLUMN reversal_posting_id TEXT;

CREATE INDEX idx_sales_stall_correction_status
  ON sales (stall_id, correction_status, updated_at DESC);

CREATE INDEX idx_sales_stall_replacement
  ON sales (stall_id, replacement_sale_id);

CREATE INDEX idx_sales_stall_correction_op
  ON sales (stall_id, correction_operation_id);

-- At most one active successor pointing at a given original via corrects_sale_id.
CREATE UNIQUE INDEX idx_sales_unique_active_successor
  ON sales (stall_id, corrects_sale_id)
  WHERE corrects_sale_id IS NOT NULL AND status = 'finalized';

-- Trader bill correction projections (issued totals/numbers remain immutable).
ALTER TABLE trader_bills ADD COLUMN correction_status TEXT NOT NULL DEFAULT 'active'
  CHECK (correction_status IN ('active', 'reversed', 'superseded'));

ALTER TABLE trader_bills ADD COLUMN correction_operation_id TEXT;

ALTER TABLE trader_bills ADD COLUMN replacement_trader_bill_id TEXT;

CREATE INDEX idx_trader_bills_stall_correction_status
  ON trader_bills (stall_id, correction_status, finalized_at DESC);

CREATE INDEX idx_trader_bills_stall_number_history
  ON trader_bills (stall_id, bill_number, finalized_at DESC);

CREATE INDEX idx_trader_bills_stall_party_date
  ON trader_bills (stall_id, trader_id, business_date DESC);

CREATE INDEX idx_farmer_bills_stall_party_date
  ON farmer_bills (stall_id, farmer_id, business_date DESC);

CREATE INDEX idx_farmer_bills_stall_number_history
  ON farmer_bills (stall_id, bill_number, finalized_at DESC);

CREATE INDEX idx_payment_allocations_trader_bill
  ON payment_allocations (stall_id, trader_bill_id);

CREATE INDEX idx_payment_allocations_farmer_bill
  ON payment_allocations (stall_id, farmer_bill_id);

-- Allow correction projection updates on finalized sales; keep financial snapshots immutable.
DROP TRIGGER IF EXISTS trg_sales_finalized_immutable;

CREATE TRIGGER trg_sales_finalized_immutable
BEFORE UPDATE ON sales
FOR EACH ROW
WHEN OLD.status = 'finalized'
BEGIN
  SELECT RAISE(
    ABORT,
    'Finalized sales are immutable'
  )
  WHERE NEW.status != OLD.status
     OR NEW.trader_id != OLD.trader_id
     OR NEW.business_date != OLD.business_date
     OR IFNULL(NEW.calculation_fingerprint, '') != IFNULL(OLD.calculation_fingerprint, '')
     OR IFNULL(NEW.posting_id, '') != IFNULL(OLD.posting_id, '')
     OR IFNULL(NEW.total_sale_amount_minor, -1) != IFNULL(OLD.total_sale_amount_minor, -1)
     OR IFNULL(NEW.total_commission_minor, -1) != IFNULL(OLD.total_commission_minor, -1)
     OR IFNULL(NEW.total_trader_pays_minor, -1) != IFNULL(OLD.total_trader_pays_minor, -1)
     OR IFNULL(NEW.total_farmer_receives_minor, -1) != IFNULL(OLD.total_farmer_receives_minor, -1)
     OR IFNULL(NEW.commission_policy_id, '') != IFNULL(OLD.commission_policy_id, '')
     OR IFNULL(NEW.commission_version_id, '') != IFNULL(OLD.commission_version_id, '')
     OR IFNULL(NEW.finalized_at, '') != IFNULL(OLD.finalized_at, '')
     OR IFNULL(NEW.corrects_sale_id, '') != IFNULL(OLD.corrects_sale_id, '');
END;

CREATE TRIGGER trg_sales_correction_projection_guard
BEFORE UPDATE ON sales
FOR EACH ROW
WHEN OLD.status = 'finalized'
  AND (
    NEW.correction_status != OLD.correction_status
    OR IFNULL(NEW.correction_operation_id, '') != IFNULL(OLD.correction_operation_id, '')
    OR IFNULL(NEW.replacement_sale_id, '') != IFNULL(OLD.replacement_sale_id, '')
    OR IFNULL(NEW.reversal_posting_id, '') != IFNULL(OLD.reversal_posting_id, '')
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Invalid sale correction projection transition'
  )
  WHERE OLD.correction_status != 'active'
     OR NEW.correction_status NOT IN ('reversed', 'superseded')
     OR NEW.correction_operation_id IS NULL
     OR NEW.reversal_posting_id IS NULL
     OR (NEW.correction_status = 'superseded' AND NEW.replacement_sale_id IS NULL)
     OR (NEW.correction_status = 'reversed' AND NEW.replacement_sale_id IS NOT NULL);
END;

DROP TRIGGER IF EXISTS trg_trader_bills_finalized_immutable;

CREATE TRIGGER trg_trader_bills_finalized_immutable
BEFORE UPDATE ON trader_bills
FOR EACH ROW
WHEN OLD.status = 'finalized'
BEGIN
  SELECT RAISE(
    ABORT,
    'Finalized trader bills are immutable'
  )
  WHERE NEW.status != OLD.status
     OR IFNULL(NEW.bill_number, '') != IFNULL(OLD.bill_number, '')
     OR IFNULL(NEW.total_amount_minor, -1) != IFNULL(OLD.total_amount_minor, -1)
     OR IFNULL(NEW.posting_id, '') != IFNULL(OLD.posting_id, '')
     OR IFNULL(NEW.calculation_fingerprint, '') != IFNULL(OLD.calculation_fingerprint, '')
     OR NEW.sale_id != OLD.sale_id
     OR NEW.trader_id != OLD.trader_id;
END;

CREATE TRIGGER trg_trader_bills_correction_projection_guard
BEFORE UPDATE ON trader_bills
FOR EACH ROW
WHEN OLD.status = 'finalized'
  AND (
    NEW.correction_status != OLD.correction_status
    OR IFNULL(NEW.correction_operation_id, '') != IFNULL(OLD.correction_operation_id, '')
    OR IFNULL(NEW.replacement_trader_bill_id, '') != IFNULL(OLD.replacement_trader_bill_id, '')
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Invalid trader bill correction projection transition'
  )
  WHERE OLD.correction_status != 'active'
     OR NEW.correction_status NOT IN ('reversed', 'superseded')
     OR NEW.correction_operation_id IS NULL
     OR (NEW.correction_status = 'superseded' AND NEW.replacement_trader_bill_id IS NULL)
     OR (NEW.correction_status = 'reversed' AND NEW.replacement_trader_bill_id IS NOT NULL);
END;

CREATE TRIGGER trg_sale_correction_operations_immutable
BEFORE UPDATE ON sale_correction_operations
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Sale correction operations are immutable');
END;

CREATE TRIGGER trg_sale_correction_operations_delete_forbidden
BEFORE DELETE ON sale_correction_operations
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Sale correction operations cannot be deleted');
END;
