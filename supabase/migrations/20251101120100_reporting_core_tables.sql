-- Phase 11: reporting copies of approved local core tables.
-- Money/weight: BIGINT (integer paisa / hundredths-kg). No floating-point.
-- Source IDs preserved. Tenant ownership on every row. Composite tenant-safe FKs.
-- ON DELETE RESTRICT for financial history. No cascade wipe via membership.

CREATE TABLE public.farmers (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, short_code)
);

CREATE TABLE public.traders (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, short_code)
);

CREATE TABLE public.vegetables (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, short_code)
);

CREATE TABLE public.commission_band_sets (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE public.commission_bands (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  band_set_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  min_price_per_kg_minor BIGINT,
  max_price_per_kg_minor BIGINT,
  rate_per_kg_minor BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, band_set_id, sort_order),
  CHECK (
    min_price_per_kg_minor IS NULL
    OR max_price_per_kg_minor IS NULL
    OR min_price_per_kg_minor <= max_price_per_kg_minor
  ),
  FOREIGN KEY (tenant_id, band_set_id)
    REFERENCES public.commission_band_sets (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sales (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  corrects_sale_id TEXT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, trader_id)
    REFERENCES public.traders (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, corrects_sale_id)
    REFERENCES public.sales (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sale_lines (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  vegetable_id TEXT NOT NULL,
  line_order INTEGER NOT NULL,
  unit_price_per_kg_minor BIGINT NOT NULL,
  packaging_weight_hundredths BIGINT NOT NULL CHECK (packaging_weight_hundredths >= 0),
  line_sale_amount_minor BIGINT,
  applied_commission_rate_per_kg_minor BIGINT,
  applied_commission_amount_minor BIGINT,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, sale_id, line_order),
  CONSTRAINT sale_lines_tenant_sale_id_unique UNIQUE (tenant_id, sale_id, id),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, vegetable_id)
    REFERENCES public.vegetables (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sale_line_package_weights (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  package_index INTEGER NOT NULL CHECK (package_index >= 1),
  gross_weight_hundredths BIGINT NOT NULL CHECK (gross_weight_hundredths >= 0),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, sale_line_id, package_index),
  FOREIGN KEY (tenant_id, sale_line_id)
    REFERENCES public.sale_lines (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sale_farmer_allocations (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  allocated_net_weight_hundredths BIGINT NOT NULL CHECK (allocated_net_weight_hundredths >= 0),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sale_farmer_allocations_sale_line_fk
    FOREIGN KEY (tenant_id, sale_id, sale_line_id)
    REFERENCES public.sale_lines (tenant_id, sale_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, farmer_id)
    REFERENCES public.farmers (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.trader_bills (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  bill_number TEXT,
  business_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  total_amount_minor BIGINT,
  payment_status TEXT CHECK (
    payment_status IS NULL
    OR payment_status IN ('unpaid', 'partially_paid', 'fully_paid')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, bill_number),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, trader_id)
    REFERENCES public.traders (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.farmer_bills (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  bill_number TEXT,
  business_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  total_amount_minor BIGINT,
  payment_status TEXT CHECK (
    payment_status IS NULL
    OR payment_status IN ('unpaid', 'partially_paid', 'fully_paid')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, bill_number),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, farmer_id)
    REFERENCES public.farmers (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.payments (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  farmer_id TEXT,
  trader_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque')),
  amount_minor BIGINT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CHECK (
    (party_kind = 'farmer' AND farmer_id IS NOT NULL AND trader_id IS NULL)
    OR (party_kind = 'trader' AND trader_id IS NOT NULL AND farmer_id IS NULL)
  ),
  FOREIGN KEY (tenant_id, farmer_id)
    REFERENCES public.farmers (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, trader_id)
    REFERENCES public.traders (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.payment_allocations (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  bill_kind TEXT NOT NULL CHECK (bill_kind IN ('farmer', 'trader')),
  farmer_bill_id TEXT,
  trader_bill_id TEXT,
  applied_amount_minor BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CHECK (
    (bill_kind = 'farmer' AND farmer_bill_id IS NOT NULL AND trader_bill_id IS NULL)
    OR (bill_kind = 'trader' AND trader_bill_id IS NOT NULL AND farmer_bill_id IS NULL)
  ),
  FOREIGN KEY (tenant_id, payment_id)
    REFERENCES public.payments (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, farmer_bill_id)
    REFERENCES public.farmer_bills (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, trader_bill_id)
    REFERENCES public.trader_bills (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.audit_events (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT,
  actor_ref TEXT,
  device_ref TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_ref TEXT,
  reason TEXT,
  change_details_json TEXT,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX farmers_tenant_stall_short_code_idx ON public.farmers (tenant_id, stall_id, short_code);
CREATE INDEX traders_tenant_stall_short_code_idx ON public.traders (tenant_id, stall_id, short_code);
CREATE INDEX vegetables_tenant_stall_short_code_idx ON public.vegetables (tenant_id, stall_id, short_code);
CREATE INDEX sales_tenant_stall_business_date_idx ON public.sales (tenant_id, stall_id, business_date);
CREATE INDEX sales_tenant_stall_trader_idx ON public.sales (tenant_id, stall_id, trader_id);
CREATE INDEX trader_bills_tenant_stall_date_idx ON public.trader_bills (tenant_id, stall_id, business_date);
CREATE INDEX farmer_bills_tenant_stall_date_idx ON public.farmer_bills (tenant_id, stall_id, business_date);
CREATE INDEX payment_allocations_payment_idx ON public.payment_allocations (tenant_id, payment_id);
CREATE INDEX sale_farmer_allocations_sale_idx ON public.sale_farmer_allocations (tenant_id, sale_id);
CREATE INDEX sale_line_package_weights_line_idx ON public.sale_line_package_weights (tenant_id, sale_line_id);
CREATE INDEX audit_events_occurred_idx ON public.audit_events (tenant_id, occurred_at);
CREATE INDEX audit_events_target_idx ON public.audit_events (tenant_id, target_type, target_id);
