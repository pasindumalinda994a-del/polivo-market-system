import { z } from "zod";

import {
  nonNegativeMoneyMinorSchema,
  paymentStatusSchema,
  traderBillNumberSchema,
} from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  createPaginatedResponseSchema,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import { absoluteTimestampSchema, calendarDateSchema, opaqueIdSchema } from "./primitives.js";
import {
  PACKAGE_WEIGHT_ENTRY_MAX_ROWS,
  packageWeightEntryInputSchema,
  validatedPackageWeightRowSchema,
} from "./weight-entry.js";

/** Technical bound for sale lines on one draft. */
export const SALE_DRAFT_MAX_LINES = 100;

/** Technical bound for optional line notes. */
export const SALE_LINE_NOTES_MAX_LENGTH = 500;

/** SHA-256 hex fingerprint of an authoritative calculation review. */
export const saleCalculationFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Calculation fingerprint must be a SHA-256 hex digest");

export const saleRevisionSchema = z.number().int().positive();

export const saleStatusSchema = z.enum(["draft", "finalized", "cancelled"]);
export type SaleStatusDto = z.infer<typeof saleStatusSchema>;

export const saleLineNotesSchema = z.string().trim().min(1).max(SALE_LINE_NOTES_MAX_LENGTH);

export const saleDraftLineInputSchema = z.strictObject({
  /** Optional stable line id; server allocates when omitted on create/replace. */
  lineId: opaqueIdSchema.optional(),
  farmerId: opaqueIdSchema,
  vegetableId: opaqueIdSchema,
  packageTypeId: opaqueIdSchema,
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  weights: packageWeightEntryInputSchema,
  notes: saleLineNotesSchema.nullable().optional(),
});
export type SaleDraftLineInput = z.infer<typeof saleDraftLineInputSchema>;

export const saleDraftLinesSchema = z
  .array(saleDraftLineInputSchema)
  .max(SALE_DRAFT_MAX_LINES)
  .refine(
    (lines) => {
      const ids = lines
        .map((line) => line.lineId)
        .filter((id): id is string => typeof id === "string");
      return new Set(ids).size === ids.length;
    },
    { message: "Line ids must be unique within a draft" },
  );

export const createSaleDraftRequestSchema = z.strictObject({
  traderId: opaqueIdSchema,
  businessDate: calendarDateSchema.optional(),
  lines: saleDraftLinesSchema.default([]),
});
export type CreateSaleDraftRequest = z.infer<typeof createSaleDraftRequestSchema>;

export const updateSaleDraftRequestSchema = z.strictObject({
  expectedRevision: saleRevisionSchema,
  traderId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  lines: saleDraftLinesSchema,
});
export type UpdateSaleDraftRequest = z.infer<typeof updateSaleDraftRequestSchema>;

export const abandonSaleDraftRequestSchema = z.strictObject({
  expectedRevision: saleRevisionSchema,
});
export type AbandonSaleDraftRequest = z.infer<typeof abandonSaleDraftRequestSchema>;

export const saleDraftWeightRowSchema = validatedPackageWeightRowSchema;

export const saleDraftLineRecordSchema = z.strictObject({
  lineId: opaqueIdSchema,
  lineOrder: z.number().int().positive(),
  farmerId: opaqueIdSchema,
  vegetableId: opaqueIdSchema,
  packageTypeId: opaqueIdSchema,
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  packagingWeightHundredths: z.number().int().safe().nonnegative(),
  weights: z.array(saleDraftWeightRowSchema).max(PACKAGE_WEIGHT_ENTRY_MAX_ROWS),
  notes: saleLineNotesSchema.nullable(),
});
export type SaleDraftLineRecordDto = z.infer<typeof saleDraftLineRecordSchema>;

export const saleDraftRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  stallId: opaqueIdSchema,
  traderId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  status: z.literal("draft"),
  revision: saleRevisionSchema,
  lines: z.array(saleDraftLineRecordSchema).max(SALE_DRAFT_MAX_LINES),
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});
export type SaleDraftRecordDto = z.infer<typeof saleDraftRecordSchema>;

export const saleDraftListItemSchema = z.strictObject({
  id: opaqueIdSchema,
  traderId: opaqueIdSchema,
  traderDisplayName: z.string().min(1).max(200),
  businessDate: calendarDateSchema,
  status: z.literal("draft"),
  revision: saleRevisionSchema,
  lineCount: z.number().int().nonnegative(),
  updatedAt: absoluteTimestampSchema,
});
export type SaleDraftListItemDto = z.infer<typeof saleDraftListItemSchema>;

export const listSaleDraftsQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
  traderId: opaqueIdSchema.optional(),
});
export type ListSaleDraftsQuery = z.infer<typeof listSaleDraftsQuerySchema>;

export const listSaleDraftsResponseSchema = createPaginatedResponseSchema(saleDraftListItemSchema);
export type ListSaleDraftsResponse = z.infer<typeof listSaleDraftsResponseSchema>;

export const saleCalculationIssueSchema = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(500),
  lineIndex: z.number().int().nonnegative().optional(),
});
export type SaleCalculationIssueDto = z.infer<typeof saleCalculationIssueSchema>;

export const salePreviewLineBreakdownSchema = z.strictObject({
  lineId: opaqueIdSchema,
  farmerId: opaqueIdSchema,
  vegetableId: opaqueIdSchema,
  packageTypeId: opaqueIdSchema,
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  grossWeightHundredths: z.number().int().safe().nonnegative(),
  packagingWeightHundredths: z.number().int().safe().nonnegative(),
  netWeightHundredths: z.number().int().safe().nonnegative(),
  saleAmountMinor: nonNegativeMoneyMinorSchema,
  commissionPolicyId: opaqueIdSchema,
  commissionVersionId: opaqueIdSchema,
  commissionBandId: opaqueIdSchema,
  appliedCommissionRatePerKgMinor: nonNegativeMoneyMinorSchema,
  commissionAmountMinor: nonNegativeMoneyMinorSchema,
  traderPaysMinor: nonNegativeMoneyMinorSchema,
  farmerReceivesBeforeDeductionsMinor: nonNegativeMoneyMinorSchema,
});
export type SalePreviewLineBreakdownDto = z.infer<typeof salePreviewLineBreakdownSchema>;

export const salePreviewResponseSchema = z.strictObject({
  saleId: opaqueIdSchema,
  draftRevision: saleRevisionSchema,
  traderId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  commissionPolicyId: opaqueIdSchema.nullable(),
  commissionVersionId: opaqueIdSchema.nullable(),
  calculationFingerprint: saleCalculationFingerprintSchema.nullable(),
  readyToFinalize: z.boolean(),
  issues: z.array(saleCalculationIssueSchema).max(200),
  lines: z.array(salePreviewLineBreakdownSchema).max(SALE_DRAFT_MAX_LINES),
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema.nullable(),
  totalCommissionMinor: nonNegativeMoneyMinorSchema.nullable(),
  totalTraderPaysMinor: nonNegativeMoneyMinorSchema.nullable(),
  totalFarmerReceivesBeforeDeductionsMinor: nonNegativeMoneyMinorSchema.nullable(),
});
export type SalePreviewResponse = z.infer<typeof salePreviewResponseSchema>;

export const finalizeSaleRequestSchema = z.strictObject({
  expectedRevision: saleRevisionSchema,
  expectedCalculationFingerprint: saleCalculationFingerprintSchema,
});
export type FinalizeSaleRequest = z.infer<typeof finalizeSaleRequestSchema>;

export const finalizedSaleLineSchema = z.strictObject({
  lineId: opaqueIdSchema,
  lineOrder: z.number().int().positive(),
  farmerId: opaqueIdSchema,
  farmerShortCode: z.string().min(1).max(32),
  farmerDisplayName: z.string().min(1).max(200),
  vegetableId: opaqueIdSchema,
  vegetableCode: z.string().min(1).max(64),
  vegetableDisplayName: z.string().min(1).max(200),
  packageTypeId: opaqueIdSchema,
  packageTypeCode: z.string().min(1).max(64),
  packageTypeDisplayName: z.string().min(1).max(200),
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  packagingWeightHundredths: z.number().int().safe().nonnegative(),
  weights: z.array(saleDraftWeightRowSchema).max(PACKAGE_WEIGHT_ENTRY_MAX_ROWS),
  grossWeightHundredths: z.number().int().safe().nonnegative(),
  netWeightHundredths: z.number().int().safe().nonnegative(),
  saleAmountMinor: nonNegativeMoneyMinorSchema,
  commissionPolicyId: opaqueIdSchema,
  commissionVersionId: opaqueIdSchema,
  commissionBandId: opaqueIdSchema,
  appliedCommissionRatePerKgMinor: nonNegativeMoneyMinorSchema,
  commissionAmountMinor: nonNegativeMoneyMinorSchema,
  traderPaysMinor: nonNegativeMoneyMinorSchema,
  farmerReceivesBeforeDeductionsMinor: nonNegativeMoneyMinorSchema,
  notes: saleLineNotesSchema.nullable(),
});
export type FinalizedSaleLineDto = z.infer<typeof finalizedSaleLineSchema>;

export const traderBillRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  stallId: opaqueIdSchema,
  saleId: opaqueIdSchema,
  traderId: opaqueIdSchema,
  traderShortCode: z.string().min(1).max(32),
  traderDisplayName: z.string().min(1).max(200),
  billType: z.literal("trader"),
  billNumber: traderBillNumberSchema,
  businessDate: calendarDateSchema,
  status: z.literal("finalized"),
  totalAmountMinor: nonNegativeMoneyMinorSchema,
  paymentStatus: paymentStatusSchema,
  commissionPolicyId: opaqueIdSchema,
  commissionVersionId: opaqueIdSchema,
  calculationFingerprint: saleCalculationFingerprintSchema,
  lines: z.array(finalizedSaleLineSchema).max(SALE_DRAFT_MAX_LINES),
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesBeforeDeductionsMinor: nonNegativeMoneyMinorSchema,
  postingId: opaqueIdSchema,
  finalizedAt: absoluteTimestampSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});
export type TraderBillRecordDto = z.infer<typeof traderBillRecordSchema>;

export const finalizeSaleResponseSchema = z.strictObject({
  saleId: opaqueIdSchema,
  traderBillId: opaqueIdSchema,
  billNumber: traderBillNumberSchema,
  postingId: opaqueIdSchema,
  bill: traderBillRecordSchema,
});
export type FinalizeSaleResponse = z.infer<typeof finalizeSaleResponseSchema>;

export const saleFinalizationOperationResultSchema = finalizeSaleResponseSchema;
export type SaleFinalizationOperationResult = z.infer<typeof saleFinalizationOperationResultSchema>;

export const listTraderBillsQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
  traderId: opaqueIdSchema.optional(),
  businessDateFrom: calendarDateSchema.optional(),
  businessDateTo: calendarDateSchema.optional(),
});
export type ListTraderBillsQuery = z.infer<typeof listTraderBillsQuerySchema>;

export const traderBillListItemSchema = z.strictObject({
  id: opaqueIdSchema,
  saleId: opaqueIdSchema,
  traderId: opaqueIdSchema,
  traderDisplayName: z.string().min(1).max(200),
  billNumber: traderBillNumberSchema,
  businessDate: calendarDateSchema,
  totalAmountMinor: nonNegativeMoneyMinorSchema,
  paymentStatus: paymentStatusSchema,
  finalizedAt: absoluteTimestampSchema,
});
export type TraderBillListItemDto = z.infer<typeof traderBillListItemSchema>;

export const listTraderBillsResponseSchema =
  createPaginatedResponseSchema(traderBillListItemSchema);
export type ListTraderBillsResponse = z.infer<typeof listTraderBillsResponseSchema>;

export const SALE_FINALIZED_EVENT_TYPE = "polivo.sale.finalized" as const;
export const SALE_FINALIZED_EVENT_SCHEMA_VERSION = "1" as const;
export const TRADER_BILL_ISSUED_EVENT_TYPE = "polivo.trader_bill.issued" as const;
export const TRADER_BILL_ISSUED_EVENT_SCHEMA_VERSION = "1" as const;

export const saleFinalizedEventPayloadSchema = z.strictObject({
  saleId: opaqueIdSchema,
  traderBillId: opaqueIdSchema,
  billNumber: traderBillNumberSchema,
  traderId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  totalAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  postingId: opaqueIdSchema,
  commissionPolicyId: opaqueIdSchema,
  commissionVersionId: opaqueIdSchema,
  calculationFingerprint: saleCalculationFingerprintSchema,
  lineCount: z.number().int().positive(),
});
export type SaleFinalizedEventPayload = z.infer<typeof saleFinalizedEventPayloadSchema>;

export const traderBillIssuedEventPayloadSchema = saleFinalizedEventPayloadSchema;
export type TraderBillIssuedEventPayload = z.infer<typeof traderBillIssuedEventPayloadSchema>;
