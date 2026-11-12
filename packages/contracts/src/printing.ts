import { z } from "zod";

import { accountStatementViewModelSchema } from "./account-statements.js";
import { farmerBillRecordSchema } from "./farmer-billing.js";
import {
  absoluteTimestampSchema,
  calendarDateSchema,
  idempotencyKeySchema,
  opaqueIdSchema,
} from "./primitives.js";
import { paymentRecordSchema } from "./payments.js";
import { traderBillRecordSchema } from "./sales-billing.js";

/** Printable document kinds supported by the Phase 29 foundation. */
export const PRINT_DOCUMENT_KINDS = [
  "buyer_bill",
  "farmer_bill",
  "payment_receipt",
  "account_statement",
  "test_page",
] as const;
export const printDocumentKindSchema = z.enum(PRINT_DOCUMENT_KINDS);
export type PrintDocumentKindDto = z.infer<typeof printDocumentKindSchema>;

export const PRINT_CLASSIFICATIONS = ["initial", "reprint"] as const;
export const printClassificationSchema = z.enum(PRINT_CLASSIFICATIONS);
export type PrintClassificationDto = z.infer<typeof printClassificationSchema>;

export const PRINT_ATTEMPT_OUTCOMES = [
  "prepared",
  "submitting",
  "accepted_by_print_system",
  "failed_before_submission",
  "cancelled_before_submission",
  "outcome_unknown",
] as const;
export const printAttemptOutcomeSchema = z.enum(PRINT_ATTEMPT_OUTCOMES);
export type PrintAttemptOutcomeDto = z.infer<typeof printAttemptOutcomeSchema>;

/** Labeled test profiles — uncalibrated until physical acceptance. */
export const PRINT_PAPER_PROFILES = ["thermal-80mm-test", "a4-paged-test"] as const;
export const printPaperProfileSchema = z.enum(PRINT_PAPER_PROFILES);
export type PrintPaperProfileDto = z.infer<typeof printPaperProfileSchema>;

export const PRINT_TEMPLATE_IDS = [
  "buyer_bill",
  "farmer_bill",
  "payment_receipt",
  "account_statement",
  "test_page",
] as const;
export const printTemplateIdSchema = z.enum(PRINT_TEMPLATE_IDS);
export type PrintTemplateIdDto = z.infer<typeof printTemplateIdSchema>;

export const PRINT_TEMPLATE_VERSION = "1";
export const printTemplateVersionSchema = z.literal(PRINT_TEMPLATE_VERSION);

export const PRINT_REPRINT_REASON_MAX_LENGTH = 500;
export const printReprintReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRINT_REPRINT_REASON_MAX_LENGTH);

export const PRINT_DOCUMENT_STATUS_KINDS = [
  "current",
  "reversed",
  "superseded",
  "adjusted",
] as const;
export const printDocumentStatusKindSchema = z.enum(PRINT_DOCUMENT_STATUS_KINDS);
export type PrintDocumentStatusKindDto = z.infer<typeof printDocumentStatusKindSchema>;

export const printDocumentStatusAnnotationSchema = z.strictObject({
  status: printDocumentStatusKindSchema,
  label: z.string().min(1).max(120),
  replacementDocumentId: opaqueIdSchema.nullable(),
  replacementBillNumber: z.string().min(1).max(32).nullable(),
});
export type PrintDocumentStatusAnnotationDto = z.infer<typeof printDocumentStatusAnnotationSchema>;

/**
 * Stall identity for print headers.
 * `historical` means captured on the issued document; `current_unverified` means
 * live stall_binding data used because historical snapshot was not captured.
 */
export const printStallIdentitySchema = z.strictObject({
  displayName: z.string().min(1).max(200),
  address: z.string().max(500).nullable(),
  provenance: z.enum(["historical", "current_unverified"]),
});
export type PrintStallIdentityDto = z.infer<typeof printStallIdentitySchema>;

/** Live stall print-header identity (settings GET/PUT `/print/stall-identity`). */
export const upsertStallPrintIdentityRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullable().optional(),
});
export type UpsertStallPrintIdentityRequest = z.infer<typeof upsertStallPrintIdentityRequestSchema>;

export const stallPrintIdentityRecordSchema = z.strictObject({
  displayName: z.string().min(1).max(200),
  address: z.string().max(500).nullable(),
  updatedAt: absoluteTimestampSchema,
});
export type StallPrintIdentityRecordDto = z.infer<typeof stallPrintIdentityRecordSchema>;

export const stallPrintIdentityResponseSchema = z.strictObject({
  identity: stallPrintIdentityRecordSchema.nullable(),
});
export type StallPrintIdentityResponse = z.infer<typeof stallPrintIdentityResponseSchema>;

export const printMetadataSchema = z.strictObject({
  classification: printClassificationSchema,
  reprintLabel: z.string().min(1).max(64).nullable(),
  printedAt: absoluteTimestampSchema,
  attemptId: opaqueIdSchema,
  attemptReference: z.string().min(1).max(64),
  paperProfile: printPaperProfileSchema,
  templateId: printTemplateIdSchema,
  templateVersion: printTemplateVersionSchema,
});
export type PrintMetadataDto = z.infer<typeof printMetadataSchema>;

export const buyerBillPrintContentSchema = z.strictObject({
  kind: z.literal("buyer_bill"),
  bill: traderBillRecordSchema,
});
export type BuyerBillPrintContentDto = z.infer<typeof buyerBillPrintContentSchema>;

export const farmerBillPrintContentSchema = z.strictObject({
  kind: z.literal("farmer_bill"),
  bill: farmerBillRecordSchema,
});
export type FarmerBillPrintContentDto = z.infer<typeof farmerBillPrintContentSchema>;

export const paymentReceiptPrintContentSchema = z.strictObject({
  kind: z.literal("payment_receipt"),
  payment: paymentRecordSchema,
});
export type PaymentReceiptPrintContentDto = z.infer<typeof paymentReceiptPrintContentSchema>;

export const accountStatementPrintContentSchema = z.strictObject({
  kind: z.literal("account_statement"),
  statement: accountStatementViewModelSchema,
});
export type AccountStatementPrintContentDto = z.infer<typeof accountStatementPrintContentSchema>;

export const testPagePrintContentSchema = z.strictObject({
  kind: z.literal("test_page"),
  applicationId: z.literal("polivo"),
  profileId: printPaperProfileSchema,
  sampleSinhala: z.string().min(1).max(200),
  sampleEnglish: z.string().min(1).max(200),
});
export type TestPagePrintContentDto = z.infer<typeof testPagePrintContentSchema>;

export const printDocumentContentSchema = z.discriminatedUnion("kind", [
  buyerBillPrintContentSchema,
  farmerBillPrintContentSchema,
  paymentReceiptPrintContentSchema,
  accountStatementPrintContentSchema,
  testPagePrintContentSchema,
]);
export type PrintDocumentContentDto = z.infer<typeof printDocumentContentSchema>;

export const printViewModelSchema = z.strictObject({
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  stallIdentity: printStallIdentitySchema,
  statusAnnotation: printDocumentStatusAnnotationSchema,
  printMetadata: printMetadataSchema,
  content: printDocumentContentSchema,
  payloadHash: z.string().min(1).max(128),
});
export type PrintViewModelDto = z.infer<typeof printViewModelSchema>;

export const printJobRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  stallId: opaqueIdSchema,
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  paperProfile: printPaperProfileSchema,
  templateId: printTemplateIdSchema,
  templateVersion: printTemplateVersionSchema,
  payloadHash: z.string().min(1).max(128),
  createOperationId: idempotencyKeySchema,
  createdByStaffId: opaqueIdSchema,
  createdByDeviceId: opaqueIdSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});
export type PrintJobRecordDto = z.infer<typeof printJobRecordSchema>;

export const printAttemptRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  jobId: opaqueIdSchema,
  stallId: opaqueIdSchema,
  classification: printClassificationSchema,
  reprintReason: z.string().max(PRINT_REPRINT_REASON_MAX_LENGTH).nullable(),
  outcome: printAttemptOutcomeSchema,
  printerSystemName: z.string().min(1).max(256).nullable(),
  paperProfile: printPaperProfileSchema,
  templateId: printTemplateIdSchema,
  templateVersion: printTemplateVersionSchema,
  payloadHash: z.string().min(1).max(128),
  attemptReference: z.string().min(1).max(64),
  prepareOperationId: idempotencyKeySchema,
  reportOperationId: idempotencyKeySchema.nullable(),
  outcomeDetail: z.string().max(500).nullable(),
  requestedByStaffId: opaqueIdSchema,
  requestedByDeviceId: opaqueIdSchema,
  preparedAt: absoluteTimestampSchema,
  submittingAt: absoluteTimestampSchema.nullable(),
  reportedAt: absoluteTimestampSchema.nullable(),
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});
export type PrintAttemptRecordDto = z.infer<typeof printAttemptRecordSchema>;

export const createPrintJobRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  paperProfile: printPaperProfileSchema,
  /** Required for account_statement jobs so the service can regenerate the same snapshot binding. */
  statementSnapshotToken: z.string().min(1).max(512).optional(),
});
export type CreatePrintJobRequest = z.infer<typeof createPrintJobRequestSchema>;

export const createPrintJobResponseSchema = z.strictObject({
  job: printJobRecordSchema,
  replayed: z.boolean(),
});
export type CreatePrintJobResponse = z.infer<typeof createPrintJobResponseSchema>;

export const preparePrintAttemptRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  jobId: opaqueIdSchema,
  classification: printClassificationSchema,
  reprintReason: printReprintReasonSchema.optional(),
  printerSystemName: z.string().trim().min(1).max(256),
  paperProfile: printPaperProfileSchema,
});
export type PreparePrintAttemptRequest = z.infer<typeof preparePrintAttemptRequestSchema>;

export const preparePrintAttemptResponseSchema = z.strictObject({
  job: printJobRecordSchema,
  attempt: printAttemptRecordSchema,
  viewModel: printViewModelSchema,
  replayed: z.boolean(),
});
export type PreparePrintAttemptResponse = z.infer<typeof preparePrintAttemptResponseSchema>;

export const markPrintAttemptSubmittingRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  attemptId: opaqueIdSchema,
});
export type MarkPrintAttemptSubmittingRequest = z.infer<
  typeof markPrintAttemptSubmittingRequestSchema
>;

export const markPrintAttemptSubmittingResponseSchema = z.strictObject({
  attempt: printAttemptRecordSchema,
  replayed: z.boolean(),
});
export type MarkPrintAttemptSubmittingResponse = z.infer<
  typeof markPrintAttemptSubmittingResponseSchema
>;

export const reportPrintAttemptOutcomeRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  attemptId: opaqueIdSchema,
  outcome: z.enum([
    "accepted_by_print_system",
    "failed_before_submission",
    "cancelled_before_submission",
    "outcome_unknown",
  ]),
  outcomeDetail: z.string().trim().max(500).nullable().optional(),
});
export type ReportPrintAttemptOutcomeRequest = z.infer<
  typeof reportPrintAttemptOutcomeRequestSchema
>;

export const reportPrintAttemptOutcomeResponseSchema = z.strictObject({
  attempt: printAttemptRecordSchema,
  replayed: z.boolean(),
});
export type ReportPrintAttemptOutcomeResponse = z.infer<
  typeof reportPrintAttemptOutcomeResponseSchema
>;

export const listPrintAttemptsQuerySchema = z.strictObject({
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPrintAttemptsQuery = z.infer<typeof listPrintAttemptsQuerySchema>;

export const listPrintAttemptsResponseSchema = z.strictObject({
  job: printJobRecordSchema.nullable(),
  attempts: z.array(printAttemptRecordSchema).max(100),
});
export type ListPrintAttemptsResponse = z.infer<typeof listPrintAttemptsResponseSchema>;

export const getPrintAttemptResponseSchema = z.strictObject({
  job: printJobRecordSchema,
  attempt: printAttemptRecordSchema,
  viewModel: printViewModelSchema.nullable(),
});
export type GetPrintAttemptResponse = z.infer<typeof getPrintAttemptResponseSchema>;

export const recoverPrintAttemptRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  attemptId: opaqueIdSchema,
});
export type RecoverPrintAttemptRequest = z.infer<typeof recoverPrintAttemptRequestSchema>;

export const recoverPrintAttemptResponseSchema = z.strictObject({
  attempt: printAttemptRecordSchema,
  replayed: z.boolean(),
});
export type RecoverPrintAttemptResponse = z.infer<typeof recoverPrintAttemptResponseSchema>;

export const PRINT_EVENT_SCHEMA_VERSION = "1";
export const PRINT_JOB_CREATED_EVENT_TYPE = "polivo.print_job.created";
export const PRINT_ATTEMPT_PREPARED_EVENT_TYPE = "polivo.print_attempt.prepared";
export const PRINT_ATTEMPT_OUTCOME_EVENT_TYPE = "polivo.print_attempt.outcome";

export const printJobCreatedEventPayloadSchema = z.strictObject({
  jobId: opaqueIdSchema,
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  paperProfile: printPaperProfileSchema,
  templateId: printTemplateIdSchema,
  templateVersion: printTemplateVersionSchema,
  payloadHash: z.string().min(1).max(128),
  actorStaffId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  createdAt: absoluteTimestampSchema,
});
export type PrintJobCreatedEventPayload = z.infer<typeof printJobCreatedEventPayloadSchema>;

export const printAttemptPreparedEventPayloadSchema = z.strictObject({
  jobId: opaqueIdSchema,
  attemptId: opaqueIdSchema,
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  classification: printClassificationSchema,
  reprintReason: z.string().max(PRINT_REPRINT_REASON_MAX_LENGTH).nullable(),
  paperProfile: printPaperProfileSchema,
  templateVersion: printTemplateVersionSchema,
  payloadHash: z.string().min(1).max(128),
  actorStaffId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  preparedAt: absoluteTimestampSchema,
});
export type PrintAttemptPreparedEventPayload = z.infer<
  typeof printAttemptPreparedEventPayloadSchema
>;

export const printAttemptOutcomeEventPayloadSchema = z.strictObject({
  jobId: opaqueIdSchema,
  attemptId: opaqueIdSchema,
  documentKind: printDocumentKindSchema,
  documentId: opaqueIdSchema,
  classification: printClassificationSchema,
  outcome: printAttemptOutcomeSchema,
  outcomeDetail: z.string().max(500).nullable(),
  actorStaffId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  reportedAt: absoluteTimestampSchema,
});
export type PrintAttemptOutcomeEventPayload = z.infer<typeof printAttemptOutcomeEventPayloadSchema>;

/** Terminal-local printer configuration (desktop-only; not stall-wide). */
export const terminalPrinterConfigSchema = z.strictObject({
  printerSystemName: z.string().trim().min(1).max(256),
  displayLabel: z.string().trim().min(1).max(200),
  paperProfile: printPaperProfileSchema,
  copyCount: z.literal(1),
});
export type TerminalPrinterConfigDto = z.infer<typeof terminalPrinterConfigSchema>;

export const discoveredPrinterSchema = z.strictObject({
  name: z.string().min(1).max(256),
  displayName: z.string().min(1).max(256),
  isDefault: z.boolean(),
});
export type DiscoveredPrinterDto = z.infer<typeof discoveredPrinterSchema>;

/** Convenience calendar date re-export for statement print binding helpers. */
export const printCalendarDateSchema = calendarDateSchema;
