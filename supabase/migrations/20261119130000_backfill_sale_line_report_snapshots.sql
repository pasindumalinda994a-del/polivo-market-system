-- Phase 35 follow-up: backfill legacy sale_line report snapshots and harden
-- list_report_sale_lines catalog fallbacks so empty vegetable codes do not 500.

-- ---------------------------------------------------------------------------
-- Backfill denormalized vegetable snapshots from catalog
-- ---------------------------------------------------------------------------

UPDATE public.sale_lines sl
SET
  vegetable_short_code = COALESCE(NULLIF(sl.vegetable_short_code, ''), v.short_code),
  vegetable_display_name = COALESCE(NULLIF(sl.vegetable_display_name, ''), v.display_name)
FROM public.vegetables v
WHERE v.tenant_id = sl.tenant_id
  AND v.stall_id = sl.stall_id
  AND v.id = sl.vegetable_id
  AND (
    sl.vegetable_short_code IS NULL
    OR sl.vegetable_short_code = ''
    OR sl.vegetable_display_name IS NULL
    OR sl.vegetable_display_name = ''
  );

-- ---------------------------------------------------------------------------
-- Backfill farmer_id / farmer snapshots from sale_farmer_allocations
-- ---------------------------------------------------------------------------

UPDATE public.sale_lines sl
SET
  farmer_id = COALESCE(sl.farmer_id, sfa.farmer_id),
  farmer_short_code = COALESCE(NULLIF(sl.farmer_short_code, ''), f.short_code),
  farmer_display_name = COALESCE(NULLIF(sl.farmer_display_name, ''), f.display_name)
FROM public.sale_farmer_allocations sfa
INNER JOIN public.farmers f
  ON f.tenant_id = sfa.tenant_id
 AND f.stall_id = sfa.stall_id
 AND f.id = sfa.farmer_id
WHERE sfa.tenant_id = sl.tenant_id
  AND sfa.stall_id = sl.stall_id
  AND sfa.sale_line_id = sl.id
  AND (
    sl.farmer_id IS NULL
    OR sl.farmer_short_code IS NULL
    OR sl.farmer_short_code = ''
    OR sl.farmer_display_name IS NULL
    OR sl.farmer_display_name = ''
  );

-- ---------------------------------------------------------------------------
-- Backfill net_weight when missing and package weights exist
-- ---------------------------------------------------------------------------

UPDATE public.sale_lines sl
SET net_weight_hundredths = GREATEST(
  0,
  COALESCE(pw.gross_sum, 0) - COALESCE(sl.packaging_weight_hundredths, 0)
)
FROM (
  SELECT
    tenant_id,
    stall_id,
    sale_line_id,
    SUM(gross_weight_hundredths)::bigint AS gross_sum
  FROM public.sale_line_package_weights
  GROUP BY tenant_id, stall_id, sale_line_id
) pw
WHERE pw.tenant_id = sl.tenant_id
  AND pw.stall_id = sl.stall_id
  AND pw.sale_line_id = sl.id
  AND sl.net_weight_hundredths IS NULL;

-- ---------------------------------------------------------------------------
-- Harden list_report_sale_lines: catalog COALESCE, never prefer empty snapshots
-- ---------------------------------------------------------------------------

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
    COALESCE(sl.farmer_id, sfa.farmer_id),
    COALESCE(NULLIF(sl.farmer_display_name, ''), f.display_name),
    sl.vegetable_id,
    COALESCE(NULLIF(sl.vegetable_short_code, ''), v.short_code),
    COALESCE(NULLIF(sl.vegetable_display_name, ''), v.display_name),
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
  LEFT JOIN public.vegetables v
    ON v.tenant_id = sl.tenant_id AND v.id = sl.vegetable_id AND v.stall_id = sl.stall_id
  LEFT JOIN LATERAL (
    SELECT a.farmer_id
    FROM public.sale_farmer_allocations a
    WHERE a.tenant_id = sl.tenant_id
      AND a.stall_id = sl.stall_id
      AND a.sale_line_id = sl.id
    ORDER BY a.id
    LIMIT 1
  ) sfa ON TRUE
  LEFT JOIN public.farmers f
    ON f.tenant_id = sl.tenant_id
   AND f.stall_id = sl.stall_id
   AND f.id = COALESCE(sl.farmer_id, sfa.farmer_id)
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
    AND (
      p_farmer_id IS NULL
      OR COALESCE(sl.farmer_id, sfa.farmer_id) = p_farmer_id
    )
    AND (p_buyer_id IS NULL OR s.trader_id = p_buyer_id)
    AND (p_vegetable_id IS NULL OR sl.vegetable_id = p_vegetable_id)
  ORDER BY s.business_date ASC, sl.id ASC
  LIMIT p_limit
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_report_sale_lines(
  text, text, date, date, bigint, text, text, text, boolean, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_report_sale_lines(
  text, text, date, date, bigint, text, text, text, boolean, integer, integer
) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_report_sale_lines(
  text, text, date, date, bigint, text, text, text, boolean, integer, integer
) FROM anon;
