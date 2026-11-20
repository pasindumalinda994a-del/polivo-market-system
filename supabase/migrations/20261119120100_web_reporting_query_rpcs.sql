-- Phase 35: SECURITY DEFINER reporting query RPCs (user-context, capability-gated).

CREATE OR REPLACE FUNCTION public._reporting_require_scope(p_tenant_id text, p_stall_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.polivo_require_clerk_sub();
  IF NOT public.has_active_financial_reporting_access(p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_stall_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._reporting_require_scope(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._reporting_require_scope(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_report_sale_lines(
  p_tenant_id text,
  p_stall_id text,
  p_from_business_date date,
  p_to_business_date date,
  p_max_posting_sequence bigint,
  p_farmer_id text DEFAULT NULL,
  p_buyer_id text DEFAULT NULL,
  p_vegetable_id text DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  sale_line_id text,
  sale_id text,
  business_date date,
  recorded_at timestamptz,
  posting_sequence bigint,
  trader_id text,
  trader_display_name text,
  farmer_id text,
  farmer_display_name text,
  vegetable_id text,
  vegetable_code text,
  vegetable_display_name text,
  package_count bigint,
  net_weight_hundredths bigint,
  unit_price_per_kg_minor bigint,
  sale_amount_minor bigint,
  commission_amount_minor bigint,
  farmer_receives_minor bigint,
  correction_status text,
  trader_bill_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  RETURN QUERY
  SELECT
    sl.id,
    sl.sale_id,
    s.business_date,
    COALESCE(s.finalized_at, s.updated_at),
    (
      SELECT MIN(le.posting_sequence)
      FROM public.ledger_postings lp
      INNER JOIN public.ledger_entries le
        ON le.tenant_id = lp.tenant_id AND le.posting_id = lp.id AND le.stall_id = lp.stall_id
      WHERE lp.tenant_id = s.tenant_id AND lp.id = s.posting_id AND lp.stall_id = s.stall_id
    ),
    s.trader_id,
    COALESCE(t.display_name, ''),
    sl.farmer_id,
    f.display_name,
    sl.vegetable_id,
    COALESCE(sl.vegetable_short_code, ''),
    COALESCE(sl.vegetable_display_name, ''),
    (
      SELECT COUNT(*)::bigint
      FROM public.sale_line_package_weights pw
      WHERE pw.tenant_id = sl.tenant_id AND pw.stall_id = sl.stall_id AND pw.sale_line_id = sl.id
    ),
    COALESCE(sl.net_weight_hundredths, 0),
    COALESCE(sl.unit_price_per_kg_minor, 0),
    COALESCE(sl.line_sale_amount_minor, 0),
    COALESCE(sl.applied_commission_amount_minor, 0),
    COALESCE(sl.farmer_receives_minor, 0),
    COALESCE(s.correction_status, 'active'),
    tb.bill_number
  FROM public.sale_lines sl
  INNER JOIN public.sales s
    ON s.tenant_id = sl.tenant_id AND s.id = sl.sale_id AND s.stall_id = sl.stall_id
  INNER JOIN public.traders t
    ON t.tenant_id = s.tenant_id AND t.id = s.trader_id AND t.stall_id = s.stall_id
  LEFT JOIN public.farmers f
    ON f.tenant_id = sl.tenant_id AND f.id = sl.farmer_id AND f.stall_id = sl.stall_id
  LEFT JOIN public.trader_bills tb
    ON tb.tenant_id = s.tenant_id AND tb.sale_id = s.id AND tb.stall_id = s.stall_id AND tb.status = 'finalized'
  WHERE sl.tenant_id = p_tenant_id
    AND sl.stall_id = p_stall_id
    AND s.status = 'finalized'
    AND s.business_date >= p_from_business_date
    AND s.business_date <= p_to_business_date
    AND (
      s.posting_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.ledger_postings lp
        INNER JOIN public.ledger_entries le
          ON le.tenant_id = lp.tenant_id AND le.posting_id = lp.id AND le.stall_id = lp.stall_id
        WHERE lp.tenant_id = s.tenant_id AND lp.id = s.posting_id AND lp.stall_id = s.stall_id
          AND le.posting_sequence <= p_max_posting_sequence
      )
    )
    AND (NOT p_active_only OR COALESCE(s.correction_status, 'active') = 'active')
    AND (p_farmer_id IS NULL OR sl.farmer_id = p_farmer_id)
    AND (p_buyer_id IS NULL OR s.trader_id = p_buyer_id)
    AND (p_vegetable_id IS NULL OR sl.vegetable_id = p_vegetable_id)
  ORDER BY s.business_date ASC, sl.id ASC
  LIMIT p_limit
  OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_report_payments(
  p_tenant_id text,
  p_stall_id text,
  p_from_business_date date,
  p_to_business_date date,
  p_max_payment_recorded_at timestamptz,
  p_max_payment_id text,
  p_max_allocation_created_at timestamptz,
  p_max_allocation_id text,
  p_farmer_id text DEFAULT NULL,
  p_buyer_id text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_direction text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  payment_id text,
  business_date date,
  recorded_at timestamptz,
  party_kind text,
  farmer_id text,
  farmer_display_name text,
  trader_id text,
  trader_display_name text,
  direction text,
  method text,
  amount_minor bigint,
  status text,
  reference_number text,
  allocated_total_minor bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alloc_id text := COALESCE(NULLIF(p_max_allocation_id, ''), repeat('~', 128));
  v_pay_id text := COALESCE(NULLIF(p_max_payment_id, ''), repeat('~', 128));
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  RETURN QUERY
  SELECT
    p.id,
    p.business_date,
    p.recorded_at,
    CASE WHEN p.farmer_id IS NOT NULL THEN 'farmer' ELSE 'trader' END,
    p.farmer_id,
    f.display_name,
    p.trader_id,
    t.display_name,
    p.direction,
    p.method,
    p.amount_minor,
    p.status,
    p.reference_number,
    COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = p.tenant_id
        AND pa.stall_id = p.stall_id
        AND pa.payment_id = p.id
        AND pa.status = 'active'
        AND (
          pa.created_at < p_max_allocation_created_at
          OR (pa.created_at = p_max_allocation_created_at AND pa.id <= v_alloc_id)
        )
        AND (pa.released_at IS NULL OR pa.released_at > p_max_allocation_created_at)
    ), 0)::bigint
  FROM public.payments p
  LEFT JOIN public.farmers f
    ON f.tenant_id = p.tenant_id AND f.id = p.farmer_id AND f.stall_id = p.stall_id
  LEFT JOIN public.traders t
    ON t.tenant_id = p.tenant_id AND t.id = p.trader_id AND t.stall_id = p.stall_id
  WHERE p.tenant_id = p_tenant_id
    AND p.stall_id = p_stall_id
    AND p.business_date >= p_from_business_date
    AND p.business_date <= p_to_business_date
    AND (
      p.recorded_at < p_max_payment_recorded_at
      OR (p.recorded_at = p_max_payment_recorded_at AND p.id <= v_pay_id)
    )
    AND (p_farmer_id IS NULL OR p.farmer_id = p_farmer_id)
    AND (p_buyer_id IS NULL OR p.trader_id = p_buyer_id)
    AND (p_payment_method IS NULL OR p.method = p_payment_method)
    AND (p_payment_direction IS NULL OR p.direction = p_payment_direction)
    AND (
      p_payment_status IS NULL
      OR p_payment_status = 'all'
      OR p.status = p_payment_status
    )
  ORDER BY p.business_date ASC, p.id ASC
  LIMIT p_limit
  OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_report_corrections(
  p_tenant_id text,
  p_stall_id text,
  p_from_business_date date,
  p_to_business_date date,
  p_max_posting_sequence bigint,
  p_buyer_id text DEFAULT NULL,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  operation_id text,
  business_date date,
  recorded_at timestamptz,
  action text,
  source_sale_id text,
  replacement_sale_id text,
  reversal_posting_id text,
  trader_id text,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  RETURN QUERY
  SELECT
    sco.id,
    sco.business_date,
    sco.recorded_at,
    CASE WHEN sco.replacement_sale_id IS NULL THEN 'reversed' ELSE 'corrected' END,
    sco.source_sale_id,
    sco.replacement_sale_id,
    sco.reversal_posting_id,
    s.trader_id,
    sco.reason
  FROM public.sale_correction_operations sco
  LEFT JOIN public.sales s
    ON s.tenant_id = sco.tenant_id AND s.id = sco.source_sale_id AND s.stall_id = sco.stall_id
  WHERE sco.tenant_id = p_tenant_id
    AND sco.stall_id = p_stall_id
    AND sco.business_date >= p_from_business_date
    AND sco.business_date <= p_to_business_date
    AND (
      sco.reversal_posting_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.ledger_entries le
        WHERE le.tenant_id = sco.tenant_id
          AND le.posting_id = sco.reversal_posting_id
          AND le.stall_id = sco.stall_id
          AND le.posting_sequence <= p_max_posting_sequence
      )
    )
    AND (
      p_buyer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.sales xs
        WHERE xs.tenant_id = sco.tenant_id AND xs.id = sco.source_sale_id AND xs.stall_id = sco.stall_id
          AND xs.trader_id = p_buyer_id
      )
    )
  ORDER BY sco.business_date ASC, sco.id ASC
  LIMIT p_limit
  OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_account_balance_at_watermark(
  p_tenant_id text,
  p_stall_id text,
  p_party_kind text,
  p_party_id text,
  p_max_posting_sequence bigint,
  p_as_of_business_date date DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_balance bigint;
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  IF p_as_of_business_date IS NULL THEN
    SELECT COALESCE(SUM(e.amount_minor), 0) INTO v_balance
    FROM public.ledger_entries e
    WHERE e.tenant_id = p_tenant_id
      AND e.stall_id = p_stall_id
      AND e.party_kind = p_party_kind
      AND e.party_id = p_party_id
      AND e.posting_sequence <= p_max_posting_sequence;
  ELSE
    SELECT COALESCE(SUM(e.amount_minor), 0) INTO v_balance
    FROM public.ledger_entries e
    INNER JOIN public.ledger_postings p
      ON p.tenant_id = e.tenant_id AND p.id = e.posting_id AND p.stall_id = e.stall_id
    WHERE e.tenant_id = p_tenant_id
      AND e.stall_id = p_stall_id
      AND e.party_kind = p_party_kind
      AND e.party_id = p_party_id
      AND e.posting_sequence <= p_max_posting_sequence
      AND p.business_date <= p_as_of_business_date;
  END IF;
  RETURN COALESCE(v_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_unapplied_payments_at_watermark(
  p_tenant_id text,
  p_stall_id text,
  p_party_kind text,
  p_party_id text,
  p_max_payment_recorded_at timestamptz,
  p_max_payment_id text,
  p_max_allocation_created_at timestamptz,
  p_max_allocation_id text,
  p_as_of_business_date date DEFAULT NULL
)
RETURNS TABLE (
  payment_id text,
  reference_number text,
  business_date date,
  amount_minor bigint,
  allocated_active_minor bigint,
  unapplied_amount_minor bigint,
  method text,
  physical_handover_date date,
  cheque_number text,
  recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pay record;
  v_alloc_id text := COALESCE(NULLIF(p_max_allocation_id, ''), repeat('~', 128));
  v_pay_id text := COALESCE(NULLIF(p_max_payment_id, ''), repeat('~', 128));
  v_allocated bigint;
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  FOR v_pay IN
    SELECT p.id, p.reference_number, p.business_date, p.amount_minor, p.method,
           p.physical_handover_date, p.cheque_number, p.recorded_at
    FROM public.payments p
    WHERE p.tenant_id = p_tenant_id
      AND p.stall_id = p_stall_id
      AND (
        (p_party_kind = 'farmer' AND p.farmer_id = p_party_id)
        OR (p_party_kind = 'trader' AND p.trader_id = p_party_id)
      )
      AND p.status = 'posted'
      AND p.reverses_payment_id IS NULL
      AND p.reversed_by_payment_id IS NULL
      AND (
        p.recorded_at < p_max_payment_recorded_at
        OR (p.recorded_at = p_max_payment_recorded_at AND p.id <= v_pay_id)
      )
      AND (p_as_of_business_date IS NULL OR p.business_date <= p_as_of_business_date)
    ORDER BY p.business_date ASC, p.recorded_at ASC, p.id ASC
  LOOP
    SELECT COALESCE(SUM(pa.applied_amount_minor), 0) INTO v_allocated
    FROM public.payment_allocations pa
    WHERE pa.tenant_id = p_tenant_id
      AND pa.stall_id = p_stall_id
      AND pa.payment_id = v_pay.id
      AND pa.status = 'active'
      AND (
        pa.created_at < p_max_allocation_created_at
        OR (pa.created_at = p_max_allocation_created_at AND pa.id <= v_alloc_id)
      );
    IF v_pay.amount_minor - v_allocated > 0 THEN
      payment_id := v_pay.id;
      reference_number := v_pay.reference_number;
      business_date := v_pay.business_date;
      amount_minor := v_pay.amount_minor;
      allocated_active_minor := v_allocated;
      unapplied_amount_minor := v_pay.amount_minor - v_allocated;
      method := v_pay.method;
      physical_handover_date := v_pay.physical_handover_date;
      cheque_number := v_pay.cheque_number;
      recorded_at := v_pay.recorded_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_eligible_trader_bill_obligations(
  p_tenant_id text,
  p_stall_id text,
  p_trader_id text
)
RETURNS TABLE (
  obligation_kind text,
  target_id text,
  label text,
  business_date date,
  effective_amount_minor bigint,
  active_allocated_minor bigint,
  remaining_minor bigint,
  document_kind text,
  document_id text,
  document_number text,
  farmer_bill_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  RETURN QUERY
  SELECT
    'trader_bill',
    tb.id,
    format('Buyer bill %s', tb.bill_number),
    tb.business_date,
    tb.total_amount_minor,
    COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = tb.tenant_id
        AND pa.stall_id = tb.stall_id
        AND pa.obligation_kind = 'trader_bill'
        AND pa.status = 'active'
        AND pa.trader_bill_id = tb.id
    ), 0)::bigint,
    tb.total_amount_minor - COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = tb.tenant_id
        AND pa.stall_id = tb.stall_id
        AND pa.obligation_kind = 'trader_bill'
        AND pa.status = 'active'
        AND pa.trader_bill_id = tb.id
    ), 0)::bigint,
    'trader_bill',
    tb.id,
    tb.bill_number,
    NULL::text
  FROM public.trader_bills tb
  WHERE tb.tenant_id = p_tenant_id
    AND tb.stall_id = p_stall_id
    AND tb.trader_id = p_trader_id
    AND tb.status = 'finalized'
    AND tb.correction_status = 'active'
    AND tb.total_amount_minor > COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = tb.tenant_id
        AND pa.stall_id = tb.stall_id
        AND pa.obligation_kind = 'trader_bill'
        AND pa.status = 'active'
        AND pa.trader_bill_id = tb.id
    ), 0)
  ORDER BY tb.business_date ASC, tb.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_eligible_farmer_sale_line_obligations(
  p_tenant_id text,
  p_stall_id text,
  p_farmer_id text
)
RETURNS TABLE (
  obligation_kind text,
  target_id text,
  label text,
  business_date date,
  effective_amount_minor bigint,
  active_allocated_minor bigint,
  remaining_minor bigint,
  document_kind text,
  document_id text,
  document_number text,
  farmer_bill_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  RETURN QUERY
  SELECT
    'farmer_sale_line',
    sl.id,
    CASE
      WHEN fb.bill_number IS NOT NULL THEN format('Sale line on bill %s', fb.bill_number)
      ELSE 'Unbilled sale line'
    END,
    s.business_date,
    COALESCE(sl.farmer_receives_minor, 0),
    COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = sl.tenant_id
        AND pa.stall_id = sl.stall_id
        AND pa.obligation_kind = 'farmer_sale_line'
        AND pa.status = 'active'
        AND pa.sale_line_id = sl.id
    ), 0)::bigint,
    COALESCE(sl.farmer_receives_minor, 0) - COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = sl.tenant_id
        AND pa.stall_id = sl.stall_id
        AND pa.obligation_kind = 'farmer_sale_line'
        AND pa.status = 'active'
        AND pa.sale_line_id = sl.id
    ), 0)::bigint,
    CASE WHEN fb.id IS NULL THEN 'sale_line' ELSE 'farmer_bill' END,
    COALESCE(fb.id, sl.id),
    fb.bill_number,
    fb.id
  FROM public.sale_lines sl
  INNER JOIN public.sales s
    ON s.tenant_id = sl.tenant_id AND s.id = sl.sale_id AND s.stall_id = sl.stall_id
  LEFT JOIN public.farmer_bill_lines fbl
    ON fbl.tenant_id = sl.tenant_id AND fbl.sale_line_id = sl.id AND fbl.stall_id = sl.stall_id
  LEFT JOIN public.farmer_bills fb
    ON fb.tenant_id = fbl.tenant_id AND fb.id = fbl.farmer_bill_id AND fb.stall_id = fbl.stall_id
  WHERE sl.tenant_id = p_tenant_id
    AND sl.stall_id = p_stall_id
    AND sl.farmer_id = p_farmer_id
    AND s.status = 'finalized'
    AND s.correction_status = 'active'
    AND COALESCE(sl.farmer_receives_minor, 0) > 0
    AND COALESCE(sl.farmer_receives_minor, 0) > COALESCE((
      SELECT SUM(pa.applied_amount_minor)
      FROM public.payment_allocations pa
      WHERE pa.tenant_id = sl.tenant_id
        AND pa.stall_id = sl.stall_id
        AND pa.obligation_kind = 'farmer_sale_line'
        AND pa.status = 'active'
        AND pa.sale_line_id = sl.id
    ), 0)
  ORDER BY s.business_date ASC, sl.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_statement_movements_page(
  p_tenant_id text,
  p_stall_id text,
  p_party_kind text,
  p_party_id text,
  p_from_business_date date,
  p_to_business_date date,
  p_max_posting_sequence bigint,
  p_limit integer,
  p_after_business_date date DEFAULT NULL,
  p_after_posting_sequence bigint DEFAULT NULL,
  p_after_entry_id text DEFAULT NULL,
  p_movement_search text DEFAULT NULL,
  p_source_type_filter text DEFAULT NULL
)
RETURNS TABLE (
  entry_id text,
  posting_id text,
  business_date date,
  recorded_at timestamptz,
  posting_sequence bigint,
  source_type text,
  source_id text,
  financial_event_type text,
  description text,
  amount_minor bigint,
  reverses_entry_id text,
  reversed_by_entry_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := p_limit + 1;
  v_search text;
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  v_search := CASE
    WHEN p_movement_search IS NULL OR length(trim(p_movement_search)) = 0 THEN NULL
    ELSE '%' || replace(replace(trim(p_movement_search), '%', ''), '_', '') || '%'
  END;
  RETURN QUERY
  SELECT
    e.id,
    e.posting_id,
    p.business_date,
    p.recorded_at,
    e.posting_sequence,
    p.source_type,
    p.source_id,
    p.financial_event_type,
    p.description,
    e.amount_minor,
    e.reverses_entry_id,
    rev.id
  FROM public.ledger_entries e
  INNER JOIN public.ledger_postings p
    ON p.tenant_id = e.tenant_id AND p.id = e.posting_id AND p.stall_id = e.stall_id
  LEFT JOIN public.ledger_entries rev
    ON rev.tenant_id = e.tenant_id AND rev.reverses_entry_id = e.id AND rev.stall_id = e.stall_id
  WHERE e.tenant_id = p_tenant_id
    AND e.stall_id = p_stall_id
    AND e.party_kind = p_party_kind
    AND e.party_id = p_party_id
    AND e.posting_sequence <= p_max_posting_sequence
    AND p.business_date >= p_from_business_date
    AND p.business_date <= p_to_business_date
    AND (
      p_after_business_date IS NULL
      OR p_after_posting_sequence IS NULL
      OR p_after_entry_id IS NULL
      OR (
        p.business_date > p_after_business_date
        OR (p.business_date = p_after_business_date AND e.posting_sequence > p_after_posting_sequence)
        OR (
          p.business_date = p_after_business_date
          AND e.posting_sequence = p_after_posting_sequence
          AND e.id > p_after_entry_id
        )
      )
    )
    AND (p_source_type_filter IS NULL OR p.source_type = p_source_type_filter)
    AND (
      v_search IS NULL
      OR COALESCE(p.description, '') LIKE v_search
      OR p.source_id LIKE v_search
      OR p.source_type LIKE v_search
    )
  ORDER BY p.business_date ASC, e.posting_sequence ASC, e.id ASC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_statement_opening_balance(
  p_tenant_id text,
  p_stall_id text,
  p_party_kind text,
  p_party_id text,
  p_from_business_date date,
  p_max_posting_sequence bigint
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_balance bigint;
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  SELECT COALESCE(SUM(e.amount_minor), 0) INTO v_balance
  FROM public.ledger_entries e
  INNER JOIN public.ledger_postings p
    ON p.tenant_id = e.tenant_id AND p.id = e.posting_id AND p.stall_id = e.stall_id
  WHERE e.tenant_id = p_tenant_id
    AND e.stall_id = p_stall_id
    AND e.party_kind = p_party_kind
    AND e.party_id = p_party_id
    AND e.posting_sequence <= p_max_posting_sequence
    AND p.business_date < p_from_business_date;
  RETURN COALESCE(v_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_balance_before_statement_page(
  p_tenant_id text,
  p_stall_id text,
  p_party_kind text,
  p_party_id text,
  p_from_business_date date,
  p_to_business_date date,
  p_max_posting_sequence bigint,
  p_after_business_date date DEFAULT NULL,
  p_after_posting_sequence bigint DEFAULT NULL,
  p_after_entry_id text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_balance bigint;
BEGIN
  PERFORM public._reporting_require_scope(p_tenant_id, p_stall_id);
  IF p_after_business_date IS NULL OR p_after_posting_sequence IS NULL OR p_after_entry_id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT COALESCE(SUM(e.amount_minor), 0) INTO v_balance
  FROM public.ledger_entries e
  INNER JOIN public.ledger_postings p
    ON p.tenant_id = e.tenant_id AND p.id = e.posting_id AND p.stall_id = e.stall_id
  WHERE e.tenant_id = p_tenant_id
    AND e.stall_id = p_stall_id
    AND e.party_kind = p_party_kind
    AND e.party_id = p_party_id
    AND e.posting_sequence <= p_max_posting_sequence
    AND p.business_date >= p_from_business_date
    AND p.business_date <= p_to_business_date
    AND (
      p.business_date < p_after_business_date
      OR (p.business_date = p_after_business_date AND e.posting_sequence < p_after_posting_sequence)
      OR (
        p.business_date = p_after_business_date
        AND e.posting_sequence = p_after_posting_sequence
        AND e.id <= p_after_entry_id
      )
    );
  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_report_sale_lines(text, text, date, date, bigint, text, text, text, boolean, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_report_payments(text, text, date, date, timestamptz, text, timestamptz, text, text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_report_corrections(text, text, date, date, bigint, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_account_balance_at_watermark(text, text, text, text, bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_unapplied_payments_at_watermark(text, text, text, text, timestamptz, text, timestamptz, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_eligible_trader_bill_obligations(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_eligible_farmer_sale_line_obligations(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_statement_movements_page(text, text, text, text, date, date, bigint, integer, date, bigint, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_statement_opening_balance(text, text, text, text, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_balance_before_statement_page(text, text, text, text, date, date, bigint, date, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_report_sale_lines(text, text, date, date, bigint, text, text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_report_payments(text, text, date, date, timestamptz, text, timestamptz, text, text, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_report_corrections(text, text, date, date, bigint, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_account_balance_at_watermark(text, text, text, text, bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_unapplied_payments_at_watermark(text, text, text, text, timestamptz, text, timestamptz, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_eligible_trader_bill_obligations(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_eligible_farmer_sale_line_obligations(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_statement_movements_page(text, text, text, text, date, date, bigint, integer, date, bigint, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_statement_opening_balance(text, text, text, text, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_balance_before_statement_page(text, text, text, text, date, date, bigint, date, bigint, text) TO authenticated;