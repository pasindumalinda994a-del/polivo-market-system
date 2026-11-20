import fs from "node:fs";

const srcPath =
  "c:/Users/pasin/Documents/System Projects/polivo-market-system/supabase/migrations/20261113120100_cloud_sync_ingestion_apply.sql";
const outPath =
  "c:/Users/pasin/Documents/System Projects/polivo-market-system/supabase/migrations/20261119120200_web_reporting_apply_posting_fields.sql";

const lines = fs.readFileSync(srcPath, "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.includes("CREATE OR REPLACE FUNCTION public.polivo_sync_apply_event"));
const end = lines.findIndex(
  (l, i) => i > start && l.includes("CREATE OR REPLACE FUNCTION public.apply_sync_ingestion_group"),
);
let fn = lines.slice(start, end).join("\n");

const salesInsertOld = `    INSERT INTO public.sales (
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
    ON CONFLICT (tenant_id, id) DO NOTHING;`;

const salesInsertNew = `    INSERT INTO public.sales (
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
    ON CONFLICT (tenant_id, id) DO NOTHING;`;

if (!fn.includes(salesInsertOld)) {
  throw new Error("sales insert block not found");
}
fn = fn.replace(salesInsertOld, salesInsertNew);

const lineInsertOld = `      INSERT INTO public.sale_lines (
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
      ON CONFLICT (tenant_id, id) DO NOTHING;`;

const lineInsertNew = `      INSERT INTO public.sale_lines (
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
      ON CONFLICT (tenant_id, id) DO NOTHING;`;

if (!fn.includes(lineInsertOld)) {
  throw new Error("sale line insert block not found");
}
fn = fn.replace(lineInsertOld, lineInsertNew);

const afterLedger = `    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    RETURN;
  END IF;

  IF v_type = 'polivo.farmer_bill.issued' THEN`;

const afterLedgerNew = `    PERFORM public.polivo_sync_upsert_ledger(p_tenant_id, p_stall_id, v_payload->'ledgerPosting');
    UPDATE public.sales
    SET posting_id = COALESCE(
      posting_id,
      NULLIF(v_summary->>'postingId', ''),
      NULLIF(v_payload->'ledgerPosting'->>'id', '')
    )
    WHERE tenant_id = p_tenant_id AND id = v_sale->>'id';
    RETURN;
  END IF;

  IF v_type = 'polivo.farmer_bill.issued' THEN`;

if (!fn.includes(afterLedger)) {
  throw new Error("sale finalized ledger tail not found");
}
fn = fn.replace(afterLedger, afterLedgerNew);

const reversedOld = `    UPDATE public.sales
    SET status = 'cancelled', cancelled_at = COALESCE((v_payload->'summary'->>'recordedAt')::timestamptz, now())
    WHERE tenant_id = p_tenant_id AND id = v_payload->>'sourceSaleId';
    UPDATE public.trader_bills
    SET status = 'cancelled'
    WHERE tenant_id = p_tenant_id AND id = NULLIF(v_payload->>'sourceTraderBillId', '');`;

const reversedNew = `    UPDATE public.sales
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
    WHERE tenant_id = p_tenant_id AND id = NULLIF(v_payload->>'sourceTraderBillId', '');`;

fn = fn.replace(reversedOld, reversedNew);

const correctedOld = `    UPDATE public.sales
    SET status = 'cancelled',
        cancelled_at = COALESCE((v_payload->'summary'->>'recordedAt')::timestamptz, now()),
        correction_operation_id = v_payload->'summary'->>'operationId'
    WHERE tenant_id = p_tenant_id AND id = v_payload->'summary'->>'sourceSaleId';`;

const correctedNew = `    UPDATE public.sales
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
      AND status = 'finalized';`;

fn = fn.replace(correctedOld, correctedNew);

const header = `-- Phase 35: reporting apply persistence + backfill for posting/correction projections.
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

`;

const footer = `
REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polivo_sync_apply_event(text, text, jsonb) TO service_role;
`;

fs.writeFileSync(outPath, header + fn + footer);
console.log(`Wrote ${outPath} (${header.length + fn.length + footer.length} bytes)`);