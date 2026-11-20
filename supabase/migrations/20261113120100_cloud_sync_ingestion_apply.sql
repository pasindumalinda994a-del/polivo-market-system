-- Phase 31: durable rate-limit helper + transactional sync group apply RPC.
-- Privileged server only. Explicit search_path. No dynamic SQL from payloads.

CREATE OR REPLACE FUNCTION public.check_sync_ingest_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer, request_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_row public.sync_ingest_rate_limits%ROWTYPE;
  v_window_start timestamptz;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RAISE EXCEPTION 'RATE_LIMIT_INVALID_BUCKET';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_max_requests IS NULL OR p_max_requests < 1 THEN
    RAISE EXCEPTION 'RATE_LIMIT_INVALID_ARGS';
  END IF;

  SELECT * INTO v_row
  FROM public.sync_ingest_rate_limits
  WHERE bucket_key = p_bucket_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sync_ingest_rate_limits (bucket_key, window_start, request_count, updated_at)
    VALUES (p_bucket_key, v_now, 1, v_now);
    allowed := true;
    retry_after_seconds := 0;
    request_count := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.window_start + make_interval(secs => p_window_seconds) <= v_now THEN
    UPDATE public.sync_ingest_rate_limits
    SET window_start = v_now, request_count = 1, updated_at = v_now
    WHERE bucket_key = p_bucket_key;
    allowed := true;
    retry_after_seconds := 0;
    request_count := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.request_count >= p_max_requests THEN
    allowed := false;
    retry_after_seconds := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_row.window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
    request_count := v_row.request_count;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.sync_ingest_rate_limits AS rl
  SET request_count = rl.request_count + 1, updated_at = v_now
  WHERE rl.bucket_key = p_bucket_key
  RETURNING rl.request_count INTO request_count;

  allowed := true;
  retry_after_seconds := 0;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_sync_ingest_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_sync_ingest_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_sync_ingest_rate_limit(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.polivo_sync_upsert_ledger(
  p_tenant_id text,
  p_stall_id text,
  p_posting jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry jsonb;
BEGIN
  IF p_posting IS NULL OR p_posting = 'null'::jsonb THEN
    RETURN;
  END IF;

  INSERT INTO public.ledger_postings (
    tenant_id, id, stall_id, source_type, source_id, financial_event_type,
    event_sequence, business_date, recorded_at, actor_staff_id, description, currency
  ) VALUES (
    p_tenant_id,
    p_posting->>'id',
    p_stall_id,
    p_posting->>'sourceType',
    p_posting->>'sourceId',
    p_posting->>'financialEventType',
    (p_posting->>'eventSequence')::integer,
    (p_posting->>'businessDate')::date,
    (p_posting->>'recordedAt')::timestamptz,
    NULLIF(p_posting->>'actorStaffId', ''),
    NULLIF(p_posting->>'description', ''),
    COALESCE(p_posting->>'currency', 'LKR')
  )
  ON CONFLICT (tenant_id, id) DO NOTHING;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(p_posting->'entries', '[]'::jsonb))
  LOOP
    INSERT INTO public.ledger_entries (
      tenant_id, id, stall_id, posting_id, party_kind, party_id,
      amount_minor, currency, posting_sequence, reverses_entry_id
    ) VALUES (
      p_tenant_id,
      v_entry->>'id',
      p_stall_id,
      p_posting->>'id',
      v_entry->>'partyKind',
      v_entry->>'partyId',
      (v_entry->>'amountMinor')::bigint,
      COALESCE(v_entry->>'currency', 'LKR'),
      (v_entry->>'postingSequence')::bigint,
      NULLIF(v_entry->>'reversesEntryId', '')
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.polivo_sync_upsert_ledger(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.polivo_sync_upsert_ledger(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polivo_sync_upsert_ledger(text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.polivo_sync_apply_event(
  p_tenant_id text,
  p_stall_id text,
  p_event jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := p_event->>'eventType';
  v_version text := p_event->>'eventSchemaVersion';
  v_payload jsonb := p_event->'payload';
  v_farmer jsonb;
  v_buyer jsonb;
  v_veg jsonb;
  v_pkg jsonb;
  v_sale jsonb;
  v_line jsonb;
  v_pw jsonb;
  v_fa jsonb;
  v_bill jsonb;
  v_payment jsonb;
  v_alloc jsonb;
  v_fbl jsonb;
  v_summary jsonb;
  v_party jsonb;
  v_active jsonb;
  v_band jsonb;
  v_job jsonb;
  v_attempt jsonb;
BEGIN
  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'VALIDATION_FAILURE:payload_required';
  END IF;

  -- Reject cross-stall scope in nested payload when present.
  IF v_payload ? 'stallId' AND (v_payload->>'stallId') IS DISTINCT FROM p_stall_id THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILURE:cross_stall_payload';
  END IF;
  IF v_payload ? 'tenantId' AND (v_payload->>'tenantId') IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILURE:cross_tenant_payload';
  END IF;
  IF (v_payload->'summary') ? 'stallId'
     AND (v_payload->'summary'->>'stallId') IS DISTINCT FROM p_stall_id THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILURE:cross_stall_summary';
  END IF;

  IF v_type IN ('polivo.farmer.created', 'polivo.farmer.updated', 'polivo.farmer.status_changed') THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_farmer := v_payload->'farmer';
    INSERT INTO public.farmers (
      tenant_id, id, stall_id, short_code, display_name, is_active,
      revision, contact_number, locality, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_farmer->>'id',
      p_stall_id,
      v_farmer->>'shortCode',
      v_farmer->>'displayName',
      COALESCE((v_farmer->>'isActive')::boolean, true),
      COALESCE((v_farmer->>'revision')::integer, 1),
      NULLIF(v_farmer->>'contactNumber', ''),
      NULLIF(v_farmer->>'locality', ''),
      (v_farmer->>'createdAt')::timestamptz,
      (v_farmer->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      short_code = EXCLUDED.short_code,
      display_name = EXCLUDED.display_name,
      is_active = EXCLUDED.is_active,
      revision = EXCLUDED.revision,
      contact_number = EXCLUDED.contact_number,
      locality = EXCLUDED.locality,
      updated_at = EXCLUDED.updated_at
    WHERE public.farmers.revision <= EXCLUDED.revision;
    RETURN;
  END IF;

  IF v_type IN ('polivo.buyer.created', 'polivo.buyer.updated', 'polivo.buyer.status_changed') THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_buyer := COALESCE(v_payload->'buyer', v_payload->'trader');
    INSERT INTO public.traders (
      tenant_id, id, stall_id, short_code, display_name, is_active,
      revision, contact_number, locality, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_buyer->>'id',
      p_stall_id,
      v_buyer->>'shortCode',
      v_buyer->>'displayName',
      COALESCE((v_buyer->>'isActive')::boolean, true),
      COALESCE((v_buyer->>'revision')::integer, 1),
      NULLIF(v_buyer->>'contactNumber', ''),
      NULLIF(v_buyer->>'locality', ''),
      (v_buyer->>'createdAt')::timestamptz,
      (v_buyer->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      short_code = EXCLUDED.short_code,
      display_name = EXCLUDED.display_name,
      is_active = EXCLUDED.is_active,
      revision = EXCLUDED.revision,
      contact_number = EXCLUDED.contact_number,
      locality = EXCLUDED.locality,
      updated_at = EXCLUDED.updated_at
    WHERE public.traders.revision <= EXCLUDED.revision;
    RETURN;
  END IF;

  IF v_type IN ('polivo.vegetable.created', 'polivo.vegetable.updated', 'polivo.vegetable.status_changed') THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_veg := v_payload->'vegetable';
    INSERT INTO public.vegetables (
      tenant_id, id, stall_id, short_code, display_name, is_active, revision, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_veg->>'id',
      p_stall_id,
      v_veg->>'shortCode',
      v_veg->>'displayName',
      COALESCE((v_veg->>'isActive')::boolean, true),
      COALESCE((v_veg->>'revision')::integer, 1),
      (v_veg->>'createdAt')::timestamptz,
      (v_veg->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      short_code = EXCLUDED.short_code,
      display_name = EXCLUDED.display_name,
      is_active = EXCLUDED.is_active,
      revision = EXCLUDED.revision,
      updated_at = EXCLUDED.updated_at
    WHERE public.vegetables.revision <= EXCLUDED.revision;
    RETURN;
  END IF;

  IF v_type IN (
    'polivo.package_type.created',
    'polivo.package_type.updated',
    'polivo.package_type.status_changed'
  ) THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_pkg := v_payload->'packageType';
    INSERT INTO public.package_types (
      tenant_id, id, stall_id, short_code, display_name, is_active, revision, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_pkg->>'id',
      p_stall_id,
      v_pkg->>'shortCode',
      v_pkg->>'displayName',
      COALESCE((v_pkg->>'isActive')::boolean, true),
      COALESCE((v_pkg->>'revision')::integer, 1),
      (v_pkg->>'createdAt')::timestamptz,
      (v_pkg->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      short_code = EXCLUDED.short_code,
      display_name = EXCLUDED.display_name,
      is_active = EXCLUDED.is_active,
      revision = EXCLUDED.revision,
      updated_at = EXCLUDED.updated_at
    WHERE public.package_types.revision <= EXCLUDED.revision;
    RETURN;
  END IF;

  IF v_type = 'polivo.commission_policy.activated' THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_active := v_payload->'activeVersion';
    INSERT INTO public.commission_band_sets (
      tenant_id, id, stall_id, effective_from, created_at, policy_id, version_label, activated_at, revision
    ) VALUES (
      p_tenant_id,
      v_active->>'id',
      p_stall_id,
      COALESCE((v_active->>'effectiveFrom')::timestamptz, now()),
      COALESCE((v_active->>'createdAt')::timestamptz, now()),
      p_stall_id || ':commission',
      COALESCE(v_active->>'versionNumber', v_active->>'id'),
      COALESCE((v_active->>'activatedAt')::timestamptz, now()),
      COALESCE((v_payload->>'revision')::integer, 1)
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      activated_at = EXCLUDED.activated_at,
      revision = EXCLUDED.revision;

    FOR v_band IN SELECT * FROM jsonb_array_elements(COALESCE(v_active->'bands', '[]'::jsonb))
    LOOP
      INSERT INTO public.commission_bands (
        tenant_id, id, stall_id, band_set_id, sort_order,
        min_price_per_kg_minor, max_price_per_kg_minor, rate_per_kg_minor
      ) VALUES (
        p_tenant_id,
        v_band->>'id',
        p_stall_id,
        v_active->>'id',
        (v_band->>'sortOrder')::integer,
        NULLIF(v_band->>'minPricePerKgMinor', '')::bigint,
        NULLIF(v_band->>'maxPricePerKgMinor', '')::bigint,
        (v_band->>'ratePerKgMinor')::bigint
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;

    INSERT INTO public.commission_policies (
      tenant_id, id, stall_id, revision, active_band_set_id, updated_at
    ) VALUES (
      p_tenant_id,
      p_stall_id || ':commission',
      p_stall_id,
      COALESCE((v_payload->>'revision')::integer, 1),
      v_active->>'id',
      now()
    )
    ON CONFLICT (tenant_id, stall_id) DO UPDATE SET
      revision = EXCLUDED.revision,
      active_band_set_id = EXCLUDED.active_band_set_id,
      updated_at = EXCLUDED.updated_at;
    RETURN;
  END IF;

  IF v_type IN ('polivo.sale.finalized', 'polivo.trader_bill.issued') THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_sale := v_payload->'sale';
    v_bill := v_payload->'traderBill';
    v_summary := v_payload->'summary';

    INSERT INTO public.sales (
      tenant_id, id, stall_id, trader_id, business_date, status, revision,
      corrects_sale_id, finalized_at, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_sale->>'id',
      p_stall_id,
      v_sale->>'traderId',
      (v_sale->>'businessDate')::date,
      v_sale->>'status',
      (v_sale->>'revision')::integer,
      NULLIF(v_sale->>'correctsSaleId', ''),
      (v_sale->>'finalizedAt')::timestamptz,
      (v_sale->>'createdAt')::timestamptz,
      (v_sale->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;

    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.sale_lines (
        tenant_id, id, stall_id, sale_id, vegetable_id, line_order,
        unit_price_per_kg_minor, packaging_weight_hundredths,
        line_sale_amount_minor, applied_commission_rate_per_kg_minor, applied_commission_amount_minor
      ) VALUES (
        p_tenant_id,
        v_line->>'lineId',
        p_stall_id,
        v_sale->>'id',
        v_line->>'vegetableId',
        (v_line->>'lineOrder')::integer,
        (v_line->>'unitPricePerKgMinor')::bigint,
        (v_line->>'packagingWeightHundredths')::bigint,
        (v_line->>'saleAmountMinor')::bigint,
        (v_line->>'appliedCommissionRatePerKgMinor')::bigint,
        (v_line->>'commissionAmountMinor')::bigint
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;

    FOR v_pw IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'packageWeights', '[]'::jsonb))
    LOOP
      INSERT INTO public.sale_line_package_weights (
        tenant_id, id, stall_id, sale_line_id, package_index, gross_weight_hundredths
      ) VALUES (
        p_tenant_id,
        v_pw->>'id',
        p_stall_id,
        -- packageWeights rows must include saleLineId when present; else skip orphan.
        v_pw->>'saleLineId',
        (v_pw->>'packageIndex')::integer,
        (v_pw->>'grossWeightHundredths')::bigint
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;

    FOR v_fa IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'farmerAllocations', '[]'::jsonb))
    LOOP
      INSERT INTO public.sale_farmer_allocations (
        tenant_id, id, stall_id, sale_id, sale_line_id, farmer_id, allocated_net_weight_hundredths
      ) VALUES (
        p_tenant_id,
        v_fa->>'id',
        p_stall_id,
        v_sale->>'id',
        v_fa->>'saleLineId',
        v_fa->>'farmerId',
        (v_fa->>'allocatedNetWeightHundredths')::bigint
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;

    INSERT INTO public.trader_bills (
      tenant_id, id, stall_id, sale_id, trader_id, bill_number, business_date,
      status, revision, total_amount_minor, payment_status, created_at, updated_at
    ) VALUES (
      p_tenant_id,
      v_bill->>'id',
      p_stall_id,
      v_bill->>'saleId',
      v_bill->>'traderId',
      v_bill->>'billNumber',
      (v_bill->>'businessDate')::date,
      'finalized',
      1,
      (v_bill->>'totalAmountMinor')::bigint,
      v_bill->>'paymentStatus',
      (v_bill->>'createdAt')::timestamptz,
      (v_bill->>'updatedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;

    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    RETURN;
  END IF;

  IF v_type = 'polivo.farmer_bill.issued' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_bill := v_payload->'bill';
    INSERT INTO public.farmer_bills (
      tenant_id, id, stall_id, sale_id, farmer_id, bill_number, business_date,
      status, revision, total_amount_minor, payment_status, created_at, updated_at,
      farmer_short_code, farmer_display_name, covered_business_date_from, covered_business_date_to,
      total_sale_amount_minor, total_commission_minor, total_farmer_receives_minor,
      currency, selection_fingerprint, finalized_at
    ) VALUES (
      p_tenant_id,
      v_bill->>'id',
      p_stall_id,
      NULL,
      v_bill->>'farmerId',
      v_bill->>'billNumber',
      (v_bill->>'businessDate')::date,
      'finalized',
      1,
      (v_bill->>'totalAmountMinor')::bigint,
      v_bill->>'paymentStatus',
      (v_bill->>'createdAt')::timestamptz,
      (v_bill->>'updatedAt')::timestamptz,
      v_bill->>'farmerShortCode',
      v_bill->>'farmerDisplayName',
      (v_bill->>'coveredBusinessDateFrom')::date,
      (v_bill->>'coveredBusinessDateTo')::date,
      (v_bill->>'totalSaleAmountMinor')::bigint,
      (v_bill->>'totalCommissionMinor')::bigint,
      (v_bill->>'totalFarmerReceivesMinor')::bigint,
      COALESCE(v_bill->>'currency', 'LKR'),
      v_bill->>'selectionFingerprint',
      (v_bill->>'finalizedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;

    FOR v_fbl IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'lines', v_bill->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.farmer_bill_lines (
        tenant_id, id, stall_id, farmer_bill_id, sale_id, sale_line_id, line_order,
        trader_bill_id, trader_bill_number, business_date, vegetable_id,
        vegetable_short_code, vegetable_display_name, package_type_id,
        package_type_short_code, package_type_display_name, package_count,
        net_weight_hundredths, unit_price_per_kg_minor, sale_amount_minor,
        commission_amount_minor, farmer_receives_minor, commission_policy_id,
        commission_version_id, commission_band_id, applied_commission_rate_per_kg_minor,
        sale_posting_id, created_at
      ) VALUES (
        p_tenant_id,
        COALESCE(v_fbl->>'id', v_fbl->>'saleLineId'),
        p_stall_id,
        v_bill->>'id',
        v_fbl->>'saleId',
        v_fbl->>'saleLineId',
        (v_fbl->>'lineOrder')::integer,
        NULLIF(v_fbl->>'traderBillId', ''),
        NULLIF(v_fbl->>'traderBillNumber', ''),
        (v_fbl->>'businessDate')::date,
        v_fbl->>'vegetableId',
        COALESCE(v_fbl->>'vegetableCode', v_fbl->>'vegetableShortCode'),
        v_fbl->>'vegetableDisplayName',
        NULLIF(v_fbl->>'packageTypeId', ''),
        NULLIF(v_fbl->>'packageTypeCode', ''),
        NULLIF(v_fbl->>'packageTypeDisplayName', ''),
        COALESCE((v_fbl->>'packageCount')::integer, 0),
        (v_fbl->>'netWeightHundredths')::bigint,
        (v_fbl->>'unitPricePerKgMinor')::bigint,
        (v_fbl->>'saleAmountMinor')::bigint,
        (v_fbl->>'commissionAmountMinor')::bigint,
        (v_fbl->>'farmerReceivesMinor')::bigint,
        NULLIF(v_fbl->>'commissionPolicyId', ''),
        NULLIF(v_fbl->>'commissionVersionId', ''),
        NULLIF(v_fbl->>'commissionBandId', ''),
        NULLIF(v_fbl->>'appliedCommissionRatePerKgMinor', '')::bigint,
        NULLIF(v_fbl->>'salePostingId', ''),
        COALESCE((v_bill->>'createdAt')::timestamptz, now())
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;
    RETURN;
  END IF;

  IF v_type = 'polivo.payment.posted' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_payment := v_payload->'payment';
    INSERT INTO public.payments (
      tenant_id, id, stall_id, party_kind, farmer_id, trader_id, method, amount_minor,
      paid_at, created_at, direction, reference_number, status, business_date, recorded_at,
      actor_staff_id, posting_id, bank_transfer_reference, bank_transfer_date, bank_account_label,
      cheque_number, issuing_bank_label, cheque_date, physical_handover_date, recognition_basis, currency
    ) VALUES (
      p_tenant_id,
      v_payment->>'id',
      p_stall_id,
      v_payment->>'partyKind',
      CASE WHEN v_payment->>'partyKind' = 'farmer' THEN v_payment->>'partyId' ELSE NULL END,
      CASE WHEN v_payment->>'partyKind' = 'trader' THEN v_payment->>'partyId' ELSE NULL END,
      v_payment->>'method',
      (v_payment->>'amountMinor')::bigint,
      (v_payment->>'recordedAt')::timestamptz,
      (v_payment->>'recordedAt')::timestamptz,
      v_payment->>'direction',
      v_payment->>'referenceNumber',
      COALESCE(v_payment->>'status', 'posted'),
      (v_payment->>'businessDate')::date,
      (v_payment->>'recordedAt')::timestamptz,
      NULLIF(v_payload->'summary'->>'actorStaffId', ''),
      (v_payload->'ledgerPosting'->>'id'),
      NULLIF(v_payment->>'bankTransferReference', ''),
      NULLIF(v_payment->>'bankTransferDate', '')::date,
      NULLIF(v_payment->>'bankAccountLabel', ''),
      NULLIF(v_payment->>'chequeNumber', ''),
      NULLIF(v_payment->>'issuingBankLabel', ''),
      NULLIF(v_payment->>'chequeDate', '')::date,
      NULLIF(v_payment->>'physicalHandoverDate', '')::date,
      NULLIF(v_payment->>'recognitionBasis', ''),
      COALESCE(v_payment->>'currency', 'LKR')
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'allocations', '[]'::jsonb))
    LOOP
      INSERT INTO public.payment_allocations (
        tenant_id, id, stall_id, payment_id, bill_kind, farmer_bill_id, trader_bill_id,
        applied_amount_minor, obligation_kind, sale_line_id, opening_draft_id, status, created_at
      ) VALUES (
        p_tenant_id,
        v_alloc->>'id',
        p_stall_id,
        v_payment->>'id',
        CASE
          WHEN v_alloc->>'traderBillId' IS NOT NULL AND v_alloc->>'traderBillId' <> '' THEN 'trader'
          WHEN v_alloc->>'farmerBillId' IS NOT NULL AND v_alloc->>'farmerBillId' <> '' THEN 'farmer'
          ELSE 'trader'
        END,
        NULLIF(v_alloc->>'farmerBillId', ''),
        NULLIF(v_alloc->>'traderBillId', ''),
        (v_alloc->>'appliedAmountMinor')::bigint,
        v_alloc->>'obligationKind',
        NULLIF(v_alloc->>'saleLineId', ''),
        NULLIF(v_alloc->>'openingDraftId', ''),
        COALESCE(v_alloc->>'status', 'active'),
        COALESCE((v_alloc->>'createdAt')::timestamptz, now())
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;

    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    RETURN;
  END IF;

  IF v_type = 'polivo.payment.allocation_created' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'allocations', '[]'::jsonb))
    LOOP
      INSERT INTO public.payment_allocations (
        tenant_id, id, stall_id, payment_id, bill_kind, farmer_bill_id, trader_bill_id,
        applied_amount_minor, obligation_kind, sale_line_id, opening_draft_id, status, created_at
      ) VALUES (
        p_tenant_id,
        v_alloc->>'id',
        p_stall_id,
        v_payload->>'paymentId',
        CASE
          WHEN v_alloc->>'traderBillId' IS NOT NULL AND v_alloc->>'traderBillId' <> '' THEN 'trader'
          WHEN v_alloc->>'farmerBillId' IS NOT NULL AND v_alloc->>'farmerBillId' <> '' THEN 'farmer'
          ELSE 'trader'
        END,
        NULLIF(v_alloc->>'farmerBillId', ''),
        NULLIF(v_alloc->>'traderBillId', ''),
        (v_alloc->>'appliedAmountMinor')::bigint,
        v_alloc->>'obligationKind',
        NULLIF(v_alloc->>'saleLineId', ''),
        NULLIF(v_alloc->>'openingDraftId', ''),
        COALESCE(v_alloc->>'status', 'active'),
        COALESCE((v_alloc->>'createdAt')::timestamptz, now())
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END LOOP;
    RETURN;
  END IF;

  IF v_type = 'polivo.payment.reversed' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    UPDATE public.payments
    SET status = 'reversed',
        reversed_by_payment_id = v_payload->'summary'->>'reversalPaymentId'
    WHERE tenant_id = p_tenant_id
      AND id = v_payload->'summary'->>'originalPaymentId';
    -- Insert reversal payment via nested payment shape when provided.
    IF v_payload ? 'reversalPayment' THEN
      v_payment := v_payload->'reversalPayment';
      INSERT INTO public.payments (
        tenant_id, id, stall_id, party_kind, farmer_id, trader_id, method, amount_minor,
        paid_at, created_at, direction, reference_number, status, business_date, recorded_at,
        reverses_payment_id, currency
      ) VALUES (
        p_tenant_id,
        v_payment->>'id',
        p_stall_id,
        v_payment->>'partyKind',
        CASE WHEN v_payment->>'partyKind' = 'farmer' THEN v_payment->>'partyId' ELSE NULL END,
        CASE WHEN v_payment->>'partyKind' = 'trader' THEN v_payment->>'partyId' ELSE NULL END,
        v_payment->>'method',
        (v_payment->>'amountMinor')::bigint,
        (v_payment->>'recordedAt')::timestamptz,
        (v_payment->>'recordedAt')::timestamptz,
        v_payment->>'direction',
        v_payment->>'referenceNumber',
        'posted',
        (v_payment->>'businessDate')::date,
        (v_payment->>'recordedAt')::timestamptz,
        v_payload->'summary'->>'originalPaymentId',
        COALESCE(v_payment->>'currency', 'LKR')
      )
      ON CONFLICT (tenant_id, id) DO NOTHING;
    END IF;
    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    RETURN;
  END IF;

  IF v_type = 'polivo.sale.reversed' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    UPDATE public.sales
    SET status = 'cancelled', cancelled_at = COALESCE((v_payload->'summary'->>'recordedAt')::timestamptz, now())
    WHERE tenant_id = p_tenant_id AND id = v_payload->>'sourceSaleId';
    UPDATE public.trader_bills
    SET status = 'cancelled'
    WHERE tenant_id = p_tenant_id AND id = NULLIF(v_payload->>'sourceTraderBillId', '');
    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'reversalLedgerPosting');
    INSERT INTO public.sale_correction_operations (
      tenant_id, id, stall_id, source_sale_id, replacement_sale_id, reversal_posting_id,
      reason, business_date, recorded_at
    ) VALUES (
      p_tenant_id,
      v_payload->'summary'->>'operationId',
      p_stall_id,
      v_payload->>'sourceSaleId',
      NULL,
      v_payload->'summary'->>'reversalPostingId',
      COALESCE(v_payload->'summary'->>'reason', 'reversed'),
      (v_payload->'summary'->>'businessDate')::date,
      (v_payload->'summary'->>'recordedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
    RETURN;
  END IF;

  IF v_type = 'polivo.sale.corrected' THEN
    IF v_version IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    UPDATE public.sales
    SET status = 'cancelled',
        cancelled_at = COALESCE((v_payload->'summary'->>'recordedAt')::timestamptz, now()),
        correction_operation_id = v_payload->'summary'->>'operationId'
    WHERE tenant_id = p_tenant_id AND id = v_payload->'summary'->>'sourceSaleId';
    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'reversalLedgerPosting');
    -- Apply replacement sale as a nested finalized v2 payload.
    PERFORM public.polivo_sync_apply_event(
      p_tenant_id,
      p_stall_id,
      jsonb_build_object(
        'eventType', 'polivo.sale.finalized',
        'eventSchemaVersion', '2',
        'payload', v_payload->'replacement'
      )
    );
    INSERT INTO public.sale_correction_operations (
      tenant_id, id, stall_id, source_sale_id, replacement_sale_id, reversal_posting_id,
      replacement_posting_id, reason, business_date, recorded_at
    ) VALUES (
      p_tenant_id,
      v_payload->'summary'->>'operationId',
      p_stall_id,
      v_payload->'summary'->>'sourceSaleId',
      v_payload->'summary'->>'replacementSaleId',
      v_payload->'summary'->>'reversalPostingId',
      v_payload->'summary'->>'replacementPostingId',
      COALESCE(v_payload->'summary'->>'reason', 'corrected'),
      (v_payload->'summary'->>'businessDate')::date,
      (v_payload->'summary'->>'recordedAt')::timestamptz
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
    RETURN;
  END IF;

  IF v_type = 'polivo.opening_balance.posted' THEN
    IF v_version NOT IN ('1', '2') THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    v_summary := CASE WHEN v_version = '2' THEN v_payload->'summary' ELSE v_payload END;
    v_party := CASE WHEN v_version = '2' THEN v_payload->'partyAccount' ELSE NULL END;
    IF v_party IS NOT NULL THEN
      INSERT INTO public.party_accounts (
        tenant_id, id, stall_id, party_kind, party_id, currency, opening_status,
        opening_cutoff_date, opening_completed_at, opening_draft_id, opening_posting_id,
        created_at, updated_at
      ) VALUES (
        p_tenant_id,
        p_stall_id || ':' || (v_party->>'partyKind') || ':' || (v_party->>'partyId'),
        p_stall_id,
        v_party->>'partyKind',
        v_party->>'partyId',
        'LKR',
        v_party->>'openingStatus',
        (v_party->>'openingCutoffDate')::date,
        (v_party->>'openingCompletedAt')::timestamptz,
        NULLIF(v_party->>'openingDraftId', ''),
        NULLIF(v_party->>'openingPostingId', ''),
        now(),
        now()
      )
      ON CONFLICT (tenant_id, stall_id, party_kind, party_id) DO UPDATE SET
        opening_status = EXCLUDED.opening_status,
        opening_cutoff_date = EXCLUDED.opening_cutoff_date,
        opening_completed_at = EXCLUDED.opening_completed_at,
        opening_draft_id = EXCLUDED.opening_draft_id,
        opening_posting_id = EXCLUDED.opening_posting_id,
        updated_at = EXCLUDED.updated_at;
    END IF;
    IF v_version = '2' THEN
      PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    END IF;
    RETURN;
  END IF;

  IF v_type = 'polivo.opening_balance.corrected' THEN
    IF v_version NOT IN ('1', '2') THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    IF v_version = '2' THEN
      PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'reversalLedgerPosting');
      PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'replacementLedgerPosting');
    END IF;
    RETURN;
  END IF;

  IF v_type = 'polivo.print_job.created' THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    INSERT INTO public.print_jobs (
      tenant_id, id, stall_id, document_kind, document_id, template_id, payload_hash,
      actor_staff_id, device_id, created_at
    ) VALUES (
      p_tenant_id,
      v_payload->>'jobId',
      p_stall_id,
      COALESCE(v_payload->>'documentKind', 'unknown'),
      COALESCE(v_payload->>'documentId', v_payload->>'jobId'),
      COALESCE(v_payload->>'templateId', 'unknown'),
      COALESCE(v_payload->>'payloadHash', 'unknown'),
      NULLIF(v_payload->>'actorStaffId', ''),
      NULLIF(v_payload->>'deviceId', ''),
      COALESCE((v_payload->>'createdAt')::timestamptz, now())
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
    RETURN;
  END IF;

  IF v_type IN ('polivo.print_attempt.prepared', 'polivo.print_attempt.outcome') THEN
    IF v_version IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, v_version;
    END IF;
    INSERT INTO public.print_attempts (
      tenant_id, id, stall_id, job_id, attempt_number, classification, outcome, detail,
      is_reprint, created_at
    ) VALUES (
      p_tenant_id,
      COALESCE(v_payload->>'attemptId', v_payload->>'id'),
      p_stall_id,
      v_payload->>'jobId',
      COALESCE((v_payload->>'attemptNumber')::integer, 1),
      NULLIF(v_payload->>'classification', ''),
      NULLIF(v_payload->>'outcome', ''),
      NULLIF(v_payload->>'detail', ''),
      COALESCE((v_payload->>'isReprint')::boolean, false),
      COALESCE((v_payload->>'createdAt')::timestamptz, now())
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      outcome = COALESCE(EXCLUDED.outcome, public.print_attempts.outcome),
      detail = COALESCE(EXCLUDED.detail, public.print_attempts.detail);
    RETURN;
  END IF;

  RAISE EXCEPTION 'UNSUPPORTED_EVENT_VERSION:%:%', v_type, COALESCE(v_version, '');
END;
$$;

REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_sync_ingestion_group(
  p_tenant_id text,
  p_stall_id text,
  p_device_id text,
  p_installation_id text,
  p_credential_version integer,
  p_source_stream_id text,
  p_stream_generation integer,
  p_transaction_group_id text,
  p_events jsonb,
  p_event_hashes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device public.tenant_devices%ROWTYPE;
  v_stream public.sync_source_streams%ROWTYPE;
  v_event jsonb;
  v_idx integer := 0;
  v_seq bigint;
  v_event_id text;
  v_hash text;
  v_existing_hash text;
  v_existing_group text;
  v_min_seq bigint;
  v_max_seq bigint;
  v_event_ids jsonb := '[]'::jsonb;
  v_ack_ids text[] := ARRAY[]::text[];
  v_expected bigint;
  v_existing_count integer := 0;
  v_new_count integer := 0;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) = 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'validation_failure',
      'errorCode', 'EMPTY_GROUP',
      'message', 'Transaction group has no events',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', NULL
    );
  END IF;

  SELECT * INTO v_device
  FROM public.tenant_devices
  WHERE tenant_id = p_tenant_id
    AND device_id = p_device_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_device.role <> 'host'
     OR v_device.enrollment_state <> 'activated'
     OR v_device.installation_id IS DISTINCT FROM p_installation_id
     OR v_device.credential_version IS DISTINCT FROM p_credential_version THEN
    RETURN jsonb_build_object(
      'outcome', 'authorization_failure',
      'errorCode', 'HOST_NOT_AUTHORIZED',
      'message', 'Activated host credential required',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', NULL
    );
  END IF;

  -- Stall binding today equals tenant id; reject mismatches explicitly.
  IF p_stall_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object(
      'outcome', 'authorization_failure',
      'errorCode', 'STALL_SCOPE_MISMATCH',
      'message', 'stallId must match authorized tenant stall binding',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', NULL
    );
  END IF;

  IF p_source_stream_id IS DISTINCT FROM p_installation_id THEN
    RETURN jsonb_build_object(
      'outcome', 'authorization_failure',
      'errorCode', 'STREAM_IDENTITY_MISMATCH',
      'message', 'sourceStreamId must equal installation_id',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', NULL
    );
  END IF;

  SELECT * INTO v_stream
  FROM public.sync_source_streams
  WHERE tenant_id = p_tenant_id
    AND source_stream_id = p_source_stream_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sync_source_streams (
      tenant_id, source_stream_id, stall_id, device_id, installation_id,
      stream_generation, committed_cursor, compatibility_protocol_version, created_at, updated_at
    ) VALUES (
      p_tenant_id, p_source_stream_id, p_stall_id, p_device_id, p_installation_id,
      p_stream_generation, 0, '1', now(), now()
    )
    RETURNING * INTO v_stream;
  END IF;

  IF v_stream.stream_generation IS DISTINCT FROM p_stream_generation THEN
    RETURN jsonb_build_object(
      'outcome', 'integrity_conflict',
      'errorCode', 'STREAM_GENERATION_CONFLICT',
      'message', 'Stream generation does not match registered generation',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', v_stream.committed_cursor::text
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sync_transaction_group_receipts g
    WHERE g.tenant_id = p_tenant_id
      AND g.source_stream_id = p_source_stream_id
      AND g.transaction_group_id = p_transaction_group_id
  ) THEN
    SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
    INTO v_event_ids
    FROM jsonb_array_elements_text(
      (SELECT event_ids FROM public.sync_transaction_group_receipts
       WHERE tenant_id = p_tenant_id
         AND source_stream_id = p_source_stream_id
         AND transaction_group_id = p_transaction_group_id)
    ) e;

    RETURN jsonb_build_object(
      'outcome', 'already_applied',
      'errorCode', NULL,
      'message', NULL,
      'retryable', false,
      'acknowledgedEventIds', (
        SELECT event_ids FROM public.sync_transaction_group_receipts
        WHERE tenant_id = p_tenant_id
          AND source_stream_id = p_source_stream_id
          AND transaction_group_id = p_transaction_group_id
      ),
      'committedCursor', v_stream.committed_cursor::text
    );
  END IF;

  v_expected := v_stream.committed_cursor + 1;
  v_min_seq := NULL;
  v_max_seq := NULL;

  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_event_id := v_event->>'eventId';
    v_seq := (v_event->>'sequence')::bigint;
    v_hash := p_event_hashes->>v_event_id;

    IF v_hash IS NULL OR length(v_hash) <> 64 THEN
      RETURN jsonb_build_object(
        'outcome', 'validation_failure',
        'errorCode', 'PAYLOAD_HASH_REQUIRED',
        'message', 'Server hash missing for event',
        'retryable', false,
        'acknowledgedEventIds', '[]'::jsonb,
        'committedCursor', v_stream.committed_cursor::text
      );
    END IF;

    IF v_min_seq IS NULL OR v_seq < v_min_seq THEN
      v_min_seq := v_seq;
    END IF;
    IF v_max_seq IS NULL OR v_seq > v_max_seq THEN
      v_max_seq := v_seq;
    END IF;

    SELECT payload_hash, transaction_group_id
    INTO v_existing_hash, v_existing_group
    FROM public.sync_received_events
    WHERE tenant_id = p_tenant_id AND event_id = v_event_id;

    IF FOUND THEN
      IF v_existing_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object(
          'outcome', 'integrity_conflict',
          'errorCode', 'EVENT_ID_PAYLOAD_MISMATCH',
          'message', 'Event id reused with different payload hash',
          'retryable', false,
          'acknowledgedEventIds', '[]'::jsonb,
          'committedCursor', v_stream.committed_cursor::text
        );
      END IF;
      v_existing_count := v_existing_count + 1;
    ELSE
      IF v_seq <> v_expected + v_new_count THEN
        RETURN jsonb_build_object(
          'outcome', 'sequence_conflict',
          'errorCode', 'SEQUENCE_GAP_OR_REORDER',
          'message', format('Expected sequence %s, received %s', v_expected + v_new_count, v_seq),
          'retryable', false,
          'acknowledgedEventIds', '[]'::jsonb,
          'committedCursor', v_stream.committed_cursor::text,
          'nextExpectedSequence', v_expected::text
        );
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.sync_received_events
        WHERE tenant_id = p_tenant_id
          AND source_stream_id = p_source_stream_id
          AND local_sequence = v_seq
      ) THEN
        RETURN jsonb_build_object(
          'outcome', 'integrity_conflict',
          'errorCode', 'SEQUENCE_PAYLOAD_MISMATCH',
          'message', 'Sequence reused with a different event',
          'retryable', false,
          'acknowledgedEventIds', '[]'::jsonb,
          'committedCursor', v_stream.committed_cursor::text
        );
      END IF;
      v_new_count := v_new_count + 1;
    END IF;

    v_ack_ids := array_append(v_ack_ids, v_event_id);
    v_idx := v_idx + 1;
  END LOOP;

  IF v_existing_count > 0 AND v_new_count > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'integrity_conflict',
      'errorCode', 'PARTIAL_EVENT_OVERLAP',
      'message', 'Group mixes already-applied and new event ids',
      'retryable', false,
      'acknowledgedEventIds', '[]'::jsonb,
      'committedCursor', v_stream.committed_cursor::text
    );
  END IF;

  IF v_new_count = 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'already_applied',
      'errorCode', NULL,
      'message', NULL,
      'retryable', false,
      'acknowledgedEventIds', to_jsonb(v_ack_ids),
      'committedCursor', v_stream.committed_cursor::text,
      'nextExpectedSequence', (v_stream.committed_cursor + 1)::text
    );
  END IF;

  IF v_new_count > 0 THEN
    BEGIN
      FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
      LOOP
        PERFORM public.polivo_sync_apply_event(p_tenant_id, p_stall_id, v_event);
      END LOOP;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'UNSUPPORTED_EVENT_VERSION%' THEN
          RETURN jsonb_build_object(
            'outcome', 'unsupported_event_version',
            'errorCode', 'UNSUPPORTED_EVENT_VERSION',
            'message', SQLERRM,
            'retryable', false,
            'acknowledgedEventIds', '[]'::jsonb,
            'committedCursor', v_stream.committed_cursor::text
          );
        ELSIF SQLERRM LIKE 'AUTHORIZATION_FAILURE%' THEN
          RETURN jsonb_build_object(
            'outcome', 'authorization_failure',
            'errorCode', 'AUTHORIZATION_FAILURE',
            'message', SQLERRM,
            'retryable', false,
            'acknowledgedEventIds', '[]'::jsonb,
            'committedCursor', v_stream.committed_cursor::text
          );
        ELSIF SQLERRM LIKE 'VALIDATION_FAILURE%' THEN
          RETURN jsonb_build_object(
            'outcome', 'validation_failure',
            'errorCode', 'VALIDATION_FAILURE',
            'message', SQLERRM,
            'retryable', false,
            'acknowledgedEventIds', '[]'::jsonb,
            'committedCursor', v_stream.committed_cursor::text
          );
        ELSE
          RETURN jsonb_build_object(
            'outcome', 'retryable_failure',
            'errorCode', 'APPLY_FAILED',
            'message', left(SQLERRM, 500),
            'retryable', true,
            'acknowledgedEventIds', '[]'::jsonb,
            'committedCursor', v_stream.committed_cursor::text
          );
        END IF;
    END;
  END IF;

  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_event_id := v_event->>'eventId';
    v_seq := (v_event->>'sequence')::bigint;
    v_hash := p_event_hashes->>v_event_id;

    INSERT INTO public.sync_received_events (
      tenant_id, event_id, stall_id, event_type, event_schema_version, occurred_at, received_at,
      source_revision, source_stream_id, stream_generation, local_sequence, transaction_group_id,
      payload_hash, applied_status, device_id, applied_at
    ) VALUES (
      p_tenant_id,
      v_event_id,
      p_stall_id,
      v_event->>'eventType',
      v_event->>'eventSchemaVersion',
      (v_event->>'occurredAt')::timestamptz,
      now(),
      NULLIF(v_event->>'aggregateRevision', '')::integer,
      p_source_stream_id,
      p_stream_generation,
      v_seq,
      p_transaction_group_id,
      v_hash,
      'applied',
      p_device_id,
      now()
    )
    ON CONFLICT (tenant_id, event_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.sync_transaction_group_receipts (
    tenant_id, source_stream_id, transaction_group_id, stream_generation, stall_id,
    min_sequence, max_sequence, event_ids, applied_at
  ) VALUES (
    p_tenant_id,
    p_source_stream_id,
    p_transaction_group_id,
    p_stream_generation,
    p_stall_id,
    v_min_seq,
    v_max_seq,
    to_jsonb(v_ack_ids),
    now()
  )
  ON CONFLICT (tenant_id, source_stream_id, transaction_group_id) DO NOTHING;

  UPDATE public.sync_source_streams
  SET committed_cursor = v_max_seq,
      device_id = p_device_id,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND source_stream_id = p_source_stream_id;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_new_count = 0 THEN 'already_applied' ELSE 'applied' END,
    'errorCode', NULL,
    'message', NULL,
    'retryable', false,
    'acknowledgedEventIds', to_jsonb(v_ack_ids),
    'committedCursor', v_max_seq::text,
    'nextExpectedSequence', (v_max_seq + 1)::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_sync_ingestion_group(
  text, text, text, text, integer, text, integer, text, jsonb, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_sync_ingestion_group(
  text, text, text, text, integer, text, integer, text, jsonb, jsonb
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sync_ingestion_group(
  text, text, text, text, integer, text, integer, text, jsonb, jsonb
) TO service_role;
