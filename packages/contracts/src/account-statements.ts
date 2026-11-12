import { z } from "zod";

import {
  balanceDirectionLabelSchema,
  ledgerCurrencySchema,
  ledgerPartyKindSchema,
  partyAccountOpeningStatusSchema,
} from "./accounts.js";
import {
  moneyMinorSchema,
  nonNegativeMoneyMinorSchema,
  paymentReferenceSchema,
  phase27PaymentMethodSchema,
} from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import {
  absoluteTimestampSchema,
  calendarDateSchema,
  opaqueIdSchema,
} from "./primitives.js";
import { billSettlementSummarySchema, paymentObligationKindSchema } from "./payments.js";

/** Statement view-model version for later print/export consumers. */
export const ACCOUNT_STATEMENT_VIEW_MODEL_VERSION = "1" as const;

export const STATEMENT_SNAPSHOT_TOKEN_MAX_LENGTH = 2048;
export const statementSnapshotTokenSchema = z
  .string()
  .min(1)
  .max(STATEMENT_SNAPSHOT_TOKEN_MAX_LENGTH);

export const statementDateBasisSchema = z.literal("business_effective");
export type StatementDateBasisDto = z.infer<typeof statementDateBasisSchema>;

export const statementCorrectionStatusSchema = z.enum([
  "active",
  "reversed",
  "replaced",
  "none",
]);
export type StatementCorrectionStatusDto = z.infer<typeof statementCorrectionStatusSchema>;

export const statementSettlementStatusSchema = z.enum([
  "unpaid",
  "partial",
  "paid",
  "not_applicable",
]);
export type StatementSettlementStatusDto = z.infer<typeof statementSettlementStatusSchema>;

export const statementBillKindSchema = z.enum(["trader_bill", "farmer_bill"]);
export type StatementBillKindDto = z.infer<typeof statementBillKindSchema>;

export const reportingSnapshotMetadataSchema = z.strictObject({
  snapshotToken: statementSnapshotTokenSchema,
  capturedAt: absoluteTimestampSchema,
  expiresAt: absoluteTimestampSchema,
  maxPostingSequence: z.number().int().safe().nonnegative(),
  dateBasis: statementDateBasisSchema,
  businessTimezone: z.literal("UTC"),
});
export type ReportingSnapshotMetadataDto = z.infer<typeof reportingSnapshotMetadataSchema>;

export const accountStatementQuerySchema = z
  .strictObject({
    currency: ledgerCurrencySchema.default("LKR"),
    fromBusinessDate: calendarDateSchema,
    toBusinessDate: calendarDateSchema,
    dateBasis: statementDateBasisSchema.default("business_effective"),
    limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
    cursor: paginationCursorSchema.optional(),
    snapshotToken: statementSnapshotTokenSchema.optional(),
    /** Row search only — does not redefine period financial totals. */
    movementSearch: z.string().trim().max(128).optional(),
    sourceTypeFilter: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => value.fromBusinessDate <= value.toBusinessDate, {
    message: "fromBusinessDate must be on or before toBusinessDate",
    path: ["toBusinessDate"],
  });
export type AccountStatementQuery = z.infer<typeof accountStatementQuerySchema>;

export const accountStatementMovementRowSchema = z.strictObject({
  entryId: opaqueIdSchema,
  postingId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  postingSequence: z.number().int().safe().positive(),
  sourceType: z.string().trim().min(1).max(64),
  sourceId: opaqueIdSchema,
  financialEventType: z.string().trim().min(1).max(64),
  description: z.string().max(500).nullable(),
  documentReference: z.string().max(64).nullable(),
  amountMinor: moneyMinorSchema,
  increaseMinor: nonNegativeMoneyMinorSchema,
  decreaseMinor: nonNegativeMoneyMinorSchema,
  directionLabel: balanceDirectionLabelSchema,
  runningBalanceMinor: moneyMinorSchema,
  runningDirectionLabel: balanceDirectionLabelSchema,
  reversesEntryId: opaqueIdSchema.nullable(),
  reversedByEntryId: opaqueIdSchema.nullable(),
  correctionLineagePostingId: opaqueIdSchema.nullable(),
});
export type AccountStatementMovementRowDto = z.infer<typeof accountStatementMovementRowSchema>;

export const accountStatementHeaderSchema = z.strictObject({
  stallId: opaqueIdSchema,
  tenantId: opaqueIdSchema.nullable(),
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  partyCode: z.string().min(1),
  partyDisplayName: z.string().min(1),
  accountRole: ledgerPartyKindSchema,
  currency: ledgerCurrencySchema,
  fromBusinessDate: calendarDateSchema,
  toBusinessDate: calendarDateSchema,
  dateBasis: statementDateBasisSchema,
  openingStatus: partyAccountOpeningStatusSchema,
  generatedAt: absoluteTimestampSchema,
});
export type AccountStatementHeaderDto = z.infer<typeof accountStatementHeaderSchema>;

export const accountStatementSummarySchema = z.strictObject({
  openingBalanceMinor: moneyMinorSchema,
  openingDirectionLabel: balanceDirectionLabelSchema,
  periodIncreaseMinor: nonNegativeMoneyMinorSchema,
  periodDecreaseMinor: nonNegativeMoneyMinorSchema,
  periodNetMinor: moneyMinorSchema,
  closingBalanceMinor: moneyMinorSchema,
  closingDirectionLabel: balanceDirectionLabelSchema,
  movementCount: z.number().int().nonnegative(),
});
export type AccountStatementSummaryDto = z.infer<typeof accountStatementSummarySchema>;

export const accountStatementResponseSchema = z.strictObject({
  viewModelVersion: z.literal(ACCOUNT_STATEMENT_VIEW_MODEL_VERSION),
  header: accountStatementHeaderSchema,
  summary: accountStatementSummarySchema,
  balanceBeforePageMinor: moneyMinorSchema,
  items: z.array(accountStatementMovementRowSchema),
  nextCursor: paginationCursorSchema.nullable(),
  snapshot: reportingSnapshotMetadataSchema,
  /** True when movementSearch/sourceTypeFilter is narrowing displayed rows only. */
  rowFilterActive: z.boolean(),
  rowFilterLabel: z.string().nullable(),
});
export type AccountStatementResponse = z.infer<typeof accountStatementResponseSchema>;

/** Stable export-ready view model (full snapshot retrieval; printing deferred). */
export const accountStatementViewModelSchema = z.strictObject({
  viewModelVersion: z.literal(ACCOUNT_STATEMENT_VIEW_MODEL_VERSION),
  header: accountStatementHeaderSchema,
  summary: accountStatementSummarySchema,
  snapshot: reportingSnapshotMetadataSchema,
  orderedRows: z.array(accountStatementMovementRowSchema),
  outstandingRequested: z.boolean(),
});
export type AccountStatementViewModelDto = z.infer<typeof accountStatementViewModelSchema>;

export const accountSummaryQuerySchema = z.strictObject({
  currency: ledgerCurrencySchema.default("LKR"),
  asOfBusinessDate: calendarDateSchema.optional(),
  snapshotToken: statementSnapshotTokenSchema.optional(),
});
export type AccountSummaryQuery = z.infer<typeof accountSummaryQuerySchema>;

export const accountSummaryResponseSchema = z.strictObject({
  stallId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  partyCode: z.string().min(1),
  partyDisplayName: z.string().min(1),
  currency: ledgerCurrencySchema,
  balanceMinor: moneyMinorSchema,
  displayAmountMinor: nonNegativeMoneyMinorSchema,
  directionLabel: balanceDirectionLabelSchema,
  openingStatus: partyAccountOpeningStatusSchema,
  openingCutoffDate: calendarDateSchema.nullable(),
  asOfBusinessDate: calendarDateSchema.nullable(),
  remainingObligationsMinor: nonNegativeMoneyMinorSchema,
  unappliedPaymentsMinor: nonNegativeMoneyMinorSchema,
  reconciliationNetMinor: moneyMinorSchema,
  reconciliationOk: z.boolean(),
  reconciliationDiagnostic: z.string().nullable(),
  snapshot: reportingSnapshotMetadataSchema.nullable(),
});
export type AccountSummaryResponse = z.infer<typeof accountSummaryResponseSchema>;

export const outstandingObligationsQuerySchema = z.strictObject({
  currency: ledgerCurrencySchema.default("LKR"),
  asOfBusinessDate: calendarDateSchema.optional(),
  snapshotToken: statementSnapshotTokenSchema.optional(),
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});
export type OutstandingObligationsQuery = z.infer<typeof outstandingObligationsQuerySchema>;

export const outstandingObligationItemSchema = z.strictObject({
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  sourceDate: calendarDateSchema.nullable(),
  originalAmountMinor: nonNegativeMoneyMinorSchema,
  effectiveAmountMinor: nonNegativeMoneyMinorSchema,
  activeAllocatedMinor: nonNegativeMoneyMinorSchema,
  remainingMinor: nonNegativeMoneyMinorSchema,
  currency: ledgerCurrencySchema,
  relatedBillKind: statementBillKindSchema.nullable(),
  relatedBillId: opaqueIdSchema.nullable(),
  relatedBillNumber: z.string().nullable(),
  correctionStatus: statementCorrectionStatusSchema,
  settlementStatus: statementSettlementStatusSchema,
  label: z.string().min(1),
});
export type OutstandingObligationItemDto = z.infer<typeof outstandingObligationItemSchema>;

export const outstandingObligationsResponseSchema = z.strictObject({
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  currency: ledgerCurrencySchema,
  asOfBusinessDate: calendarDateSchema.nullable(),
  isHistorical: z.boolean(),
  reconstructionBasis: z.enum(["current_status", "effective_and_recording_cutoff"]),
  legacyReleaseTimestampLimitation: z.boolean(),
  remainingObligationsMinor: nonNegativeMoneyMinorSchema,
  unappliedPaymentsMinor: nonNegativeMoneyMinorSchema,
  accountBalanceMinor: moneyMinorSchema,
  reconciliationNetMinor: moneyMinorSchema,
  reconciliationOk: z.boolean(),
  reconciliationDiagnostic: z.string().nullable(),
  items: z.array(outstandingObligationItemSchema),
  nextCursor: paginationCursorSchema.nullable(),
  snapshot: reportingSnapshotMetadataSchema,
});
export type OutstandingObligationsResponse = z.infer<typeof outstandingObligationsResponseSchema>;

export const historicalOutstandingQuerySchema = z.strictObject({
  currency: ledgerCurrencySchema.default("LKR"),
  asOfBusinessDate: calendarDateSchema,
  snapshotToken: statementSnapshotTokenSchema.optional(),
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});
export type HistoricalOutstandingQuery = z.infer<typeof historicalOutstandingQuerySchema>;

export const unappliedPaymentsQuerySchema = z.strictObject({
  currency: ledgerCurrencySchema.default("LKR"),
  asOfBusinessDate: calendarDateSchema.optional(),
  snapshotToken: statementSnapshotTokenSchema.optional(),
  includePaymentMetadata: z.coerce.boolean().default(false),
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});
export type UnappliedPaymentsQuery = z.infer<typeof unappliedPaymentsQuerySchema>;

export const unappliedPaymentItemSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema.nullable(),
  businessDate: calendarDateSchema,
  amountMinor: z.number().int().safe().positive(),
  unappliedAmountMinor: nonNegativeMoneyMinorSchema,
  method: phase27PaymentMethodSchema.nullable(),
  physicalHandoverDate: calendarDateSchema.nullable(),
  chequeNumber: z.string().nullable(),
  metadataRedacted: z.boolean(),
});
export type UnappliedPaymentItemDto = z.infer<typeof unappliedPaymentItemSchema>;

export const unappliedPaymentsResponseSchema = z.strictObject({
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  currency: ledgerCurrencySchema,
  totalUnappliedMinor: nonNegativeMoneyMinorSchema,
  items: z.array(unappliedPaymentItemSchema),
  nextCursor: paginationCursorSchema.nullable(),
  snapshot: reportingSnapshotMetadataSchema,
});
export type UnappliedPaymentsResponse = z.infer<typeof unappliedPaymentsResponseSchema>;

export const billSettlementDetailQuerySchema = z.strictObject({
  billKind: statementBillKindSchema,
  billId: opaqueIdSchema,
  snapshotToken: statementSnapshotTokenSchema.optional(),
});
export type BillSettlementDetailQuery = z.infer<typeof billSettlementDetailQuerySchema>;

export const billSettlementDetailResponseSchema = z.strictObject({
  billKind: statementBillKindSchema,
  billId: opaqueIdSchema,
  billNumber: z.string().nullable(),
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  documentStatus: z.string().min(1),
  correctionStatus: statementCorrectionStatusSchema,
  issuedAmountMinor: nonNegativeMoneyMinorSchema,
  settlement: billSettlementSummarySchema,
  obligationRows: z.array(outstandingObligationItemSchema),
  supersededOrReversed: z.boolean(),
  snapshot: reportingSnapshotMetadataSchema,
});
export type BillSettlementDetailResponse = z.infer<typeof billSettlementDetailResponseSchema>;
