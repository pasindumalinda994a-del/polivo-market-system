import { z } from "zod";

import {
  openingBalanceCorrectedEventPayloadSchema,
  openingBalancePostedEventPayloadSchema,
} from "../accounts.js";
import { commissionPolicyActivatedEventPayloadSchema } from "../commission-policy.js";
import {
  farmerBillIssuedEventPayloadSchema,
  farmerBillLineRecordSchema,
  farmerBillRecordSchema,
} from "../farmer-billing.js";
import {
  moneyMinorSchema,
  nonNegativeMoneyMinorSchema,
  paymentReferenceSchema,
  phase27PaymentMethodSchema,
  traderBillNumberSchema,
} from "../financial.js";
import { absoluteTimestampSchema, calendarDateSchema, opaqueIdSchema } from "../primitives.js";
import {
  paymentAllocationStatusSchema,
  paymentDirectionSchema,
  paymentObligationKindSchema,
  paymentPartyKindSchema,
  paymentPostedEventPayloadSchema,
  paymentRecordStatusSchema,
  paymentReversedEventPayloadSchema,
  PAYMENT_CHEQUE_RECOGNITION_BASIS,
} from "../payments.js";
import {
  printAttemptOutcomeEventPayloadSchema,
  printAttemptPreparedEventPayloadSchema,
  printJobCreatedEventPayloadSchema,
} from "../printing.js";
import {
  finalizedSaleLineSchema,
  saleFinalizedEventPayloadSchema,
  traderBillRecordSchema,
} from "../sales-billing.js";
import {
  saleCorrectedEventPayloadSchema,
  saleReversedEventPayloadSchema,
} from "../bill-corrections.js";

/**
 * Ingestion schema version "2" payloads carry nested immutable snapshots
 * required for cloud reporting projection. Local thin outbox "1" summaries
 * for these event types are rejected until Phase 32 emits or enriches to v2.
 */

export const SYNC_FINANCIAL_APPLY_SCHEMA_VERSION = "2" as const;

export const syncLedgerEntrySnapshotSchema = z.strictObject({
  id: opaqueIdSchema,
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  amountMinor: moneyMinorSchema,
  currency: z.literal("LKR"),
  postingSequence: z.number().int().positive(),
  reversesEntryId: opaqueIdSchema.nullable(),
});

export const syncLedgerPostingSnapshotSchema = z.strictObject({
  id: opaqueIdSchema,
  sourceType: z.string().min(1).max(64),
  sourceId: opaqueIdSchema,
  financialEventType: z.string().min(1).max(64),
  eventSequence: z.number().int().positive(),
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  actorStaffId: opaqueIdSchema.nullable(),
  description: z.string().max(500).nullable(),
  currency: z.literal("LKR"),
  entries: z.array(syncLedgerEntrySnapshotSchema).min(1).max(32),
});

export type SyncLedgerPostingSnapshot = z.infer<typeof syncLedgerPostingSnapshotSchema>;

export const syncSaleLinePackageWeightSchema = z.strictObject({
  id: opaqueIdSchema,
  saleLineId: opaqueIdSchema,
  packageIndex: z.number().int().positive(),
  grossWeightHundredths: z.number().int().safe().nonnegative(),
});

export const syncSaleFarmerAllocationSchema = z.strictObject({
  id: opaqueIdSchema,
  saleLineId: opaqueIdSchema,
  farmerId: opaqueIdSchema,
  allocatedNetWeightHundredths: z.number().int().safe().nonnegative(),
});

export const syncSaleFinalizedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: saleFinalizedEventPayloadSchema,
  sale: z.strictObject({
    id: opaqueIdSchema,
    traderId: opaqueIdSchema,
    businessDate: calendarDateSchema,
    status: z.literal("finalized"),
    revision: z.number().int().positive(),
    correctsSaleId: opaqueIdSchema.nullable(),
    finalizedAt: absoluteTimestampSchema,
    createdAt: absoluteTimestampSchema,
    updatedAt: absoluteTimestampSchema,
  }),
  lines: z.array(finalizedSaleLineSchema).min(1).max(200),
  packageWeights: z.array(syncSaleLinePackageWeightSchema).max(2_000),
  farmerAllocations: z.array(syncSaleFarmerAllocationSchema).max(500),
  traderBill: traderBillRecordSchema,
  ledgerPosting: syncLedgerPostingSnapshotSchema,
});

export type SyncSaleFinalizedV2Payload = z.infer<typeof syncSaleFinalizedV2PayloadSchema>;

/** Trader bill issued v2 reuses the same complete sale projection (no double money). */
export const syncTraderBillIssuedV2PayloadSchema = syncSaleFinalizedV2PayloadSchema;
export type SyncTraderBillIssuedV2Payload = SyncSaleFinalizedV2Payload;

export const syncFarmerBillIssuedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: farmerBillIssuedEventPayloadSchema,
  bill: farmerBillRecordSchema,
  lines: z.array(farmerBillLineRecordSchema).min(1).max(500),
});

export type SyncFarmerBillIssuedV2Payload = z.infer<typeof syncFarmerBillIssuedV2PayloadSchema>;

export const syncPaymentAllocationRowSchema = z.strictObject({
  id: opaqueIdSchema,
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  appliedAmountMinor: z.number().int().safe().positive(),
  status: paymentAllocationStatusSchema,
  farmerBillId: opaqueIdSchema.nullable(),
  traderBillId: opaqueIdSchema.nullable(),
  saleLineId: opaqueIdSchema.nullable(),
  openingDraftId: opaqueIdSchema.nullable(),
  createdAt: absoluteTimestampSchema,
});

export const syncPaymentPostedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: paymentPostedEventPayloadSchema,
  payment: z.strictObject({
    id: opaqueIdSchema,
    referenceNumber: paymentReferenceSchema,
    partyKind: paymentPartyKindSchema,
    partyId: opaqueIdSchema,
    direction: paymentDirectionSchema,
    method: phase27PaymentMethodSchema,
    amountMinor: z.number().int().safe().positive(),
    currency: z.literal("LKR"),
    businessDate: calendarDateSchema,
    recordedAt: absoluteTimestampSchema,
    status: paymentRecordStatusSchema,
    bankTransferReference: z.string().nullable(),
    bankTransferDate: calendarDateSchema.nullable(),
    bankAccountLabel: z.string().nullable(),
    chequeNumber: z.string().nullable(),
    issuingBankLabel: z.string().nullable(),
    chequeDate: calendarDateSchema.nullable(),
    physicalHandoverDate: calendarDateSchema.nullable(),
    recognitionBasis: z.literal(PAYMENT_CHEQUE_RECOGNITION_BASIS).nullable(),
  }),
  allocations: z.array(syncPaymentAllocationRowSchema).max(200),
  ledgerPosting: syncLedgerPostingSnapshotSchema,
});

export type SyncPaymentPostedV2Payload = z.infer<typeof syncPaymentPostedV2PayloadSchema>;

export const syncPaymentAllocationCreatedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  paymentId: opaqueIdSchema,
  allocations: z.array(syncPaymentAllocationRowSchema).min(1).max(200),
  representsCashMovement: z.literal(false),
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  actorStaffId: opaqueIdSchema,
  recordedAt: absoluteTimestampSchema,
});

export type SyncPaymentAllocationCreatedV2Payload = z.infer<
  typeof syncPaymentAllocationCreatedV2PayloadSchema
>;

export const syncPaymentReversedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: paymentReversedEventPayloadSchema,
  originalPaymentStatus: z.literal("reversed"),
  reversalPayment: syncPaymentPostedV2PayloadSchema.shape.payment,
  ledgerPosting: syncLedgerPostingSnapshotSchema,
});

export type SyncPaymentReversedV2Payload = z.infer<typeof syncPaymentReversedV2PayloadSchema>;

export const syncSaleReversedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: saleReversedEventPayloadSchema,
  sourceSaleId: opaqueIdSchema,
  sourceTraderBillId: opaqueIdSchema.nullable(),
  sourceBillNumber: traderBillNumberSchema.nullable(),
  reversalLedgerPosting: syncLedgerPostingSnapshotSchema,
});

export type SyncSaleReversedV2Payload = z.infer<typeof syncSaleReversedV2PayloadSchema>;

export const syncSaleCorrectedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: saleCorrectedEventPayloadSchema,
  reversalLedgerPosting: syncLedgerPostingSnapshotSchema,
  replacement: syncSaleFinalizedV2PayloadSchema,
});

export type SyncSaleCorrectedV2Payload = z.infer<typeof syncSaleCorrectedV2PayloadSchema>;

export const syncOpeningBalancePostedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: openingBalancePostedEventPayloadSchema,
  ledgerPosting: syncLedgerPostingSnapshotSchema.nullable(),
  partyAccount: z.strictObject({
    partyKind: paymentPartyKindSchema,
    partyId: opaqueIdSchema,
    openingStatus: z.enum(["opened", "opened_zero"]),
    openingCutoffDate: calendarDateSchema,
    openingCompletedAt: absoluteTimestampSchema,
    openingDraftId: opaqueIdSchema.nullable(),
    openingPostingId: opaqueIdSchema.nullable(),
  }),
});

export type SyncOpeningBalancePostedV2Payload = z.infer<
  typeof syncOpeningBalancePostedV2PayloadSchema
>;

export const syncOpeningBalanceCorrectedV2PayloadSchema = z.strictObject({
  schemaVersion: z.literal(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION),
  summary: openingBalanceCorrectedEventPayloadSchema,
  reversalLedgerPosting: syncLedgerPostingSnapshotSchema.nullable(),
  replacementLedgerPosting: syncLedgerPostingSnapshotSchema.nullable(),
});

export type SyncOpeningBalanceCorrectedV2Payload = z.infer<
  typeof syncOpeningBalanceCorrectedV2PayloadSchema
>;

/** Re-export operational payloads retained at schema version "1". */
export {
  commissionPolicyActivatedEventPayloadSchema,
  printJobCreatedEventPayloadSchema,
  printAttemptPreparedEventPayloadSchema,
  printAttemptOutcomeEventPayloadSchema,
};
