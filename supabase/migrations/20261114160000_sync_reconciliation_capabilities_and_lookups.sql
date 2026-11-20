-- Phase 34: sync.* capability allowlist + bounded host/owner reconciliation lookups.
-- Keep capability list in sync with packages/domain/src/permissions.ts PERMISSION_CAPABILITIES.

CREATE OR REPLACE FUNCTION public.polivo_capabilities_are_known(p_capabilities jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    jsonb_typeof(p_capabilities) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_capabilities) AS c(value)
      WHERE c.value NOT IN (
        'bills.create',
        'bills.edit_draft',
        'bills.finalize',
        'bills.change_selling_price',
        'bills.change_commission',
        'bills.add_change_deductions',
        'bills.correct_finalized',
        'bills.cancel_finalized',
        'payments.receive_trader',
        'payments.pay_farmer',
        'payments.record_cheque',
        'payments.reverse',
        'reports.view_financial',
        'parties.register_edit',
        'catalog.manage',
        'commission.manage',
        'accounts.view',
        'accounts.opening_prepare',
        'accounts.opening_post',
        'accounts.opening_correct',
        'documents.print',
        'documents.reprint',
        'inventory.manage_arrivals',
        'inventory.adjust',
        'data.export',
        'staff.manage',
        'settings.manage',
        'backups.restore',
        'sync.view',
        'sync.reconcile',
        'sync.retry',
        'sync.recover',
        'sync.export_diagnostics'
      )
    );
$$;

-- Host-scoped stream progress (privileged caller after possession verify).
CREATE OR REPLACE FUNCTION public.host_get_sync_stream_progress(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version bigint,
  p_source_stream_id text
)
RETURNS TABLE (
  source_stream_id text,
  stream_generation integer,
  committed_cursor bigint,
  stall_id text,
  device_id text,
  observed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR SHARE;

  IF NOT FOUND
     OR v_device.role <> 'host'
     OR v_device.enrollment_state <> 'activated'
     OR v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    RAISE EXCEPTION 'HOST_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_stream_id IS DISTINCT FROM p_installation_id THEN
    RAISE EXCEPTION 'STREAM_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- Phase 31 stall binding: stall_id equals tenant_id for the activated host stream.
  RETURN QUERY
  SELECT
    s.source_stream_id,
    s.stream_generation,
    s.committed_cursor,
    s.stall_id,
    s.device_id,
    now()
  FROM public.sync_source_streams s
  WHERE s.tenant_id = p_tenant_id
    AND s.source_stream_id = p_source_stream_id
    AND s.stall_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_get_sync_stream_progress(text, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_get_sync_stream_progress(text, text, text, bigint, text) TO service_role;

-- Bounded receipt lookup by group ids or sequence range.
CREATE OR REPLACE FUNCTION public.host_lookup_sync_receipts(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version bigint,
  p_source_stream_id text,
  p_stream_generation integer,
  p_group_ids jsonb DEFAULT NULL,
  p_from_sequence bigint DEFAULT NULL,
  p_to_sequence bigint DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  transaction_group_id text,
  min_sequence bigint,
  max_sequence bigint,
  event_ids jsonb,
  event_payload_hashes jsonb,
  applied_at timestamptz,
  stream_generation integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR SHARE;

  IF NOT FOUND
     OR v_device.role <> 'host'
     OR v_device.enrollment_state <> 'activated'
     OR v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    RAISE EXCEPTION 'HOST_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_stream_id IS DISTINCT FROM p_installation_id THEN
    RAISE EXCEPTION 'STREAM_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    r.transaction_group_id,
    r.min_sequence,
    r.max_sequence,
    r.event_ids,
    COALESCE(
      (
        SELECT jsonb_object_agg(e.event_id, e.payload_hash)
        FROM public.sync_received_events e
        WHERE e.tenant_id = r.tenant_id
          AND e.source_stream_id = r.source_stream_id
          AND e.transaction_group_id = r.transaction_group_id
          AND e.payload_hash IS NOT NULL
      ),
      '{}'::jsonb
    ) AS event_payload_hashes,
    r.applied_at,
    r.stream_generation
  FROM public.sync_transaction_group_receipts r
  WHERE r.tenant_id = p_tenant_id
    AND r.source_stream_id = p_source_stream_id
    AND r.stall_id = p_tenant_id
    AND r.stream_generation = p_stream_generation
    AND (
      p_group_ids IS NULL
      OR r.transaction_group_id IN (
        SELECT jsonb_array_elements_text(p_group_ids)
      )
    )
    AND (p_from_sequence IS NULL OR r.max_sequence >= p_from_sequence)
    AND (p_to_sequence IS NULL OR r.min_sequence <= p_to_sequence)
  ORDER BY r.min_sequence ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.host_lookup_sync_receipts(text, text, text, bigint, text, integer, jsonb, bigint, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_lookup_sync_receipts(text, text, text, bigint, text, integer, jsonb, bigint, bigint, integer) TO service_role;

-- Owner read-only cloud visibility (host-reported local tail is never invented here).
CREATE OR REPLACE FUNCTION public.get_stall_sync_cloud_visibility(p_tenant_id text)
RETURNS TABLE (
  last_host_contact_at timestamptz,
  last_applied_upload_group_id text,
  last_applied_upload_at timestamptz,
  committed_cloud_cursor bigint,
  committed_cloud_cursor_observed_at timestamptz,
  pending_published_config_revision bigint,
  last_config_application_ack_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stream public.sync_source_streams%ROWTYPE;
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.is_active_tenant_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_stream
  FROM public.sync_source_streams s
  WHERE s.tenant_id = p_tenant_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  last_host_contact_at := v_stream.updated_at;
  committed_cloud_cursor := v_stream.committed_cursor;
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

  SELECT p.revision INTO pending_published_config_revision
  FROM public.cloud_config_publications p
  WHERE p.tenant_id = p_tenant_id
    AND p.domain = 'access'
  ORDER BY p.revision DESC
  LIMIT 1;

  SELECT a.server_receipt_at INTO last_config_application_ack_at
  FROM public.cloud_config_host_acks a
  WHERE a.tenant_id = p_tenant_id
    AND a.domain = 'access'
    AND a.result IN ('applied', 'already_applied')
  ORDER BY a.applied_revision DESC, a.server_receipt_at DESC
  LIMIT 1;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stall_sync_cloud_visibility(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stall_sync_cloud_visibility(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stall_sync_cloud_visibility(text) FROM anon;

-- Exact projected fact counts/balances for a stream prefix (no payload dump).
CREATE OR REPLACE FUNCTION public.host_get_sync_fact_summary(
  p_tenant_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version bigint,
  p_source_stream_id text,
  p_through_sequence bigint
)
RETURNS TABLE (
  sales_count bigint,
  payments_count bigint,
  ledger_entries_count bigint,
  allocation_count bigint,
  ledger_balance_sum_minor numeric,
  observed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_device
  FROM public.tenant_devices d
  WHERE d.tenant_id = p_tenant_id AND d.device_id = p_device_id
  FOR SHARE;

  IF NOT FOUND
     OR v_device.role <> 'host'
     OR v_device.enrollment_state <> 'activated'
     OR v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    RAISE EXCEPTION 'HOST_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF p_source_stream_id IS DISTINCT FROM p_installation_id THEN
    RAISE EXCEPTION 'STREAM_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM public.sales s WHERE s.tenant_id = p_tenant_id AND s.stall_id = p_tenant_id),
    (SELECT COUNT(*)::bigint FROM public.payments p WHERE p.tenant_id = p_tenant_id AND p.stall_id = p_tenant_id),
    (SELECT COUNT(*)::bigint FROM public.ledger_entries e WHERE e.tenant_id = p_tenant_id),
    (SELECT COUNT(*)::bigint FROM public.payment_allocations a WHERE a.tenant_id = p_tenant_id),
    (SELECT COALESCE(SUM(e.amount_minor), 0)::numeric FROM public.ledger_entries e WHERE e.tenant_id = p_tenant_id),
    now();
END;
$$;

REVOKE ALL ON FUNCTION public.host_get_sync_fact_summary(text, text, text, bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_get_sync_fact_summary(text, text, text, bigint, text, bigint) TO service_role;
