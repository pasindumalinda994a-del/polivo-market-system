import {
  FARMER_BILL_ISSUED_EVENT_TYPE,
  OPENING_BALANCE_CORRECTED_EVENT_TYPE,
  OPENING_BALANCE_POSTED_EVENT_TYPE,
  PAYMENT_ALLOCATION_CREATED_EVENT_TYPE,
  PAYMENT_POSTED_EVENT_TYPE,
  PAYMENT_REVERSED_EVENT_TYPE,
  SALE_CORRECTED_EVENT_TYPE,
  SALE_FINALIZED_EVENT_TYPE,
  SALE_REVERSED_EVENT_TYPE,
  TRADER_BILL_ISSUED_EVENT_TYPE,
  syncFarmerBillIssuedV2PayloadSchema,
  syncOpeningBalanceCorrectedV2PayloadSchema,
  syncOpeningBalancePostedV2PayloadSchema,
  syncPaymentAllocationCreatedV2PayloadSchema,
  syncPaymentPostedV2PayloadSchema,
  syncPaymentReversedV2PayloadSchema,
  syncSaleCorrectedV2PayloadSchema,
  syncSaleFinalizedV2PayloadSchema,
  syncSaleReversedV2PayloadSchema,
  syncTraderBillIssuedV2PayloadSchema,
  type SyncIngestEvent,
} from "@polivo/contracts";

type SchemaLike = {
  safeParse: (data: unknown) => {
    success: boolean;
    error?: { issues: Array<{ message: string; path: PropertyKey[] }> };
  };
};

const FINANCIAL_V2_SCHEMAS: Record<string, SchemaLike> = {
  [SALE_FINALIZED_EVENT_TYPE]: syncSaleFinalizedV2PayloadSchema,
  [TRADER_BILL_ISSUED_EVENT_TYPE]: syncTraderBillIssuedV2PayloadSchema,
  [FARMER_BILL_ISSUED_EVENT_TYPE]: syncFarmerBillIssuedV2PayloadSchema,
  [PAYMENT_POSTED_EVENT_TYPE]: syncPaymentPostedV2PayloadSchema,
  [PAYMENT_ALLOCATION_CREATED_EVENT_TYPE]: syncPaymentAllocationCreatedV2PayloadSchema,
  [PAYMENT_REVERSED_EVENT_TYPE]: syncPaymentReversedV2PayloadSchema,
  [SALE_REVERSED_EVENT_TYPE]: syncSaleReversedV2PayloadSchema,
  [SALE_CORRECTED_EVENT_TYPE]: syncSaleCorrectedV2PayloadSchema,
  [OPENING_BALANCE_POSTED_EVENT_TYPE]: syncOpeningBalancePostedV2PayloadSchema,
  [OPENING_BALANCE_CORRECTED_EVENT_TYPE]: syncOpeningBalanceCorrectedV2PayloadSchema,
};

/**
 * Fail-fast local check using the same contracts schemas as cloud ingest.
 * Returns a short diagnostic message, or null when valid.
 */
export function validateEnrichedIngestEvent(event: SyncIngestEvent): string | null {
  if (event.eventSchemaVersion !== "2") {
    return null;
  }
  const schema = FINANCIAL_V2_SCHEMAS[event.eventType];
  if (!schema) {
    return null;
  }
  const parsed = schema.safeParse(event.payload);
  if (parsed.success) {
    return null;
  }
  const first = parsed.error?.issues[0];
  const path = first?.path?.map(String).join(".") ?? "";
  const detail = first?.message ?? "schema mismatch";
  return path.length > 0
    ? `Invalid enriched payload for ${event.eventType} at ${path}: ${detail}`
    : `Invalid enriched payload for ${event.eventType}: ${detail}`;
}
