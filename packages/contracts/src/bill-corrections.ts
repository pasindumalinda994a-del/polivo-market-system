import { z } from "zod";

import { nonNegativeMoneyMinorSchema, moneyMinorSchema } from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import { absoluteTimestampSchema, calendarDateSchema, opaqueIdSchema } from "./primitives.js";
import { saleDraftLineInputSchema, saleDraftLinesSchema } from "./sales-billing.js";

export const SALE_CORRECTION_REASON_MAX_LENGTH = 500;

export const saleCorrectionActionSchema = z.enum(["correct", "reverse"]);
export type SaleCorrectionActionDto = z.infer<typeof saleCorrectionActionSchema>;

export const saleCorrectionStatusSchema = z.enum(["active", "reversed", "superseded"]);
export type SaleCorrectionStatusDto = z.infer<typeof saleCorrectionStatusSchema>;

export const saleCorrectionEligibilityCodeSchema = z.enum([
  "allowed",
  "blocked_already_corrected",
  "blocked_superseded",
  "blocked_farmer_bill_inclusion",
  "blocked_payment_allocation",
  "blocked_not_finalized",
  "blocked_inactive_reference",
  "blocked_stale_revision",
  "blocked_unsupported",
]);
export type SaleCorrectionEligibilityCodeDto = z.infer<typeof saleCorrectionEligibilityCodeSchema>;

export const saleCorrectionPreviewFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Preview fingerprint must be a SHA-256 hex digest");

export const saleCorrectionReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(SALE_CORRECTION_REASON_MAX_LENGTH);

export const billHistoryBillTypeSchema = z.enum(["trader", "farmer"]);
export type BillHistoryBillTypeDto = z.infer<typeof billHistoryBillTypeSchema>;

export const listBillHistoryQuerySchema = z.strictObject({
  billType: billHistoryBillTypeSchema.optional(),
  billNumber: z.string().trim().min(1).max(64).optional(),
  partyQuery: z.string().trim().min(1).max(128).optional(),
  businessDateFrom: calendarDateSchema.optional(),
  businessDateTo: calendarDateSchema.optional(),
  issueDateFrom: calendarDateSchema.optional(),
  issueDateTo: calendarDateSchema.optional(),
  documentStatus: z.string().trim().min(1).max(32).optional(),
  correctionPresence: z.enum(["any", "with_correction", "without_correction"]).optional(),
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});
export type ListBillHistoryQuery = z.infer<typeof listBillHistoryQuerySchema>;

export const billHistoryListItemSchema = z.strictObject({
  billType: billHistoryBillTypeSchema,
  billId: opaqueIdSchema,
  billNumber: z.string().min(1),
  partyId: opaqueIdSchema,
  partyCode: z.string().min(1),
  partyDisplayName: z.string().min(1),
  businessDate: calendarDateSchema,
  issuedAt: absoluteTimestampSchema,
  originalAmountMinor: nonNegativeMoneyMinorSchema,
  documentStatus: z.string().min(1),
  correctionStatus: z.enum(["active", "reversed", "superseded", "none"]),
  hasCorrection: z.boolean(),
  saleId: opaqueIdSchema.nullable(),
  replacementBillId: opaqueIdSchema.nullable(),
  paymentStatus: z.string().nullable(),
});
export type BillHistoryListItemDto = z.infer<typeof billHistoryListItemSchema>;

export const listBillHistoryResponseSchema = z.strictObject({
  items: z.array(billHistoryListItemSchema),
  nextCursor: paginationCursorSchema.nullable(),
  totalCount: z.number().int().nonnegative(),
});
export type ListBillHistoryResponse = z.infer<typeof listBillHistoryResponseSchema>;

export const billHistoryActivityItemSchema = z.strictObject({
  kind: z.string().min(1),
  at: absoluteTimestampSchema,
  label: z.string().min(1),
  referenceId: opaqueIdSchema.nullable(),
});

export const billHistoryChainDetailSchema = z.strictObject({
  billType: billHistoryBillTypeSchema,
  billId: opaqueIdSchema,
  billNumber: z.string().min(1),
  saleId: opaqueIdSchema.nullable(),
  originalAmountMinor: nonNegativeMoneyMinorSchema,
  businessDate: calendarDateSchema,
  issuedAt: absoluteTimestampSchema,
  documentStatus: z.string().min(1),
  correctionStatus: z.enum(["active", "reversed", "superseded", "none"]),
  paymentStatus: z.string().nullable(),
  party: z.strictObject({
    id: opaqueIdSchema,
    shortCode: z.string().min(1),
    displayName: z.string().min(1),
  }),
  sourceRevision: z.number().int().positive().nullable(),
  replacementSaleId: opaqueIdSchema.nullable(),
  replacementTraderBillId: opaqueIdSchema.nullable(),
  correctionOperationId: opaqueIdSchema.nullable(),
  reason: z.string().nullable(),
  activity: z.array(billHistoryActivityItemSchema),
  ledgerPostingId: opaqueIdSchema.nullable(),
  reversalPostingId: opaqueIdSchema.nullable(),
  /** Present for trader bills with a linked sale; used as correction baseline. */
  saleLines: z
    .array(
      z.strictObject({
        lineId: opaqueIdSchema,
        farmerId: opaqueIdSchema,
        vegetableId: opaqueIdSchema,
        packageTypeId: opaqueIdSchema,
        unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
        packagingWeightHundredths: z.number().int().safe().nonnegative(),
        notes: z.string().nullable(),
        weights: z.array(
          z.strictObject({
            rowKey: z.string().min(1),
            packageTypeId: opaqueIdSchema.optional(),
            grossWeightHundredths: z.number().int().safe().nonnegative(),
          }),
        ),
      }),
    )
    .optional(),
  traderId: opaqueIdSchema.nullable().optional(),
});
export type BillHistoryChainDetailDto = z.infer<typeof billHistoryChainDetailSchema>;

export const saleCorrectionEligibilityResponseSchema = z.strictObject({
  code: saleCorrectionEligibilityCodeSchema,
  allowed: z.boolean(),
  message: z.string().min(1),
  saleId: opaqueIdSchema.nullable(),
  sourceRevision: z.number().int().positive().nullable(),
  traderBillId: opaqueIdSchema.nullable(),
  farmerBillInclusions: z.array(
    z.strictObject({
      saleLineId: opaqueIdSchema,
      farmerBillId: opaqueIdSchema,
      billNumber: z.string().min(1),
    }),
  ),
  allocationCount: z.number().int().nonnegative(),
});
export type SaleCorrectionEligibilityResponse = z.infer<
  typeof saleCorrectionEligibilityResponseSchema
>;

export const ledgerEffectPreviewSchema = z.strictObject({
  partyKind: z.enum(["farmer", "trader"]),
  partyId: opaqueIdSchema,
  amountMinor: moneyMinorSchema,
  reversesEntryId: opaqueIdSchema.optional(),
});

export const saleCorrectionPreviewRequestSchema = z.strictObject({
  saleId: opaqueIdSchema,
  expectedRevision: z.number().int().positive(),
  action: saleCorrectionActionSchema,
  reason: saleCorrectionReasonSchema,
  replacement: z
    .strictObject({
      traderId: opaqueIdSchema,
      lines: saleDraftLinesSchema.min(1),
    })
    .optional(),
});
export type SaleCorrectionPreviewRequest = z.infer<typeof saleCorrectionPreviewRequestSchema>;

export const saleCorrectionPreviewResponseSchema = z.strictObject({
  action: saleCorrectionActionSchema,
  saleId: opaqueIdSchema,
  sourceRevision: z.number().int().positive(),
  reason: saleCorrectionReasonSchema,
  eligibility: saleCorrectionEligibilityResponseSchema,
  previewFingerprint: saleCorrectionPreviewFingerprintSchema,
  commissionPolicy: z
    .strictObject({
      policyId: opaqueIdSchema,
      versionId: opaqueIdSchema,
      selection: z.literal("original_snapshot"),
    })
    .nullable(),
  originalTotals: z
    .strictObject({
      totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
      totalCommissionMinor: nonNegativeMoneyMinorSchema,
      totalTraderPaysMinor: nonNegativeMoneyMinorSchema,
      totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
    })
    .nullable(),
  proposedTotals: z
    .strictObject({
      totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
      totalCommissionMinor: nonNegativeMoneyMinorSchema,
      totalTraderPaysMinor: nonNegativeMoneyMinorSchema,
      totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
    })
    .nullable(),
  reversalEffects: z.array(ledgerEffectPreviewSchema),
  replacementEffects: z.array(ledgerEffectPreviewSchema),
  affectedDocuments: z.strictObject({
    originalTraderBillId: opaqueIdSchema.nullable(),
    farmerBillBlocked: z.boolean(),
  }),
});
export type SaleCorrectionPreviewResponse = z.infer<typeof saleCorrectionPreviewResponseSchema>;

export const saleCorrectionCommitRequestSchema = z.strictObject({
  saleId: opaqueIdSchema,
  expectedRevision: z.number().int().positive(),
  action: saleCorrectionActionSchema,
  reason: saleCorrectionReasonSchema,
  previewFingerprint: saleCorrectionPreviewFingerprintSchema,
  replacement: z
    .strictObject({
      traderId: opaqueIdSchema,
      lines: saleDraftLinesSchema.min(1),
    })
    .optional(),
});
export type SaleCorrectionCommitRequest = z.infer<typeof saleCorrectionCommitRequestSchema>;

export const saleCorrectionCommitResponseSchema = z.strictObject({
  operationId: opaqueIdSchema,
  action: saleCorrectionActionSchema,
  sourceSaleId: opaqueIdSchema,
  replacementSaleId: opaqueIdSchema.nullable(),
  originalTraderBillId: opaqueIdSchema.nullable(),
  replacementTraderBillId: opaqueIdSchema.nullable(),
  replacementTraderBillNumber: z.string().nullable(),
  reversalPostingId: opaqueIdSchema,
  replacementPostingId: opaqueIdSchema.nullable(),
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  reason: saleCorrectionReasonSchema,
});
export type SaleCorrectionCommitResponse = z.infer<typeof saleCorrectionCommitResponseSchema>;

export const saleCorrectionOperationResultSchema = saleCorrectionCommitResponseSchema;
export type SaleCorrectionOperationResult = z.infer<typeof saleCorrectionOperationResultSchema>;

export const SALE_REVERSED_EVENT_TYPE = "polivo.sale.reversed";
export const SALE_REVERSED_EVENT_SCHEMA_VERSION = "1";
export const SALE_CORRECTED_EVENT_TYPE = "polivo.sale.corrected";
export const SALE_CORRECTED_EVENT_SCHEMA_VERSION = "1";

export const saleReversedEventPayloadSchema = z.strictObject({
  operationId: opaqueIdSchema,
  sourceSaleId: opaqueIdSchema,
  reversalPostingId: opaqueIdSchema,
  originalTraderBillId: opaqueIdSchema.nullable(),
  reason: saleCorrectionReasonSchema,
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
});
export type SaleReversedEventPayload = z.infer<typeof saleReversedEventPayloadSchema>;

export const saleCorrectedEventPayloadSchema = z.strictObject({
  operationId: opaqueIdSchema,
  sourceSaleId: opaqueIdSchema,
  replacementSaleId: opaqueIdSchema,
  reversalPostingId: opaqueIdSchema,
  replacementPostingId: opaqueIdSchema,
  originalTraderBillId: opaqueIdSchema.nullable(),
  replacementTraderBillId: opaqueIdSchema,
  reason: saleCorrectionReasonSchema,
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
});
export type SaleCorrectedEventPayload = z.infer<typeof saleCorrectedEventPayloadSchema>;

/** Re-export for correction line inputs without inventing alternate shapes. */
export { saleDraftLineInputSchema };
