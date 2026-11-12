import { z } from "zod";

import {
  farmerBillNumberSchema,
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
import { SALE_DRAFT_MAX_LINES, saleCalculationFingerprintSchema } from "./sales-billing.js";

/** Maximum source lines on one farmer bill. */
export const FARMER_BILL_MAX_LINES = SALE_DRAFT_MAX_LINES;

export const farmerBillInclusionStatusSchema = z.enum(["unbilled", "billed"]);
export type FarmerBillInclusionStatus = z.infer<typeof farmerBillInclusionStatusSchema>;

export const farmerBillSelectionFingerprintSchema = saleCalculationFingerprintSchema;

export const farmerSalesSourceLineIdsSchema = z
  .array(opaqueIdSchema)
  .min(1)
  .max(FARMER_BILL_MAX_LINES)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Source line ids must be unique",
  });

export const listFarmerSalesQuerySchema = z.strictObject({
  farmerId: opaqueIdSchema,
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
  businessDateFrom: calendarDateSchema.optional(),
  businessDateTo: calendarDateSchema.optional(),
  vegetableId: opaqueIdSchema.optional(),
  traderId: opaqueIdSchema.optional(),
  inclusionStatus: farmerBillInclusionStatusSchema.optional(),
});
export type ListFarmerSalesQuery = z.infer<typeof listFarmerSalesQuerySchema>;

export const farmerSaleLineRowSchema = z.strictObject({
  saleLineId: opaqueIdSchema,
  saleId: opaqueIdSchema,
  traderBillId: opaqueIdSchema.nullable(),
  traderBillNumber: traderBillNumberSchema.nullable(),
  traderId: opaqueIdSchema,
  traderDisplayName: z.string().min(1).max(200),
  businessDate: calendarDateSchema,
  vegetableId: opaqueIdSchema,
  vegetableCode: z.string().min(1).max(64),
  vegetableDisplayName: z.string().min(1).max(200),
  packageCount: z.number().int().nonnegative(),
  netWeightHundredths: z.number().int().safe().nonnegative(),
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  saleAmountMinor: nonNegativeMoneyMinorSchema,
  commissionAmountMinor: nonNegativeMoneyMinorSchema,
  farmerReceivesMinor: nonNegativeMoneyMinorSchema,
  inclusionStatus: farmerBillInclusionStatusSchema,
  farmerBillId: opaqueIdSchema.nullable(),
  farmerBillNumber: farmerBillNumberSchema.nullable(),
});
export type FarmerSaleLineRowDto = z.infer<typeof farmerSaleLineRowSchema>;

export const farmerSalesSummarySchema = z.strictObject({
  farmerId: opaqueIdSchema,
  matchingLineCount: z.number().int().nonnegative(),
  unbilledLineCount: z.number().int().nonnegative(),
  billedLineCount: z.number().int().nonnegative(),
  totalNetWeightHundredths: z.number().int().safe().nonnegative(),
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
});
export type FarmerSalesSummaryDto = z.infer<typeof farmerSalesSummarySchema>;

export const listFarmerSalesResponseSchema = z.strictObject({
  summary: farmerSalesSummarySchema,
  items: z.array(farmerSaleLineRowSchema),
  nextCursor: paginationCursorSchema.nullable(),
});
export type ListFarmerSalesResponse = z.infer<typeof listFarmerSalesResponseSchema>;

export const farmerBillPreviewRequestSchema = z.strictObject({
  farmerId: opaqueIdSchema,
  sourceLineIds: farmerSalesSourceLineIdsSchema,
  businessDate: calendarDateSchema.optional(),
});
export type FarmerBillPreviewRequest = z.infer<typeof farmerBillPreviewRequestSchema>;

export const farmerBillPreviewLineSchema = z.strictObject({
  saleLineId: opaqueIdSchema,
  saleId: opaqueIdSchema,
  traderBillId: opaqueIdSchema.nullable(),
  traderBillNumber: traderBillNumberSchema.nullable(),
  businessDate: calendarDateSchema,
  vegetableCode: z.string().min(1).max(64),
  vegetableDisplayName: z.string().min(1).max(200),
  packageCount: z.number().int().nonnegative(),
  netWeightHundredths: z.number().int().safe().nonnegative(),
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  saleAmountMinor: nonNegativeMoneyMinorSchema,
  commissionAmountMinor: nonNegativeMoneyMinorSchema,
  farmerReceivesMinor: nonNegativeMoneyMinorSchema,
  commissionPolicyId: opaqueIdSchema.nullable(),
  commissionVersionId: opaqueIdSchema.nullable(),
  commissionBandId: opaqueIdSchema.nullable(),
  appliedCommissionRatePerKgMinor: nonNegativeMoneyMinorSchema.nullable(),
  salePostingId: opaqueIdSchema.nullable(),
});
export type FarmerBillPreviewLineDto = z.infer<typeof farmerBillPreviewLineSchema>;

export const farmerBillPreviewResponseSchema = z.strictObject({
  farmerId: opaqueIdSchema,
  farmerShortCode: z.string().min(1).max(32),
  farmerDisplayName: z.string().min(1).max(200),
  businessDate: calendarDateSchema,
  selectionFingerprint: farmerBillSelectionFingerprintSchema,
  lines: z.array(farmerBillPreviewLineSchema).max(FARMER_BILL_MAX_LINES),
  lineCount: z.number().int().positive(),
  totalPackageCount: z.number().int().nonnegative(),
  totalNetWeightHundredths: z.number().int().safe().nonnegative(),
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
  currency: z.literal("LKR"),
});
export type FarmerBillPreviewResponse = z.infer<typeof farmerBillPreviewResponseSchema>;

export const issueFarmerBillRequestSchema = z.strictObject({
  farmerId: opaqueIdSchema,
  sourceLineIds: farmerSalesSourceLineIdsSchema,
  businessDate: calendarDateSchema.optional(),
  expectedSelectionFingerprint: farmerBillSelectionFingerprintSchema,
});
export type IssueFarmerBillRequest = z.infer<typeof issueFarmerBillRequestSchema>;

export const farmerBillLineRecordSchema = z.strictObject({
  saleLineId: opaqueIdSchema,
  saleId: opaqueIdSchema,
  lineOrder: z.number().int().positive(),
  traderBillId: opaqueIdSchema.nullable(),
  traderBillNumber: traderBillNumberSchema.nullable(),
  businessDate: calendarDateSchema,
  vegetableId: opaqueIdSchema,
  vegetableCode: z.string().min(1).max(64),
  vegetableDisplayName: z.string().min(1).max(200),
  packageTypeId: opaqueIdSchema.nullable(),
  packageTypeCode: z.string().min(1).max(64).nullable(),
  packageTypeDisplayName: z.string().min(1).max(200).nullable(),
  packageCount: z.number().int().nonnegative(),
  netWeightHundredths: z.number().int().safe().nonnegative(),
  unitPricePerKgMinor: nonNegativeMoneyMinorSchema,
  saleAmountMinor: nonNegativeMoneyMinorSchema,
  commissionAmountMinor: nonNegativeMoneyMinorSchema,
  farmerReceivesMinor: nonNegativeMoneyMinorSchema,
  commissionPolicyId: opaqueIdSchema.nullable(),
  commissionVersionId: opaqueIdSchema.nullable(),
  commissionBandId: opaqueIdSchema.nullable(),
  appliedCommissionRatePerKgMinor: nonNegativeMoneyMinorSchema.nullable(),
  salePostingId: opaqueIdSchema.nullable(),
});
export type FarmerBillLineRecordDto = z.infer<typeof farmerBillLineRecordSchema>;

export const farmerBillRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  stallId: opaqueIdSchema,
  farmerId: opaqueIdSchema,
  farmerShortCode: z.string().min(1).max(32),
  farmerDisplayName: z.string().min(1).max(200),
  billType: z.literal("farmer"),
  billNumber: farmerBillNumberSchema,
  businessDate: calendarDateSchema,
  status: z.literal("finalized"),
  coveredBusinessDateFrom: calendarDateSchema,
  coveredBusinessDateTo: calendarDateSchema,
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
  totalAmountMinor: nonNegativeMoneyMinorSchema,
  currency: z.literal("LKR"),
  paymentStatus: paymentStatusSchema,
  selectionFingerprint: farmerBillSelectionFingerprintSchema,
  lines: z.array(farmerBillLineRecordSchema).max(FARMER_BILL_MAX_LINES),
  finalizedAt: absoluteTimestampSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});
export type FarmerBillRecordDto = z.infer<typeof farmerBillRecordSchema>;

export const issueFarmerBillResponseSchema = z.strictObject({
  farmerBillId: opaqueIdSchema,
  billNumber: farmerBillNumberSchema,
  bill: farmerBillRecordSchema,
});
export type IssueFarmerBillResponse = z.infer<typeof issueFarmerBillResponseSchema>;

export const farmerBillIssuanceOperationResultSchema = issueFarmerBillResponseSchema;
export type FarmerBillIssuanceOperationResult = z.infer<
  typeof farmerBillIssuanceOperationResultSchema
>;

export const listFarmerBillsQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
  farmerId: opaqueIdSchema.optional(),
  billNumber: farmerBillNumberSchema.optional(),
  businessDateFrom: calendarDateSchema.optional(),
  businessDateTo: calendarDateSchema.optional(),
});
export type ListFarmerBillsQuery = z.infer<typeof listFarmerBillsQuerySchema>;

export const farmerBillListItemSchema = z.strictObject({
  id: opaqueIdSchema,
  farmerId: opaqueIdSchema,
  farmerDisplayName: z.string().min(1).max(200),
  billNumber: farmerBillNumberSchema,
  businessDate: calendarDateSchema,
  coveredBusinessDateFrom: calendarDateSchema,
  coveredBusinessDateTo: calendarDateSchema,
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
  paymentStatus: paymentStatusSchema,
  finalizedAt: absoluteTimestampSchema,
});
export type FarmerBillListItemDto = z.infer<typeof farmerBillListItemSchema>;

export const listFarmerBillsResponseSchema =
  createPaginatedResponseSchema(farmerBillListItemSchema);
export type ListFarmerBillsResponse = z.infer<typeof listFarmerBillsResponseSchema>;

export const FARMER_BILL_ISSUED_EVENT_TYPE = "polivo.farmer_bill.issued" as const;
export const FARMER_BILL_ISSUED_EVENT_SCHEMA_VERSION = "1" as const;

export const farmerBillIssuedEventPayloadSchema = z.strictObject({
  farmerBillId: opaqueIdSchema,
  billNumber: farmerBillNumberSchema,
  farmerId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  sourceLineIds: z.array(opaqueIdSchema).min(1).max(FARMER_BILL_MAX_LINES),
  totalSaleAmountMinor: nonNegativeMoneyMinorSchema,
  totalCommissionMinor: nonNegativeMoneyMinorSchema,
  totalFarmerReceivesMinor: nonNegativeMoneyMinorSchema,
  currency: z.literal("LKR"),
  selectionFingerprint: farmerBillSelectionFingerprintSchema,
  salePostingIds: z.array(opaqueIdSchema).max(FARMER_BILL_MAX_LINES),
  lineCount: z.number().int().positive(),
});
export type FarmerBillIssuedEventPayload = z.infer<typeof farmerBillIssuedEventPayloadSchema>;
