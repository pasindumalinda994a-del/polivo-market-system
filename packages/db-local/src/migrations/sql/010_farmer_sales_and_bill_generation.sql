-- Phase 24: farmer-bill headers (multi-sale-line), immutable source inclusions, immutability triggers.
-- farmer_bills skeleton from 001 was never issued via API; rebuild drops single-sale_id requirement.
-- payment_allocations.farmer_bill_id FK is preserved via table rebuild.

PRAGMA foreign_keys = OFF;

CREATE TABLE farmer_bills_new (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  farmer_short_code TEXT NOT NULL,
  farmer_display_name TEXT NOT NULL,
  bill_type TEXT NOT NULL DEFAULT 'farmer'
    CHECK (bill_type = 'farmer'),
  bill_number TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  covered_business_date_from TEXT NOT NULL,
  covered_business_date_to TEXT NOT NULL,
  total_sale_amount_minor INTEGER NOT NULL,
  total_commission_minor INTEGER NOT NULL,
  total_farmer_receives_minor INTEGER NOT NULL,
  total_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR' CHECK (currency = 'LKR'),
  payment_status TEXT NOT NULL CHECK (
    payment_status IN ('unpaid', 'partially_paid', 'fully_paid')
  ),
  selection_fingerprint TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, bill_number),
  FOREIGN KEY (farmer_id, stall_id) REFERENCES farmers (id, stall_id) ON DELETE RESTRICT
);

-- No data migration: farmer_bills had no issuance API and must not auto-generate bills.
DROP TABLE farmer_bills;
ALTER TABLE farmer_bills_new RENAME TO farmer_bills;

PRAGMA foreign_keys = ON;

CREATE TABLE farmer_bill_lines (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  farmer_bill_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  line_order INTEGER NOT NULL CHECK (line_order >= 1),
  trader_bill_id TEXT,
  trader_bill_number TEXT,
  business_date TEXT NOT NULL,
  vegetable_id TEXT NOT NULL,
  vegetable_short_code TEXT NOT NULL,
  vegetable_display_name TEXT NOT NULL,
  package_type_id TEXT,
  package_type_short_code TEXT,
  package_type_display_name TEXT,
  package_count INTEGER NOT NULL CHECK (package_count >= 0),
  net_weight_hundredths INTEGER NOT NULL CHECK (net_weight_hundredths >= 0),
  unit_price_per_kg_minor INTEGER NOT NULL,
  sale_amount_minor INTEGER NOT NULL,
  commission_amount_minor INTEGER NOT NULL,
  farmer_receives_minor INTEGER NOT NULL,
  commission_policy_id TEXT,
  commission_version_id TEXT,
  commission_band_id TEXT,
  applied_commission_rate_per_kg_minor INTEGER,
  sale_posting_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (farmer_bill_id, line_order),
  UNIQUE (stall_id, sale_line_id),
  FOREIGN KEY (farmer_bill_id, stall_id) REFERENCES farmer_bills (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_line_id, stall_id) REFERENCES sale_lines (id, stall_id) ON DELETE RESTRICT
);

CREATE INDEX idx_farmer_bills_stall_number ON farmer_bills (stall_id, bill_number);
CREATE INDEX idx_farmer_bills_stall_date ON farmer_bills (stall_id, business_date);
CREATE INDEX idx_farmer_bills_farmer ON farmer_bills (stall_id, farmer_id);
CREATE INDEX idx_farmer_bills_stall_finalized
  ON farmer_bills (stall_id, status, finalized_at DESC);
CREATE INDEX idx_farmer_bill_lines_bill
  ON farmer_bill_lines (stall_id, farmer_bill_id, line_order);
CREATE INDEX idx_farmer_bill_lines_sale
  ON farmer_bill_lines (stall_id, sale_id);

CREATE TRIGGER trg_farmer_bills_finalized_immutable
BEFORE UPDATE ON farmer_bills
FOR EACH ROW
WHEN OLD.status = 'finalized'
BEGIN
  SELECT RAISE(
    ABORT,
    'Finalized farmer bills are immutable'
  )
  WHERE NEW.status != OLD.status
     OR NEW.bill_number != OLD.bill_number
     OR NEW.total_amount_minor != OLD.total_amount_minor
     OR NEW.total_sale_amount_minor != OLD.total_sale_amount_minor
     OR NEW.total_commission_minor != OLD.total_commission_minor
     OR NEW.total_farmer_receives_minor != OLD.total_farmer_receives_minor
     OR NEW.selection_fingerprint != OLD.selection_fingerprint
     OR NEW.farmer_id != OLD.farmer_id
     OR NEW.currency != OLD.currency;
END;

CREATE TRIGGER trg_farmer_bill_lines_immutable_update
BEFORE UPDATE ON farmer_bill_lines
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Farmer bill lines are immutable');
END;

CREATE TRIGGER trg_farmer_bill_lines_immutable_delete
BEFORE DELETE ON farmer_bill_lines
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Farmer bill lines cannot be deleted');
END;
