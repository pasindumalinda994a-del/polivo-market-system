-- Phase 35: reporting apply persistence + backfill for posting/correction projections.
-- Forward-only.

UPDATE public.sales s
SET posting_id = lp.id
FROM public.ledger_postings lp
WHERE s.tenant_id = lp.tenant_id
  AND s.stall_id = lp.stall_id
  AND lp.source_id = s.id
  AND lp.source_type = 'sale'
  AND s.posting_id IS NULL;

UPDATE public.sales s
SET correction_status = CASE
  WHEN s.correction_operation_id IS NOT NULL AND s.replacement_sale_id IS NOT NULL THEN 'superseded'
  WHEN s.status = 'cancelled' THEN 'reversed'
  ELSE COALESCE(s.correction_status, 'active')
END
WHERE s.status = 'cancelled' AND COALESCE(s.correction_status, 'active') = 'active';

UPDATE public.trader_bills tb
SET correction_status = CASE
  WHEN tb.status = 'cancelled' THEN 'reversed'
  ELSE COALESCE(tb.correction_status, 'active')
END
WHERE tb.status = 'cancelled' AND COALESCE(tb.correction_status, 'active') = 'active';

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
      corrects_sale_id, finalized_at, created_at, updated_at,
      posting_id, correction_status
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
      (v_sale->>'updatedAt')::timestamptz,
      COALESCE(
        NULLIF(v_summary->>'postingId', ''),
        NULLIF(v_payload->'ledgerPosting'->>'id', '')
      ),
      'active'
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;

    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.sale_lines (
        tenant_id, id, stall_id, sale_id, vegetable_id, line_order,
        unit_price_per_kg_minor, packaging_weight_hundredths,
        line_sale_amount_minor, applied_commission_rate_per_kg_minor, applied_commission_amount_minor,
        farmer_id, farmer_short_code, farmer_display_name,
        vegetable_short_code, vegetable_display_name,
        package_type_id, package_type_short_code, package_type_display_name,
        net_weight_hundredths, gross_weight_hundredths,
        trader_pays_minor, farmer_receives_minor, notes
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
        (v_line->>'commissionAmountMinor')::bigint,
        NULLIF(v_line->>'farmerId', ''),
        NULLIF(v_line->>'farmerShortCode', ''),
        NULLIF(v_line->>'farmerDisplayName', ''),
        COALESCE(NULLIF(v_line->>'vegetableCode', ''), NULLIF(v_line->>'vegetableShortCode', '')),
        NULLIF(v_line->>'vegetableDisplayName', ''),
        NULLIF(v_line->>'packageTypeId', ''),
        COALESCE(NULLIF(v_line->>'packageTypeCode', ''), NULLIF(v_line->>'packageTypeShortCode', '')),
        NULLIF(v_line->>'packageTypeDisplayName', ''),
        NULLIF(v_line->>'netWeightHundredths', '')::bigint,
        NULLIF(v_line->>'grossWeightHundredths', '')::bigint,
        NULLIF(v_line->>'traderPaysMinor', '')::bigint,
        COALESCE(
          NULLIF(v_line->>'farmerReceivesBeforeDeductionsMinor', '')::bigint,
          NULLIF(v_line->>'farmerReceivesMinor', '')::bigint
        ),
        NULLIF(v_line->>'notes', '')
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
    UPDATE public.sales
    SET posting_id = COALESCE(
      posting_id,
      NULLIF(v_summary->>'postingId', ''),
      NULLIF(v_payload->'ledgerPosting'->>'id', '')
    )
    WHERE tenant_id = p_tenant_id AND id = v_sale->>'id';
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
    SET status = 'cancelled',
        cancelled_at = COALESCE((v_payload->'summary'->>'recordedAt')::timestamptz, now()),
        correction_status = 'reversed',
        reversal_posting_id = COALESCE(
          NULLIF(v_payload->'summary'->>'reversalPostingId', ''),
          NULLIF(v_payload->'reversalLedgerPosting'->>'id', '')
        )
    WHERE tenant_id = p_tenant_id AND id = v_payload->>'sourceSaleId';
    UPDATE public.trader_bills
    SET status = 'cancelled',
        correction_status = 'reversed',
        reversal_posting_id = COALESCE(
          NULLIF(v_payload->'summary'->>'reversalPostingId', ''),
          NULLIF(v_payload->'reversalLedgerPosting'->>'id', '')
        )
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
        correction_operation_id = v_payload->'summary'->>'operationId',
        correction_status = 'superseded',
        replacement_sale_id = NULLIF(v_payload->'summary'->>'replacementSaleId', ''),
        reversal_posting_id = COALESCE(
          NULLIF(v_payload->'summary'->>'reversalPostingId', ''),
          NULLIF(v_payload->'reversalLedgerPosting'->>'id', '')
        )
    WHERE tenant_id = p_tenant_id AND id = v_payload->'summary'->>'sourceSaleId';
    UPDATE public.trader_bills
    SET correction_status = 'superseded'
    WHERE tenant_id = p_tenant_id
      AND sale_id = v_payload->'summary'->>'sourceSaleId'
      AND status = 'finalized';
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

REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) TO service_role;
