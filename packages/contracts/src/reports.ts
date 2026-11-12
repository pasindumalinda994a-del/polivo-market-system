import { z } from "zod";

import { statementDateBasisSchema } from "./account-statements.js";
import {
  absoluteTimestampSchema,
  calendarDateSchema,
  opaqueIdSchema,
} from "./primitives.js";
import { phase27PaymentMethodSchema } from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";

/** Report definition contract version. */
export const REPORT_DEFINITION_VERSION = "1" as const;
export const reportDefinitionVersionSchema = z.literal(REPORT_DEFINITION_VERSION);

export const REPORT_TYPES = [
  "sales_summary",
  "sales_detail",
  "vegetable_sales",
  "farmer_activity",
  "buyer_activity",
  "commission",
  "payments",
  "outstanding",
  "vegetable_prices",
  "corrections_reversals",
] as const;
export const reportTypeSchema = z.enum(REPORT_TYPES);
export type ReportTypeDto = z.infer<typeof reportTypeSchema>;

export const REPORT_DATE_MODELS = [
  "activity_range",
  "effective_as_of",
  "outstanding_as_of",
] as const;
export const reportDateModelSchema = z.enum(REPORT_DATE_MODELS);
export type ReportDateModelDto = z.infer<typeof reportDateModelSchema>;

export const REPORT_GROUPINGS = [
  "business_date",
  "vegetable",
  "farmer",
  "buyer",
  "payment_method",
  "none",
] as const;
export const reportGroupingSchema = z.enum(REPORT_GROUPINGS);
export type ReportGroupingDto = z.infer<typeof reportGroupingSchema>;

export const REPORT_SORTS = [
  "business_date_asc",
  "business_date_desc",
  "amount_desc",
  "name_asc",
  "vegetable_asc",
] as const;
export const reportSortSchema = z.enum(REPORT_SORTS);
export type ReportSortDto = z.infer<typeof reportSortSchema>;

export const REPORT_EXPORT_FORMATS = ["csv", "pdf"] as const;
export const reportExportFormatSchema = z.enum(REPORT_EXPORT_FORMATS);
export type ReportExportFormatDto = z.infer<typeof reportExportFormatSchema>;

export const REPORT_SNAPSHOT_TOKEN_MAX_LENGTH = 4096;
export const reportSnapshotTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(REPORT_SNAPSHOT_TOKEN_MAX_LENGTH);

export const reportPaymentDirectionSchema = z.enum(["receive", "pay"]);
export type ReportPaymentDirectionDto = z.infer<typeof reportPaymentDirectionSchema>;

export const reportPaymentStatusFilterSchema = z.enum(["posted", "reversed", "all"]);
export type ReportPaymentStatusFilterDto = z.infer<typeof reportPaymentStatusFilterSchema>;

/** Shared filter fields; each report allowlists which apply. */
export const reportFiltersSchema = z.strictObject({
  fromBusinessDate: calendarDateSchema.optional(),
  toBusinessDate: calendarDateSchema.optional(),
  asOfBusinessDate: calendarDateSchema.optional(),
  farmerId: opaqueIdSchema.optional(),
  buyerId: opaqueIdSchema.optional(),
  vegetableId: opaqueIdSchema.optional(),
  paymentMethod: phase27PaymentMethodSchema.optional(),
  paymentDirection: reportPaymentDirectionSchema.optional(),
  paymentStatus: reportPaymentStatusFilterSchema.optional(),
  grouping: reportGroupingSchema.optional(),
  sort: reportSortSchema.optional(),
});
export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;

export const reportQuerySchema = z
  .strictObject({
    reportType: reportTypeSchema,
    filters: reportFiltersSchema.default({}),
    limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
    cursor: paginationCursorSchema.optional(),
    snapshotToken: reportSnapshotTokenSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const { filters, reportType } = value;
    if (
      filters.fromBusinessDate !== undefined &&
      filters.toBusinessDate !== undefined &&
      filters.fromBusinessDate > filters.toBusinessDate
    ) {
      ctx.addIssue({
        code: "custom",
        message: "fromBusinessDate must be on or before toBusinessDate",
        path: ["filters", "toBusinessDate"],
      });
    }
    if (reportType === "outstanding") {
      if (filters.asOfBusinessDate === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "asOfBusinessDate is required for outstanding reports",
          path: ["filters", "asOfBusinessDate"],
        });
      }
      if (filters.farmerId === undefined && filters.buyerId === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "farmerId or buyerId is required for outstanding reports",
          path: ["filters", "farmerId"],
        });
      }
    }
    if (
      reportType !== "outstanding" &&
      (filters.fromBusinessDate === undefined || filters.toBusinessDate === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "fromBusinessDate and toBusinessDate are required for this report",
        path: ["filters", "fromBusinessDate"],
      });
    }
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const reportMetricKeySchema = z.enum([
  "package_count",
  "weight_hundredths",
  "gross_sale_minor",
  "commission_minor",
  "farmer_entitlement_minor",
  "payment_count",
  "payment_gross_minor",
  "payment_reversal_minor",
  "payment_net_minor",
  "allocated_minor",
  "unapplied_minor",
  "remaining_obligations_minor",
  "bill_count",
  "eligible_line_count",
  "price_min_per_kg_minor",
  "price_max_per_kg_minor",
  "price_avg_per_kg_minor",
  "original_count",
  "reversal_count",
  "replacement_count",
]);
export type ReportMetricKeyDto = z.infer<typeof reportMetricKeySchema>;

/** Sparse metric map — only populated keys for the report are present. */
export const reportSummaryTotalsSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.number().int().safe(), z.null()]),
);
export type ReportSummaryTotalsDto = z.infer<typeof reportSummaryTotalsSchema>;

export const reportRowSchema = z.strictObject({
  rowId: z.string().min(1).max(256),
  label: z.string().max(512),
  businessDate: calendarDateSchema.nullable(),
  farmerId: opaqueIdSchema.nullable(),
  farmerName: z.string().max(256).nullable(),
  buyerId: opaqueIdSchema.nullable(),
  buyerName: z.string().max(256).nullable(),
  vegetableId: opaqueIdSchema.nullable(),
  vegetableName: z.string().max(256).nullable(),
  paymentMethod: phase27PaymentMethodSchema.nullable(),
  paymentDirection: reportPaymentDirectionSchema.nullable(),
  statusLabel: z.string().max(64).nullable(),
  sourceRef: z.string().max(128).nullable(),
  metrics: reportSummaryTotalsSchema,
  notes: z.string().max(512).nullable(),
  carriedForward: z.boolean().optional(),
  observationDate: calendarDateSchema.nullable().optional(),
  priceUnavailable: z.boolean().optional(),
});
export type ReportRowDto = z.infer<typeof reportRowSchema>;

export const reportScopeSchema = z.strictObject({
  stallId: opaqueIdSchema,
  currency: z.literal("LKR"),
  weightUnit: z.literal("kg"),
  businessTimezone: z.literal("UTC"),
  dateModel: reportDateModelSchema,
  dateBasisLabel: z.string().min(1).max(128),
});
export type ReportScopeDto = z.infer<typeof reportScopeSchema>;

export const reportSnapshotMetadataSchema = z.strictObject({
  snapshotToken: reportSnapshotTokenSchema,
  capturedAt: absoluteTimestampSchema,
  expiresAt: absoluteTimestampSchema,
  maxPostingSequence: z.number().int().safe().nonnegative(),
  dateBasis: statementDateBasisSchema,
  businessTimezone: z.literal("UTC"),
  recordingCutoffAt: absoluteTimestampSchema,
});
export type ReportSnapshotMetadataDto = z.infer<typeof reportSnapshotMetadataSchema>;

export const reportLimitationsSchema = z.array(z.string().min(1).max(512)).max(32);

export const reportResponseSchema = z.strictObject({
  reportType: reportTypeSchema,
  definitionVersion: reportDefinitionVersionSchema,
  scope: reportScopeSchema,
  normalizedFilters: reportFiltersSchema,
  snapshot: reportSnapshotMetadataSchema,
  summary: reportSummaryTotalsSchema,
  rows: z.array(reportRowSchema),
  nextCursor: paginationCursorSchema.nullable(),
  rowCountEstimate: z.number().int().safe().nonnegative().nullable(),
  limitations: reportLimitationsSchema,
  emptyReason: z
    .enum(["no_activity", "data_unavailable", "access_denied"])
    .nullable(),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;

export const reportCatalogItemSchema = z.strictObject({
  reportType: reportTypeSchema,
  title: z.string().min(1).max(128),
  description: z.string().min(1).max(512),
  dateModel: reportDateModelSchema,
  supportedFilters: z.array(z.string().min(1).max(64)),
  supportedGroupings: z.array(reportGroupingSchema),
  available: z.boolean(),
  unavailableReason: z.string().max(256).nullable(),
});
export type ReportCatalogItemDto = z.infer<typeof reportCatalogItemSchema>;

export const reportCatalogResponseSchema = z.strictObject({
  definitionVersion: reportDefinitionVersionSchema,
  items: z.array(reportCatalogItemSchema),
});
export type ReportCatalogResponse = z.infer<typeof reportCatalogResponseSchema>;

export const REPORT_EXPORT_MAX_ROWS = 50_000;

export const reportExportJobStatusSchema = z.enum([
  "preparing",
  "ready",
  "failed",
  "expired",
]);
export type ReportExportJobStatusDto = z.infer<typeof reportExportJobStatusSchema>;

export const createReportExportRequestSchema = z.strictObject({
  reportType: reportTypeSchema,
  format: reportExportFormatSchema,
  filters: reportFiltersSchema.default({}),
  snapshotToken: reportSnapshotTokenSchema,
  columns: z.array(z.string().min(1).max(64)).max(64).optional(),
});
export type CreateReportExportRequest = z.infer<typeof createReportExportRequestSchema>;

export const reportExportJobSchema = z.strictObject({
  exportJobId: opaqueIdSchema,
  reportType: reportTypeSchema,
  format: reportExportFormatSchema,
  status: reportExportJobStatusSchema,
  definitionVersion: reportDefinitionVersionSchema,
  snapshotToken: reportSnapshotTokenSchema,
  rowCount: z.number().int().safe().nonnegative().nullable(),
  createdAt: absoluteTimestampSchema,
  expiresAt: absoluteTimestampSchema,
  failureCode: z.string().max(64).nullable(),
  failureMessage: z.string().max(512).nullable(),
  defaultFileName: z.string().min(1).max(256),
});
export type ReportExportJobDto = z.infer<typeof reportExportJobSchema>;

export const createReportExportResponseSchema = z.strictObject({
  job: reportExportJobSchema,
});
export type CreateReportExportResponse = z.infer<typeof createReportExportResponseSchema>;

export const reportExportArtifactSchema = z.strictObject({
  job: reportExportJobSchema,
  /** Base64-encoded artifact bytes for authorized retrieval. */
  contentBase64: z.string().min(1),
  /**
   * CSV jobs return UTF-8 CSV. PDF jobs return trusted HTML for Electron main-process
   * printToPDF conversion before the native save dialog finalizes a .pdf file.
   */
  contentType: z.enum(["text/csv; charset=utf-8", "text/html; charset=utf-8"]),
  byteLength: z.number().int().safe().positive(),
});
export type ReportExportArtifactDto = z.infer<typeof reportExportArtifactSchema>;

export const REPORT_EXPORT_JOB_CREATED_EVENT_TYPE = "report.export_job_created";
export const REPORT_EXPORT_JOB_READY_EVENT_TYPE = "report.export_job_ready";
export const REPORT_EXPORT_JOB_FAILED_EVENT_TYPE = "report.export_job_failed";
export const REPORT_EVENT_SCHEMA_VERSION = "1";

export const reportExportJobEventPayloadSchema = z.strictObject({
  exportJobId: opaqueIdSchema,
  reportType: reportTypeSchema,
  format: reportExportFormatSchema,
  snapshotToken: reportSnapshotTokenSchema,
  rowCount: z.number().int().safe().nonnegative().nullable(),
  status: reportExportJobStatusSchema,
  filterFingerprint: z.string().max(128).nullable(),
});
export type ReportExportJobEventPayload = z.infer<typeof reportExportJobEventPayloadSchema>;

/** Soft bound for report date range span (days inclusive). */
export const REPORT_MAX_DATE_RANGE_DAYS = 366;

export { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT };
