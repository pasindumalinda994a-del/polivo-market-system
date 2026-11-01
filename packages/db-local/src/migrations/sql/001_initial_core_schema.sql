-- Phase 09 initial core operational schema (decision 0004).
-- Money = INTEGER paisa; weight = INTEGER hundredths-kg. Never REAL.
-- Deferred: arrivals, inventory, staff, devices, permissions, categories,
-- package-type masters, GL postings, cheque clearance, commission overrides.
-- schema_migrations is owned by the migration runner, not this file.

CREATE TABLE local_installation (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE stall_binding (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  stall_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  bound_at TEXT NOT NULL
);

CREATE TABLE farmers (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, short_code),
  UNIQUE (id, stall_id)
);

CREATE TABLE traders (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, short_code),
  UNIQUE (id, stall_id)
);

CREATE TABLE vegetables (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, short_code),
  UNIQUE (id, stall_id)
);

CREATE TABLE commission_band_sets (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id)
);

CREATE TABLE commission_bands (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  band_set_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  min_price_per_kg_minor INTEGER,
  max_price_per_kg_minor INTEGER,
  rate_per_kg_minor INTEGER NOT NULL,
  CHECK (
    min_price_per_kg_minor IS NULL
    OR max_price_per_kg_minor IS NULL
    OR min_price_per_kg_minor <= max_price_per_kg_minor
  ),
  FOREIGN KEY (band_set_id, stall_id) REFERENCES commission_band_sets (id, stall_id) ON DELETE RESTRICT,
  UNIQUE (band_set_id, sort_order)
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  corrects_sale_id TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  FOREIGN KEY (trader_id, stall_id) REFERENCES traders (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (corrects_sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE sale_lines (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  vegetable_id TEXT NOT NULL,
  line_order INTEGER NOT NULL,
  unit_price_per_kg_minor INTEGER NOT NULL,
  packaging_weight_hundredths INTEGER NOT NULL CHECK (packaging_weight_hundredths >= 0),
  line_sale_amount_minor INTEGER,
  applied_commission_rate_per_kg_minor INTEGER,
  applied_commission_amount_minor INTEGER,
  UNIQUE (id, stall_id),
  UNIQUE (sale_id, line_order),
  FOREIGN KEY (sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (vegetable_id, stall_id) REFERENCES vegetables (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE sale_line_package_weights (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  package_index INTEGER NOT NULL CHECK (package_index >= 1),
  gross_weight_hundredths INTEGER NOT NULL CHECK (gross_weight_hundredths >= 0),
  UNIQUE (sale_line_id, package_index),
  FOREIGN KEY (sale_line_id, stall_id) REFERENCES sale_lines (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE sale_farmer_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  allocated_net_weight_hundredths INTEGER NOT NULL CHECK (allocated_net_weight_hundredths >= 0),
  UNIQUE (id, stall_id),
  FOREIGN KEY (sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_line_id, stall_id) REFERENCES sale_lines (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (farmer_id, stall_id) REFERENCES farmers (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE trader_bills (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  bill_number TEXT,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  total_amount_minor INTEGER,
  payment_status TEXT CHECK (
    payment_status IS NULL
    OR payment_status IN ('unpaid', 'partially_paid', 'fully_paid')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, bill_number),
  FOREIGN KEY (sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (trader_id, stall_id) REFERENCES traders (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE farmer_bills (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  bill_number TEXT,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  total_amount_minor INTEGER,
  payment_status TEXT CHECK (
    payment_status IS NULL
    OR payment_status IN ('unpaid', 'partially_paid', 'fully_paid')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, bill_number),
  FOREIGN KEY (sale_id, stall_id) REFERENCES sales (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (farmer_id, stall_id) REFERENCES farmers (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE bill_sequences (
  stall_id TEXT NOT NULL,
  bill_type TEXT NOT NULL CHECK (bill_type IN ('farmer', 'trader')),
  next_value INTEGER NOT NULL CHECK (next_value >= 0),
  PRIMARY KEY (stall_id, bill_type)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  farmer_id TEXT,
  trader_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  amount_minor INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (id, stall_id),
  CHECK (
    (party_kind = 'farmer' AND farmer_id IS NOT NULL AND trader_id IS NULL)
    OR (party_kind = 'trader' AND trader_id IS NOT NULL AND farmer_id IS NULL)
  ),
  FOREIGN KEY (farmer_id, stall_id) REFERENCES farmers (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (trader_id, stall_id) REFERENCES traders (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE payment_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  bill_kind TEXT NOT NULL CHECK (bill_kind IN ('farmer', 'trader')),
  farmer_bill_id TEXT,
  trader_bill_id TEXT,
  applied_amount_minor INTEGER NOT NULL,
  CHECK (
    (bill_kind = 'farmer' AND farmer_bill_id IS NOT NULL AND trader_bill_id IS NULL)
    OR (bill_kind = 'trader' AND trader_bill_id IS NOT NULL AND farmer_bill_id IS NULL)
  ),
  FOREIGN KEY (payment_id, stall_id) REFERENCES payments (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (farmer_bill_id, stall_id) REFERENCES farmer_bills (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (trader_bill_id, stall_id) REFERENCES trader_bills (id, stall_id) ON DELETE RESTRICT
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT,
  tenant_id TEXT,
  actor_ref TEXT,
  device_ref TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  occurred_at TEXT NOT NULL,
  correlation_ref TEXT,
  reason TEXT,
  change_details_json TEXT
);

CREATE TABLE command_idempotency (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  command_type TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  result_ref TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE sync_outbox (
  event_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  originating_device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_schema_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  local_sequence INTEGER NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_attempt_at TEXT,
  ack_state TEXT NOT NULL DEFAULT 'pending' CHECK (ack_state IN ('pending', 'acknowledged', 'failed')),
  acknowledged_at TEXT,
  UNIQUE (stall_id, local_sequence)
);

CREATE INDEX idx_farmers_stall_short_code ON farmers (stall_id, short_code);
CREATE INDEX idx_traders_stall_short_code ON traders (stall_id, short_code);
CREATE INDEX idx_vegetables_stall_short_code ON vegetables (stall_id, short_code);
CREATE INDEX idx_sales_stall_business_date ON sales (stall_id, business_date);
CREATE INDEX idx_sales_stall_trader ON sales (stall_id, trader_id);
CREATE INDEX idx_trader_bills_stall_number ON trader_bills (stall_id, bill_number);
CREATE INDEX idx_trader_bills_stall_date ON trader_bills (stall_id, business_date);
CREATE INDEX idx_trader_bills_trader ON trader_bills (stall_id, trader_id);
CREATE INDEX idx_farmer_bills_stall_number ON farmer_bills (stall_id, bill_number);
CREATE INDEX idx_farmer_bills_stall_date ON farmer_bills (stall_id, business_date);
CREATE INDEX idx_farmer_bills_farmer ON farmer_bills (stall_id, farmer_id);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX idx_sale_farmer_allocations_sale ON sale_farmer_allocations (sale_id);
CREATE INDEX idx_sale_line_package_weights_line ON sale_line_package_weights (sale_line_id);
CREATE INDEX idx_sync_outbox_pending ON sync_outbox (ack_state, local_sequence);
CREATE INDEX idx_audit_events_occurred ON audit_events (occurred_at);
CREATE INDEX idx_audit_events_target ON audit_events (target_type, target_id);
