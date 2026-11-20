-- Phase 35: web reporting schema parity, capability-aware financial SELECT,
-- export jobs, freshness RPC for reporting members, and apply persistence fixes.
-- Forward-only. Do not edit prior migrations.

-- ---------------------------------------------------------------------------
-- Sale / bill columns required for Phase 30 report watermark semantics
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS posting_id TEXT,
  ADD COLUMN IF NOT EXISTS correction_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS replacement_sale_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_posting_id TEXT;

DO $$
BEGIN
  ALTER TABLE public.sales
    DROP CONSTRAINT IF EXISTS sales_correction_status_check;
  ALTER TABLE public.sales
    ADD CONSTRAINT sales_correction_status_check
    CHECK (correction_status IN ('active', 'reversed', 'superseded'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.trader_bills
  ADD COLUMN IF NOT EXISTS correction_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reversal_posting_id TEXT,
  ADD COLUMN IF NOT EXISTS replacement_trader_bill_id TEXT;

DO $$
BEGIN
  ALTER TABLE public.trader_bills
    DROP CONSTRAINT IF EXISTS trader_bills_correction_status_check;
  ALTER TABLE public.trader_bills
    ADD CONSTRAINT trader_bills_correction_status_check
    CHECK (correction_status IN ('active', 'reversed', 'superseded'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Denormalized sale-line fields present in financial v2 payloads / local reports.
ALTER TABLE public.sale_lines
  ADD COLUMN IF NOT EXISTS farmer_id TEXT,
  ADD COLUMN IF NOT EXISTS farmer_short_code TEXT,
  ADD COLUMN IF NOT EXISTS farmer_display_name TEXT,
  ADD COLUMN IF NOT EXISTS vegetable_short_code TEXT,
  ADD COLUMN IF NOT EXISTS vegetable_display_name TEXT,
  ADD COLUMN IF NOT EXISTS package_type_id TEXT,
  ADD COLUMN IF NOT EXISTS package_type_short_code TEXT,
  ADD COLUMN IF NOT EXISTS package_type_display_name TEXT,
  ADD COLUMN IF NOT EXISTS net_weight_hundredths BIGINT,
  ADD COLUMN IF NOT EXISTS gross_weight_hundredths BIGINT,
  ADD COLUMN IF NOT EXISTS trader_pays_minor BIGINT,
  ADD COLUMN IF NOT EXISTS farmer_receives_minor BIGINT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_tenant_stall_status_business_date
  ON public.sales (tenant_id, stall_id, status, business_date, id);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_stall_correction_status
  ON public.sales (tenant_id, stall_id, correction_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_lines_tenant_stall_vegetable
  ON public.sale_lines (tenant_id, stall_id, vegetable_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_lines_tenant_stall_farmer
  ON public.sale_lines (tenant_id, stall_id, farmer_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_stall_sequence
  ON public.ledger_entries (tenant_id, stall_id, posting_sequence);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_stall_recorded
  ON public.payments (tenant_id, stall_id, recorded_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_tenant_stall_created
  ON public.payment_allocations (tenant_id, stall_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sale_correction_ops_tenant_stall_business_date
  ON public.sale_correction_operations (tenant_id, stall_id, business_date, recorded_at);

-- ---------------------------------------------------------------------------
-- Capability-aware financial reporting access
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.membership_has_capability(
  p_capabilities jsonb,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    jsonb_typeof(p_capabilities) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_capabilities) AS c(value)
      WHERE c.value = p_capability
    );
$$;

CREATE OR REPLACE FUNCTION public.has_active_financial_reporting_access(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = (SELECT auth.jwt() ->> 'sub')
      AND m.status = 'active'
      AND (
        m.access_role = 'owner'
        OR (
          m.access_role IN ('billing_staff', 'cashier')
          AND public.membership_has_capability(m.capabilities, 'reports.view_financial')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_export_access(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.identity_provider = 'clerk'
      AND m.external_subject = (SELECT auth.jwt() ->> 'sub')
      AND m.status = 'active'
      AND (
        m.access_role = 'owner'
        OR (
          m.access_role IN ('billing_staff', 'cashier')
          AND public.membership_has_capability(m.capabilities, 'data.export')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.membership_has_capability(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_has_capability(jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.has_active_financial_reporting_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_financial_reporting_access(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_financial_reporting_access(text) FROM anon;

REVOKE ALL ON FUNCTION public.has_active_export_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_export_access(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_export_access(text) FROM anon;

-- Re-bind financial table SELECT policies to capability-aware helper.
-- Sync metadata tables keep role-based has_active_reporting_access (freshness via RPC preferred).

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'farmers', 'traders', 'vegetables', 'package_types',
        'commission_band_sets', 'commission_bands', 'commission_policies',
        'sales', 'sale_lines', 'sale_line_package_weights', 'sale_farmer_allocations',
        'trader_bills', 'farmer_bills', 'farmer_bill_lines',
        'payments', 'payment_allocations',
        'sale_correction_operations', 'party_accounts',
        'ledger_postings', 'ledger_entries',
        'audit_events', 'print_jobs', 'print_attempts'
      )
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_active_financial_reporting_access(tenant_id))',
      pol.tablename || '_select_financial',
      pol.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Report export jobs (operational metadata only; no financial mutations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_export_jobs (
  tenant_id TEXT NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  report_type TEXT NOT NULL
    CHECK (report_type IN (
      'sales_summary',
      'sales_detail',
      'vegetable_sales',
      'farmer_activity',
      'buyer_activity',
      'commission',
      'payments',
      'outstanding',
      'vegetable_prices',
      'corrections_reversals'
    )),
  format TEXT NOT NULL CHECK (format IN ('csv', 'pdf')),
  status TEXT NOT NULL
    CHECK (status IN ('preparing', 'ready', 'failed', 'expired')),
  definition_version TEXT NOT NULL,
  snapshot_token TEXT NOT NULL,
  filter_fingerprint TEXT NOT NULL,
  normalized_filters_json JSONB NOT NULL,
  row_count INTEGER,
  content_sha256 TEXT,
  content_bytes BYTEA,
  content_type TEXT,
  byte_length INTEGER,
  default_file_name TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  created_by_subject TEXT NOT NULL,
  create_operation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stall_id, create_operation_id)
);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_tenant_created
  ON public.report_export_jobs (tenant_id, stall_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_tenant_status_expires
  ON public.report_export_jobs (tenant_id, stall_id, status, expires_at);

REVOKE ALL ON TABLE public.report_export_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.report_export_jobs TO authenticated;
ALTER TABLE public.report_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_export_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY report_export_jobs_select_own ON public.report_export_jobs
  FOR SELECT TO authenticated
  USING (
    public.has_active_export_access(tenant_id)
    AND created_by_subject = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY report_export_jobs_insert_own ON public.report_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_export_access(tenant_id)
    AND created_by_subject = (SELECT auth.jwt() ->> 'sub')
    AND stall_id = tenant_id
  );

CREATE POLICY report_export_jobs_update_own ON public.report_export_jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_active_export_access(tenant_id)
    AND created_by_subject = (SELECT auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    public.has_active_export_access(tenant_id)
    AND created_by_subject = (SELECT auth.jwt() ->> 'sub')
  );

-- ---------------------------------------------------------------------------
-- Freshness RPC for reporting members (owner visibility remains unchanged)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stall_reporting_freshness(p_tenant_id text)
RETURNS TABLE (
  last_host_contact_at timestamptz,
  last_applied_upload_group_id text,
  last_applied_upload_at timestamptz,
  committed_cloud_cursor bigint,
  committed_cloud_cursor_observed_at timestamptz,
  applied_max_posting_sequence bigint,
  has_any_applied_data boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stream public.sync_source_streams%ROWTYPE;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.has_active_financial_reporting_access(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_stream
  FROM public.sync_source_streams s
  WHERE s.tenant_id = p_tenant_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  last_host_contact_at := v_stream.updated_at;
  committed_cloud_cursor := COALESCE(v_stream.committed_cursor, 0);
  committed_cloud_cursor_observed_at := now();

  IF v_stream.source_stream_id IS NOT NULL THEN
    SELECT r.transaction_group_id, r.applied_at
      INTO last_applied_upload_group_id, last_applied_upload_at
    FROM public.sync_transaction_group_receipts r
    WHERE r.tenant_id = p_tenant_id
      AND r.source_stream_id = v_stream.source_stream_id
    ORDER BY r.max_sequence DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(e.posting_sequence), 0)
    INTO applied_max_posting_sequence
  FROM public.ledger_entries e
  WHERE e.tenant_id = p_tenant_id
    AND e.stall_id = p_tenant_id;

  has_any_applied_data :=
    committed_cloud_cursor > 0
    OR applied_max_posting_sequence > 0
    OR last_applied_upload_group_id IS NOT NULL;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stall_reporting_freshness(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stall_reporting_freshness(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stall_reporting_freshness(text) FROM anon;

-- ---------------------------------------------------------------------------
-- Capture reporting watermarks in one SECURITY DEFINER read (caller scoped)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_reporting_watermarks(p_tenant_id text, p_stall_id text)
RETURNS TABLE (
  max_posting_sequence bigint,
  max_allocation_created_at timestamptz,
  max_allocation_id text,
  max_payment_recorded_at timestamptz,
  max_payment_id text,
  committed_cloud_cursor bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alloc record;
  v_pay record;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.has_active_financial_reporting_access(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_stall_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(e.posting_sequence), 0)
    INTO max_posting_sequence
  FROM public.ledger_entries e
  WHERE e.tenant_id = p_tenant_id AND e.stall_id = p_stall_id;

  SELECT a.created_at, a.id
    INTO v_alloc
  FROM public.payment_allocations a
  WHERE a.tenant_id = p_tenant_id AND a.stall_id = p_stall_id
  ORDER BY a.created_at DESC NULLS LAST, a.id DESC
  LIMIT 1;

  max_allocation_created_at := COALESCE(v_alloc.created_at, '1970-01-01T00:00:00Z'::timestamptz);
  max_allocation_id := COALESCE(v_alloc.id, '');

  SELECT p.recorded_at, p.id
    INTO v_pay
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id AND p.stall_id = p_stall_id
  ORDER BY p.recorded_at DESC NULLS LAST, p.id DESC
  LIMIT 1;

  max_payment_recorded_at := COALESCE(v_pay.recorded_at, '1970-01-01T00:00:00Z'::timestamptz);
  max_payment_id := COALESCE(v_pay.id, '');

  SELECT COALESCE(MAX(s.committed_cursor), 0)
    INTO committed_cloud_cursor
  FROM public.sync_source_streams s
  WHERE s.tenant_id = p_tenant_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_reporting_watermarks(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_reporting_watermarks(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_reporting_watermarks(text, text) FROM anon;
