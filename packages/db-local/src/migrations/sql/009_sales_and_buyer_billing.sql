-- Phase 22: sales draft persistence, calculation snapshots, buyer-bill uniqueness, sequence seeds.
-- Do not modify migrations 001–008. Farmer sequence seeded for Phase 24; buyer finalize uses trader sequence.

-- Sale header snapshots and finalize metadata
ALTER TABLE sales ADD COLUMN trader_short_code TEXT;
ALTER TABLE sales ADD COLUMN trader_display_name TEXT;
ALTER TABLE sales ADD COLUMN commission_policy_id TEXT;
ALTER TABLE sales ADD COLUMN commission_version_id TEXT;
ALTER TABLE sales ADD COLUMN calculation_fingerprint TEXT;
ALTER TABLE sales ADD COLUMN posting_id TEXT;
ALTER TABLE sales ADD COLUMN total_sale_amount_minor INTEGER;
ALTER TABLE sales ADD COLUMN total_commission_minor INTEGER;
ALTER TABLE sales ADD COLUMN total_trader_pays_minor INTEGER;
ALTER TABLE sales ADD COLUMN total_farmer_receives_minor INTEGER;

-- Preserve client package row keys across draft edits
ALTER TABLE sale_line_package_weights ADD COLUMN row_key TEXT;

-- Sale line package type, notes, weight/money snapshots, commission snapshots
ALTER TABLE sale_lines ADD COLUMN package_type_id TEXT;
ALTER TABLE sale_lines ADD COLUMN notes TEXT;
ALTER TABLE sale_lines ADD COLUMN farmer_id TEXT;
ALTER TABLE sale_lines ADD COLUMN farmer_short_code TEXT;
ALTER TABLE sale_lines ADD COLUMN farmer_display_name TEXT;
ALTER TABLE sale_lines ADD COLUMN vegetable_short_code TEXT;
ALTER TABLE sale_lines ADD COLUMN vegetable_display_name TEXT;
ALTER TABLE sale_lines ADD COLUMN package_type_short_code TEXT;
ALTER TABLE sale_lines ADD COLUMN package_type_display_name TEXT;
ALTER TABLE sale_lines ADD COLUMN gross_weight_hundredths INTEGER;
ALTER TABLE sale_lines ADD COLUMN net_weight_hundredths INTEGER;
ALTER TABLE sale_lines ADD COLUMN commission_policy_id TEXT;
ALTER TABLE sale_lines ADD COLUMN commission_version_id TEXT;
ALTER TABLE sale_lines ADD COLUMN commission_band_id TEXT;
ALTER TABLE sale_lines ADD COLUMN trader_pays_minor INTEGER;
ALTER TABLE sale_lines ADD COLUMN farmer_receives_minor INTEGER;

-- Trader (buyer) bill snapshots and one-bill-per-sale uniqueness
ALTER TABLE trader_bills ADD COLUMN trader_short_code TEXT;
ALTER TABLE trader_bills ADD COLUMN trader_display_name TEXT;
ALTER TABLE trader_bills ADD COLUMN bill_type TEXT NOT NULL DEFAULT 'trader'
  CHECK (bill_type = 'trader');
ALTER TABLE trader_bills ADD COLUMN commission_policy_id TEXT;
ALTER TABLE trader_bills ADD COLUMN commission_version_id TEXT;
ALTER TABLE trader_bills ADD COLUMN calculation_fingerprint TEXT;
ALTER TABLE trader_bills ADD COLUMN posting_id TEXT;
ALTER TABLE trader_bills ADD COLUMN total_commission_minor INTEGER;
ALTER TABLE trader_bills ADD COLUMN total_farmer_receives_minor INTEGER;
ALTER TABLE trader_bills ADD COLUMN finalized_at TEXT;

CREATE UNIQUE INDEX idx_trader_bills_stall_sale
  ON trader_bills (stall_id, sale_id);

CREATE INDEX idx_sales_stall_status_updated
  ON sales (stall_id, status, updated_at DESC);

CREATE INDEX idx_trader_bills_stall_finalized
  ON trader_bills (stall_id, status, finalized_at DESC);

CREATE INDEX idx_sale_lines_sale_order
  ON sale_lines (sale_id, line_order);

-- Seed bill sequences for existing bound stalls without resetting configured values.
INSERT OR IGNORE INTO bill_sequences (stall_id, bill_type, next_value)
SELECT stall_id, 'trader', 444444
FROM stall_binding;

INSERT OR IGNORE INTO bill_sequences (stall_id, bill_type, next_value)
SELECT stall_id, 'farmer', 111111
FROM stall_binding;

-- Prevent mutation of finalized sale financial snapshot columns.
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
     OR IFNULL(NEW.finalized_at, '') != IFNULL(OLD.finalized_at, '');
END;

CREATE TRIGGER trg_sale_lines_finalized_immutable
BEFORE UPDATE ON sale_lines
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM sales
  WHERE sales.id = OLD.sale_id AND sales.stall_id = OLD.stall_id AND sales.status = 'finalized'
)
BEGIN
  SELECT RAISE(ABORT, 'Finalized sale lines are immutable');
END;

CREATE TRIGGER trg_sale_lines_finalized_delete_forbidden
BEFORE DELETE ON sale_lines
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM sales
  WHERE sales.id = OLD.sale_id AND sales.stall_id = OLD.stall_id AND sales.status = 'finalized'
)
BEGIN
  SELECT RAISE(ABORT, 'Finalized sale lines cannot be deleted');
END;

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
