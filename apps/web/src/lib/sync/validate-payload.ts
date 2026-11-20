import {
  BUYER_CREATED_EVENT_TYPE,
  BUYER_STATUS_CHANGED_EVENT_TYPE,
  BUYER_UPDATED_EVENT_TYPE,
  COMMISSION_POLICY_ACTIVATED_EVENT_TYPE,
  FARMER_CREATED_EVENT_TYPE,
  FARMER_STATUS_CHANGED_EVENT_TYPE,
  FARMER_UPDATED_EVENT_TYPE,
  OPENING_BALANCE_CORRECTED_EVENT_TYPE,
  OPENING_BALANCE_POSTED_EVENT_TYPE,
  PACKAGE_TYPE_CREATED_EVENT_TYPE,
  PACKAGE_TYPE_STATUS_CHANGED_EVENT_TYPE,
  PACKAGE_TYPE_UPDATED_EVENT_TYPE,
  PAYMENT_ALLOCATION_CREATED_EVENT_TYPE,
  PAYMENT_POSTED_EVENT_TYPE,
  PAYMENT_REVERSED_EVENT_TYPE,
  PRINT_ATTEMPT_OUTCOME_EVENT_TYPE,
  PRINT_ATTEMPT_PREPARED_EVENT_TYPE,
  PRINT_JOB_CREATED_EVENT_TYPE,
  SALE_CORRECTED_EVENT_TYPE,
  SALE_FINALIZED_EVENT_TYPE,
  SALE_REVERSED_EVENT_TYPE,
  TRADER_BILL_ISSUED_EVENT_TYPE,
  VEGETABLE_CREATED_EVENT_TYPE,
  VEGETABLE_STATUS_CHANGED_EVENT_TYPE,
  VEGETABLE_UPDATED_EVENT_TYPE,
  buyerSnapshotEventPayloadSchema,
  commissionPolicyActivatedEventPayloadSchema,
  farmerSnapshotEventPayloadSchema,
  openingBalanceCorrectedEventPayloadSchema,
  openingBalancePostedEventPayloadSchema,
  packageTypeSnapshotEventPayloadSchema,
  printAttemptOutcomeEventPayloadSchema,
  printAttemptPreparedEventPayloadSchema,
  printJobCreatedEventPayloadSchema,
  syncFarmerBillIssuedV2PayloadSchema,
  syncOpeningBalanceCorrectedV2PayloadSchema,
  syncOpeningBalancePostedV2PayloadSchema,
  syncPaymentAllocationCreatedV2PayloadSchema,
  syncPaymentPostedV2PayloadSchema,
  syncPaymentReversedV2PayloadSchema,
  syncSaleCorrectedV2PayloadSchema,
  syncSaleFinalizedV2PayloadSchema,
  syncSaleReversedV2PayloadSchema,
  vegetableSnapshotEventPayloadSchema,
  FARMER_BILL_ISSUED_EVENT_TYPE,
  type SyncIngestEvent,
} from "@polivo/contracts";

type SchemaLike = {
  safeParse: (data: unknown) => { success: boolean; error?: { issues: unknown[] } };
};

const MASTER_DATA_V1: Record<string, SchemaLike> = {
  [FARMER_CREATED_EVENT_TYPE]: farmerSnapshotEventPayloadSchema,
  [FARMER_UPDATED_EVENT_TYPE]: farmerSnapshotEventPayloadSchema,
  [FARMER_STATUS_CHANGED_EVENT_TYPE]: farmerSnapshotEventPayloadSchema,
  [BUYER_CREATED_EVENT_TYPE]: buyerSnapshotEventPayloadSchema,
  [BUYER_UPDATED_EVENT_TYPE]: buyerSnapshotEventPayloadSchema,
  [BUYER_STATUS_CHANGED_EVENT_TYPE]: buyerSnapshotEventPayloadSchema,
  [VEGETABLE_CREATED_EVENT_TYPE]: vegetableSnapshotEventPayloadSchema,
  [VEGETABLE_UPDATED_EVENT_TYPE]: vegetableSnapshotEventPayloadSchema,
  [VEGETABLE_STATUS_CHANGED_EVENT_TYPE]: vegetableSnapshotEventPayloadSchema,
  [PACKAGE_TYPE_CREATED_EVENT_TYPE]: packageTypeSnapshotEventPayloadSchema,
  [PACKAGE_TYPE_UPDATED_EVENT_TYPE]: packageTypeSnapshotEventPayloadSchema,
  [PACKAGE_TYPE_STATUS_CHANGED_EVENT_TYPE]: packageTypeSnapshotEventPayloadSchema,
  [COMMISSION_POLICY_ACTIVATED_EVENT_TYPE]: commissionPolicyActivatedEventPayloadSchema,
  [PRINT_JOB_CREATED_EVENT_TYPE]: printJobCreatedEventPayloadSchema,
  [PRINT_ATTEMPT_PREPARED_EVENT_TYPE]: printAttemptPreparedEventPayloadSchema,
  [PRINT_ATTEMPT_OUTCOME_EVENT_TYPE]: printAttemptOutcomeEventPayloadSchema,
};

const FINANCIAL_V2: Record<string, SchemaLike> = {
  [SALE_FINALIZED_EVENT_TYPE]: syncSaleFinalizedV2PayloadSchema,
  [TRADER_BILL_ISSUED_EVENT_TYPE]: syncSaleFinalizedV2PayloadSchema,
  [FARMER_BILL_ISSUED_EVENT_TYPE]: syncFarmerBillIssuedV2PayloadSchema,
  [PAYMENT_POSTED_EVENT_TYPE]: syncPaymentPostedV2PayloadSchema,
  [PAYMENT_ALLOCATION_CREATED_EVENT_TYPE]: syncPaymentAllocationCreatedV2PayloadSchema,
  [PAYMENT_REVERSED_EVENT_TYPE]: syncPaymentReversedV2PayloadSchema,
  [SALE_REVERSED_EVENT_TYPE]: syncSaleReversedV2PayloadSchema,
  [SALE_CORRECTED_EVENT_TYPE]: syncSaleCorrectedV2PayloadSchema,
};

export type PayloadValidationFailure = {
  code: "unsupported_event_version" | "validation_failure";
  message: string;
};

export function validateIngestEventPayload(
  event: SyncIngestEvent,
): PayloadValidationFailure | null {
  const master = MASTER_DATA_V1[event.eventType];
  if (master) {
    if (event.eventSchemaVersion !== "1") {
      return {
        code: "unsupported_event_version",
        message: `Event ${event.eventType} version ${event.eventSchemaVersion} is not supported.`,
      };
    }
    const parsed = master.safeParse(event.payload);
    if (!parsed.success) {
      return { code: "validation_failure", message: `Invalid payload for ${event.eventType}.` };
    }
    return null;
  }

  if (
    event.eventType === OPENING_BALANCE_POSTED_EVENT_TYPE ||
    event.eventType === OPENING_BALANCE_CORRECTED_EVENT_TYPE
  ) {
    if (event.eventSchemaVersion === "2") {
      const schema =
        event.eventType === OPENING_BALANCE_POSTED_EVENT_TYPE
          ? syncOpeningBalancePostedV2PayloadSchema
          : syncOpeningBalanceCorrectedV2PayloadSchema;
      if (!schema.safeParse(event.payload).success) {
        return { code: "validation_failure", message: `Invalid payload for ${event.eventType}.` };
      }
      return null;
    }
    if (event.eventSchemaVersion === "1") {
      const schema =
        event.eventType === OPENING_BALANCE_POSTED_EVENT_TYPE
          ? openingBalancePostedEventPayloadSchema
          : openingBalanceCorrectedEventPayloadSchema;
      if (!schema.safeParse(event.payload).success) {
        return { code: "validation_failure", message: `Invalid payload for ${event.eventType}.` };
      }
      return null;
    }
    return {
      code: "unsupported_event_version",
      message: `Event ${event.eventType} version ${event.eventSchemaVersion} is not supported.`,
    };
  }

  const financial = FINANCIAL_V2[event.eventType];
  if (financial) {
    if (event.eventSchemaVersion !== "2") {
      return {
        code: "unsupported_event_version",
        message: `Event ${event.eventType} requires ingestion schema version 2 (received ${event.eventSchemaVersion}).`,
      };
    }
    if (!financial.safeParse(event.payload).success) {
      return { code: "validation_failure", message: `Invalid payload for ${event.eventType}.` };
    }
    return null;
  }

  return {
    code: "unsupported_event_version",
    message: `Unknown event type ${event.eventType}.`,
  };
}
