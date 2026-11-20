-- Phase 31: cloud sync ingestion schema — stream/inbox state, reporting alignment,
-- ledger/opening/print projections, rate-limit storage. Apply RPC in follow-up migration.

-- ---------------------------------------------------------------------------
-- Reporting schema alignment (local Phases 17–30 columns / tables)
-- ---------------------------------------------------------------------------

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS locality TEXT;

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS locality TEXT;

ALTER TABLE public.vegetables
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

CREATE TABLE IF NOT EXISTS public.package_types (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, short_code)
);

CREATE TABLE IF NOT EXISTS public.commission_policies (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  active_band_set_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id),
  FOREIGN KEY (tenant_id, active_band_set_id)
    REFERENCES public.commission_band_sets (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.commission_band_sets
  ADD COLUMN IF NOT EXISTS policy_id TEXT,
  ADD COLUMN IF NOT EXISTS version_label TEXT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

-- Farmer bills: local no longer ties one bill to one sale_id.
ALTER TABLE public.farmer_bills
  ALTER COLUMN sale_id DROP NOT NULL;

ALTER TABLE public.farmer_bills
  ADD COLUMN IF NOT EXISTS farmer_short_code TEXT,
  ADD COLUMN IF NOT EXISTS farmer_display_name TEXT,
  ADD COLUMN IF NOT EXISTS covered_business_date_from DATE,
  ADD COLUMN IF NOT EXISTS covered_business_date_to DATE,
  ADD COLUMN IF NOT EXISTS total_sale_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS total_commission_minor BIGINT,
  ADD COLUMN IF NOT EXISTS total_farmer_receives_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'LKR',
  ADD COLUMN IF NOT EXISTS selection_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.farmer_bill_lines (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  farmer_bill_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  line_order INTEGER NOT NULL CHECK (line_order >= 1),
  trader_bill_id TEXT,
  trader_bill_number TEXT,
  business_date DATE NOT NULL,
  vegetable_id TEXT NOT NULL,
  vegetable_short_code TEXT NOT NULL,
  vegetable_display_name TEXT NOT NULL,
  package_type_id TEXT,
  package_type_short_code TEXT,
  package_type_display_name TEXT,
  package_count INTEGER NOT NULL CHECK (package_count >= 0),
  net_weight_hundredths BIGINT NOT NULL CHECK (net_weight_hundredths >= 0),
  unit_price_per_kg_minor BIGINT NOT NULL,
  sale_amount_minor BIGINT NOT NULL,
  commission_amount_minor BIGINT NOT NULL,
  farmer_receives_minor BIGINT NOT NULL,
  commission_policy_id TEXT,
  commission_version_id TEXT,
  commission_band_id TEXT,
  applied_commission_rate_per_kg_minor BIGINT,
  sale_posting_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, farmer_bill_id, line_order),
  UNIQUE (tenant_id, stall_id, sale_line_id),
  FOREIGN KEY (tenant_id, farmer_bill_id)
    REFERENCES public.farmer_bills (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS business_date DATE,
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actor_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS posting_id TEXT,
  ADD COLUMN IF NOT EXISTS reverses_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS reversed_by_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS bank_transfer_reference TEXT,
  ADD COLUMN IF NOT EXISTS bank_transfer_date DATE,
  ADD COLUMN IF NOT EXISTS bank_account_label TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS cheque_number TEXT,
  ADD COLUMN IF NOT EXISTS issuing_bank_label TEXT,
  ADD COLUMN IF NOT EXISTS cheque_date DATE,
  ADD COLUMN IF NOT EXISTS physical_handover_date DATE,
  ADD COLUMN IF NOT EXISTS recognition_basis TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'LKR';

ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS obligation_kind TEXT,
  ADD COLUMN IF NOT EXISTS sale_line_id TEXT,
  ADD COLUMN IF NOT EXISTS opening_draft_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

-- Local Phase 26 allocations may target sale lines / openings without a bill row.
ALTER TABLE public.payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_bill_kind_check;
ALTER TABLE public.payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_check;
DO $$
BEGIN
  ALTER TABLE public.payment_allocations
    DROP CONSTRAINT IF EXISTS payment_allocations_bill_kind_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE public.payment_allocations
  ALTER COLUMN bill_kind DROP NOT NULL;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_target_check CHECK (
    (
      bill_kind = 'farmer'
      AND farmer_bill_id IS NOT NULL
      AND trader_bill_id IS NULL
    )
    OR (
      bill_kind = 'trader'
      AND trader_bill_id IS NOT NULL
      AND farmer_bill_id IS NULL
    )
    OR (
      obligation_kind IN ('farmer_sale_line', 'opening_balance')
      AND (
        sale_line_id IS NOT NULL
        OR opening_draft_id IS NOT NULL
        OR farmer_bill_id IS NOT NULL
      )
    )
  );

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_operation_id TEXT;

CREATE TABLE IF NOT EXISTS public.sale_correction_operations (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  source_sale_id TEXT NOT NULL,
  replacement_sale_id TEXT,
  reversal_posting_id TEXT,
  replacement_posting_id TEXT,
  reason TEXT NOT NULL,
  business_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  actor_staff_id TEXT,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.party_accounts (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  party_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  opening_status TEXT NOT NULL DEFAULT 'not_opened',
  opening_cutoff_date DATE,
  opening_completed_at TIMESTAMPTZ,
  opening_draft_id TEXT,
  opening_posting_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, party_kind, party_id)
);

CREATE TABLE IF NOT EXISTS public.ledger_postings (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  financial_event_type TEXT NOT NULL,
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  business_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  actor_staff_id TEXT,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'LKR',
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, source_type, source_id, financial_event_type, event_sequence)
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  posting_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  party_id TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  currency TEXT NOT NULL DEFAULT 'LKR',
  posting_sequence BIGINT NOT NULL CHECK (posting_sequence >= 1),
  reverses_entry_id TEXT,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, posting_sequence),
  FOREIGN KEY (tenant_id, posting_id)
    REFERENCES public.ledger_postings (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.print_jobs (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  document_kind TEXT NOT NULL,
  document_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  actor_staff_id TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.print_attempts (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  classification TEXT,
  outcome TEXT,
  detail TEXT,
  is_reprint BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, job_id)
    REFERENCES public.print_jobs (tenant_id, id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Inbox / stream state
-- ---------------------------------------------------------------------------

CREATE TABLE public.sync_source_streams (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  source_stream_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  stream_generation INTEGER NOT NULL DEFAULT 1 CHECK (stream_generation >= 1),
  committed_cursor BIGINT NOT NULL DEFAULT 0 CHECK (committed_cursor >= 0),
  compatibility_protocol_version TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_stream_id),
  UNIQUE (tenant_id, installation_id)
);

CREATE INDEX sync_source_streams_stall_idx
  ON public.sync_source_streams (tenant_id, stall_id);

CREATE TABLE public.sync_transaction_group_receipts (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  source_stream_id TEXT NOT NULL,
  transaction_group_id TEXT NOT NULL,
  stream_generation INTEGER NOT NULL CHECK (stream_generation >= 1),
  stall_id TEXT NOT NULL,
  min_sequence BIGINT NOT NULL,
  max_sequence BIGINT NOT NULL,
  event_ids JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_stream_id, transaction_group_id),
  FOREIGN KEY (tenant_id, source_stream_id)
    REFERENCES public.sync_source_streams (tenant_id, source_stream_id) ON DELETE RESTRICT
);

ALTER TABLE public.sync_received_events
  ADD COLUMN IF NOT EXISTS source_stream_id TEXT,
  ADD COLUMN IF NOT EXISTS stream_generation INTEGER,
  ADD COLUMN IF NOT EXISTS local_sequence BIGINT,
  ADD COLUMN IF NOT EXISTS transaction_group_id TEXT,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS applied_status TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostics_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sync_received_events_stream_sequence_uidx
  ON public.sync_received_events (tenant_id, source_stream_id, local_sequence)
  WHERE source_stream_id IS NOT NULL AND local_sequence IS NOT NULL;

CREATE TABLE public.sync_ingest_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Grants + RLS for new tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'package_types',
    'commission_policies',
    'farmer_bill_lines',
    'sale_correction_operations',
    'party_accounts',
    'ledger_postings',
    'ledger_entries',
    'print_jobs',
    'print_attempts',
    'sync_source_streams',
    'sync_transaction_group_receipts',
    'sync_ingest_rate_limits'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    IF t <> 'sync_ingest_rate_limits' THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY package_types_select_member ON public.package_types
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY commission_policies_select_member ON public.commission_policies
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY farmer_bill_lines_select_member ON public.farmer_bill_lines
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sale_correction_operations_select_member ON public.sale_correction_operations
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY party_accounts_select_member ON public.party_accounts
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY ledger_postings_select_member ON public.ledger_postings
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY ledger_entries_select_member ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY print_jobs_select_member ON public.print_jobs
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY print_attempts_select_member ON public.print_attempts
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sync_source_streams_select_member ON public.sync_source_streams
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

CREATE POLICY sync_transaction_group_receipts_select_member ON public.sync_transaction_group_receipts
  FOR SELECT TO authenticated
  USING (public.has_active_reporting_access(tenant_id));

-- Rate-limit table: no authenticated access (service role only via RPC).
