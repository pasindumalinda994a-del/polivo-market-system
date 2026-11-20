import { createHash, randomUUID } from "node:crypto";

import {
  REPORT_DEFINITION_VERSION,
  REPORT_EXPORT_MAX_ROWS,
  createReportExportResponseSchema,
  reportExportArtifactSchema,
  reportExportJobSchema,
  type CreateReportExportRequest,
  type CreateReportExportResponse,
  type ReportExportArtifactDto,
  type ReportExportJobDto,
  type ReportFiltersDto,
  type ReportRowDto,
  type ReportTypeDto,
} from "@polivo/contracts";
import {
  getReportExportJobByCreateOperationId,
  getReportExportJobById,
  getReportExportJobContent,
  insertReportExportJob,
  markReportExportJobExpired,
  type UserReportingClient,
} from "@polivo/db-cloud";
import {
  REPORT_EXPORT_MAX_ROWS as DOMAIN_EXPORT_MAX,
  addMetric,
  assertDateRangeWithinLimit,
  assertFiltersAllowed,
  buildReportCsv,
  defaultReportExportFileName,
  emptyTotals,
  formatReportMoneyCell,
  formatReportWeightCell,
  getReportDefinition,
  renderReportPdfHtml,
  type ReportType,
} from "@polivo/domain";

import { conflictError, forbiddenError, notFoundError, validationError } from "@/lib/auth/errors";

import { stallBinding } from "./client";
import { mapReportDomainError } from "./errors";
import { loadReport, sumSaleMetrics } from "./load-report";
import { normalizeReportFilters, resolveOrCreateReportSnapshot } from "./snapshot";

void DOMAIN_EXPORT_MAX;

const EXPORT_TTL_MS = 30 * 60 * 1000;

function toExportJobDto(job: {
  id: string;
  reportType: string;
  format: "csv" | "pdf";
  status: "preparing" | "ready" | "failed" | "expired";
  definitionVersion: string;
  snapshotToken: string;
  rowCount: number | null;
  createdAt: string;
  expiresAt: string;
  failureCode: string | null;
  failureMessage: string | null;
  defaultFileName: string;
}): ReportExportJobDto {
  return reportExportJobSchema.parse({
    exportJobId: job.id,
    reportType: job.reportType,
    format: job.format,
    status: job.status,
    definitionVersion: job.definitionVersion,
    snapshotToken: job.snapshotToken,
    rowCount: job.rowCount,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    failureCode: job.failureCode,
    failureMessage: job.failureMessage,
    defaultFileName: job.defaultFileName,
  });
}

/** Paginated export row collection using offset cursors. */
export async function collectExportRows(
  client: UserReportingClient,
  tenantId: string,
  reportType: ReportTypeDto,
  filters: ReportFiltersDto,
  snapshotToken: string,
  nowIso: string,
): Promise<ReportRowDto[]> {
  const pageSize = 100;
  const all: ReportRowDto[] = [];
  let cursor: string | undefined;
  for (;;) {
    const response = await loadReport(
      client,
      tenantId,
      {
        reportType,
        filters,
        snapshotToken,
        limit: pageSize,
        cursor,
      },
      nowIso,
    );
    all.push(...response.rows);
    if (all.length > REPORT_EXPORT_MAX_ROWS) {
      throw validationError(
        `Export exceeds ${REPORT_EXPORT_MAX_ROWS} rows; narrow the date range or filters.`,
      );
    }
    if (!response.nextCursor || response.rows.length === 0) {
      break;
    }
    cursor = response.nextCursor;
  }
  return all;
}

async function renderPdfBytes(html: string): Promise<Uint8Array> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ printBackground: true, format: "A4" });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

export async function createReportExportJob(
  client: UserReportingClient,
  tenantId: string,
  subject: string,
  input: CreateReportExportRequest,
  createOperationId: string,
  nowIso: string,
  stallDisplayName: string,
): Promise<CreateReportExportResponse> {
  const { stallId } = stallBinding(tenantId);
  const existing = await getReportExportJobByCreateOperationId(
    client,
    tenantId,
    stallId,
    createOperationId,
  );
  if (existing) {
    return createReportExportResponseSchema.parse({ job: toExportJobDto(existing) });
  }

  const filters = normalizeReportFilters(input.filters);
  const reportType = input.reportType as ReportType;
  try {
    assertFiltersAllowed(reportType, filters as Record<string, unknown>);
    if (filters.fromBusinessDate && filters.toBusinessDate) {
      assertDateRangeWithinLimit(filters.fromBusinessDate, filters.toBusinessDate);
    }
  } catch (error) {
    mapReportDomainError(error);
  }

  const { payload, token } = await resolveOrCreateReportSnapshot({
    client,
    tenantId,
    reportType,
    filters,
    snapshotToken: input.snapshotToken,
    nowIso,
  });

  const definition = getReportDefinition(reportType);
  const rows = await collectExportRows(client, tenantId, input.reportType, filters, token, nowIso);
  const asOfOrFrom =
    filters.asOfBusinessDate ?? filters.fromBusinessDate ?? payload.capturedAt.slice(0, 10);
  const defaultFileName = defaultReportExportFileName({
    reportType,
    format: input.format,
    asOfOrFrom,
  });

  let contentBytes: Uint8Array;
  let contentType: string;
  if (input.format === "csv") {
    const columns = [
      { key: "rowId", header: "row_id" },
      { key: "label", header: "label" },
      { key: "businessDate", header: "business_date" },
      { key: "farmerName", header: "farmer" },
      { key: "buyerName", header: "buyer" },
      { key: "vegetableName", header: "vegetable" },
      { key: "statusLabel", header: "status" },
      { key: "sourceRef", header: "source_ref" },
      { key: "metricsJson", header: "metrics_json" },
      { key: "notes", header: "notes" },
    ];
    const csv = buildReportCsv({
      reportType,
      title: definition.title,
      stallId,
      dateBasisLabel: definition.dateBasisLabel,
      fromBusinessDate: filters.fromBusinessDate ?? null,
      toBusinessDate: filters.toBusinessDate ?? null,
      asOfBusinessDate: filters.asOfBusinessDate ?? null,
      recordingCutoffAt: payload.capturedAt,
      currency: "LKR",
      weightUnit: "kg",
      definitionVersion: REPORT_DEFINITION_VERSION,
      columns,
      rows: rows.map((row) => ({
        rowId: row.rowId,
        label: row.label,
        businessDate: row.businessDate,
        farmerName: row.farmerName,
        buyerName: row.buyerName,
        vegetableName: row.vegetableName,
        statusLabel: row.statusLabel,
        sourceRef: row.sourceRef,
        metricsJson: JSON.stringify(row.metrics),
        notes: row.notes,
      })),
    });
    contentBytes = Buffer.from(csv, "utf8");
    contentType = "text/csv; charset=utf-8";
  } else {
    const summaryAccumulator = rows.reduce((acc, row) => {
      for (const [key, value] of Object.entries(row.metrics)) {
        if (typeof value === "number") {
          addMetric(acc, key, value);
        }
      }
      return acc;
    }, emptyTotals());
    const html = renderReportPdfHtml({
      stallDisplayName,
      stallAddress: null,
      reportTitle: definition.title,
      filterSummary: JSON.stringify(filters),
      dateBasisLabel: definition.dateBasisLabel,
      recordingCutoffAt: payload.capturedAt,
      generatedAt: nowIso,
      currency: "LKR",
      weightUnit: "kg",
      summaryLines: Object.entries(summaryAccumulator).map(
        ([key, value]) =>
          `${key}: ${typeof value === "number" && key.includes("minor") ? formatReportMoneyCell(value) : key.includes("weight") ? formatReportWeightCell(value) : String(value)}`,
      ),
      columnHeaders: ["Date", "Label", "Status", "Source", "Metrics"],
      rows: rows.map((row) => ({
        cells: [
          row.businessDate ?? "",
          row.label,
          row.statusLabel ?? "",
          row.sourceRef ?? "",
          JSON.stringify(row.metrics),
        ],
      })),
    });
    contentBytes = await renderPdfBytes(html);
    contentType = "application/pdf";
  }

  const contentSha256 = createHash("sha256").update(contentBytes).digest("hex");
  const jobId = randomUUID();
  const createdAt = nowIso;
  const expiresAt = new Date(Date.parse(createdAt) + EXPORT_TTL_MS).toISOString();

  await insertReportExportJob(client, {
    tenantId,
    id: jobId,
    stallId,
    reportType: input.reportType,
    format: input.format,
    status: "ready",
    definitionVersion: REPORT_DEFINITION_VERSION,
    snapshotToken: token,
    filterFingerprint: payload.filterFingerprint,
    normalizedFiltersJson: JSON.stringify(filters),
    rowCount: rows.length,
    contentSha256,
    contentBytes,
    contentType,
    byteLength: contentBytes.byteLength,
    defaultFileName,
    failureCode: null,
    failureMessage: null,
    createdBySubject: subject,
    createOperationId,
    createdAt,
    expiresAt,
    readyAt: createdAt,
  });

  const job = await getReportExportJobById(client, tenantId, stallId, jobId);
  if (job === null) {
    throw notFoundError("Export job could not be loaded after creation.");
  }
  return createReportExportResponseSchema.parse({ job: toExportJobDto(job) });
}

export async function loadReportExportArtifact(
  client: UserReportingClient,
  tenantId: string,
  subject: string,
  jobId: string,
  nowIso: string,
): Promise<ReportExportArtifactDto> {
  const { stallId } = stallBinding(tenantId);
  const job = await getReportExportJobById(client, tenantId, stallId, jobId);
  if (job === null) {
    throw notFoundError("Export job not found.");
  }
  if (job.createdBySubject !== subject) {
    throw forbiddenError("Export job belongs to another session principal.");
  }
  if (Date.parse(nowIso) > Date.parse(job.expiresAt)) {
    await markReportExportJobExpired(client, tenantId, stallId, jobId);
    throw conflictError("Export job expired; create a new export.");
  }
  if (job.status !== "ready") {
    throw conflictError(`Export job is not ready (status=${job.status}).`);
  }
  const bytes = await getReportExportJobContent(client, tenantId, stallId, jobId);
  if (bytes === null || job.byteLength === null || !job.contentType) {
    throw conflictError("Export artifact is missing; create a new export.");
  }
  return reportExportArtifactSchema.parse({
    job: toExportJobDto(job),
    contentBase64: Buffer.from(bytes).toString("base64"),
    contentType: job.contentType,
    byteLength: job.byteLength,
  });
}

/** @internal test helper */
export function summarizeSaleExportMetrics(rows: ReportRowDto[]) {
  const lines = rows.map((row) => ({
    packageCount: row.metrics.package_count ?? 0,
    netWeightHundredths: row.metrics.weight_hundredths ?? 0,
    saleAmountMinor: row.metrics.gross_sale_minor ?? 0,
    commissionAmountMinor: row.metrics.commission_minor ?? 0,
    farmerReceivesMinor: row.metrics.farmer_entitlement_minor ?? 0,
  }));
  return sumSaleMetrics(
    lines.map((line, index) => ({
      saleLineId: `s-${index}`,
      saleId: "sale",
      businessDate: "2026-01-01",
      recordedAt: "2026-01-01T00:00:00.000Z",
      postingSequence: 1,
      traderId: "t",
      traderDisplayName: "Trader",
      farmerId: null,
      farmerDisplayName: null,
      vegetableId: "v",
      vegetableCode: "V",
      vegetableDisplayName: "Veg",
      packageCount: line.packageCount,
      netWeightHundredths: line.netWeightHundredths,
      unitPricePerKgMinor: 0,
      saleAmountMinor: line.saleAmountMinor,
      commissionAmountMinor: line.commissionAmountMinor,
      farmerReceivesMinor: line.farmerReceivesMinor,
      correctionStatus: "active",
      traderBillNumber: null,
    })),
  );
}