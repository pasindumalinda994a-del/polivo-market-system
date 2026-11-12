import { createHash } from "node:crypto";

import {
  REPORT_DEFINITION_VERSION,
  REPORT_EVENT_SCHEMA_VERSION,
  REPORT_EXPORT_JOB_CREATED_EVENT_TYPE,
  REPORT_EXPORT_JOB_READY_EVENT_TYPE,
  REPORT_EXPORT_MAX_ROWS,
  createReportExportResponseSchema,
  reportCatalogResponseSchema,
  reportExportArtifactSchema,
  reportExportJobEventPayloadSchema,
  reportExportJobSchema,
  reportQuerySchema,
  reportResponseSchema,
  type CreateReportExportRequest,
  type CreateReportExportResponse,
  type ReportCatalogResponse,
  type ReportExportArtifactDto,
  type ReportExportJobDto,
  type ReportFiltersDto,
  type ReportQuery,
  type ReportResponse,
  type ReportRowDto,
  type ReportSummaryTotalsDto,
  type ReportTypeDto,
} from "@polivo/contracts";
import {
  appendAuditEvent,
  captureReportingWatermarks,
  countReportCorrections,
  countReportPayments,
  countReportSaleLines,
  getReportExportJobByCreateOperationId,
  getReportExportJobById,
  getReportExportJobContent,
  getStallPrintIdentity,
  insertReportExportJob,
  listEligibleFarmerSaleLineObligations,
  listEligibleOpeningObligations,
  listEligibleTraderBillObligations,
  listReportCorrections,
  listReportPayments,
  listReportSaleLines,
  listUnappliedPaymentsAtWatermark,
  markReportExportJobExpired,
  runInTransaction,
  sumAccountBalanceAtWatermark,
  type LocalDatabase,
  type ReportPaymentRow,
  type ReportSaleLineRow,
  type ReportingWatermarks,
} from "@polivo/db-local";
import {
  DomainError,
  REPORT_DEFINITIONS,
  REPORT_EXPORT_MAX_ROWS as DOMAIN_EXPORT_MAX,
  addMetric,
  assertDateRangeWithinLimit,
  assertFiltersAllowed,
  assertReportSnapshotMatchesBinding,
  buildReportCsv,
  buildVegetablePriceDay,
  createReportSnapshotPayload,
  decodeReportPageCursor,
  decodeReportSnapshotToken,
  defaultReportExportFileName,
  emptyTotals,
  encodeReportPageCursor,
  encodeReportSnapshotToken,
  fingerprintReportFilters,
  formatReportMoneyCell,
  formatReportWeightCell,
  getReportDefinition,
  renderReportPdfHtml,
  type ReportSnapshotPayload,
  type ReportType,
  type VegetablePriceDay,
} from "@polivo/domain";

import type { CommandDeps } from "./command-runner.js";
import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from "../errors/app-error.js";
import type { ExecutionContext } from "../context/execution-context.js";

export const REPORTS_VIEW_CAPABILITY = "reports.view_financial";
export const DATA_EXPORT_CAPABILITY = "data.export";

const EXPORT_TTL_MS = 30 * 60 * 1000;

void DOMAIN_EXPORT_MAX;

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    if (error.code === "SNAPSHOT_EXPIRED" || error.code === "SNAPSHOT_MISMATCH") {
      throw conflictError(error.message);
    }
    throw validationError(error.message, [
      { path: "query", code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function normalizeFilters(filters: ReportFiltersDto): ReportFiltersDto {
  const out: ReportFiltersDto = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function resolveOrCreateReportSnapshot(input: {
  database: LocalDatabase;
  stallId: string;
  reportType: ReportType;
  filters: ReportFiltersDto;
  snapshotToken: string | undefined;
  nowIso: string;
}): { payload: ReportSnapshotPayload; token: string; watermarks: ReportingWatermarks } {
  const normalized = normalizeFilters(input.filters);
  const filterFp = fingerprintReportFilters(normalized as Record<string, unknown>);
  const from = normalized.fromBusinessDate ?? null;
  const to = normalized.toBusinessDate ?? null;
  const asOf = normalized.asOfBusinessDate ?? null;

  if (input.snapshotToken) {
    try {
      const payload = decodeReportSnapshotToken(input.snapshotToken);
      assertReportSnapshotMatchesBinding(
        payload,
        {
          stallId: input.stallId,
          reportType: input.reportType,
          definitionVersion: REPORT_DEFINITION_VERSION,
          currency: "LKR",
          fromBusinessDate: from,
          toBusinessDate: to,
          asOfBusinessDate: asOf,
          filterFingerprint: filterFp,
        },
        input.nowIso,
      );
      return { payload, token: input.snapshotToken, watermarks: payload.watermarks };
    } catch (error) {
      mapDomainError(error);
    }
  }

  const watermarks = captureReportingWatermarks(input.database, input.stallId);
  const payload = createReportSnapshotPayload({
    stallId: input.stallId,
    reportType: input.reportType,
    fromBusinessDate: from,
    toBusinessDate: to,
    asOfBusinessDate: asOf,
    filterFingerprint: filterFp,
    watermarks,
    capturedAt: input.nowIso,
  });
  return { payload, token: encodeReportSnapshotToken(payload), watermarks };
}

function snapshotMeta(token: string, payload: ReportSnapshotPayload) {
  return {
    snapshotToken: token,
    capturedAt: payload.capturedAt,
    expiresAt: payload.expiresAt,
    maxPostingSequence: payload.watermarks.maxPostingSequence,
    dateBasis: "business_effective" as const,
    businessTimezone: "UTC" as const,
    recordingCutoffAt: payload.capturedAt,
  };
}

function saleLineToRow(line: ReportSaleLineRow): ReportRowDto {
  return {
    rowId: line.saleLineId,
    label: `${line.vegetableDisplayName} · ${line.traderDisplayName}`,
    businessDate: line.businessDate,
    farmerId: line.farmerId,
    farmerName: line.farmerDisplayName,
    buyerId: line.traderId,
    buyerName: line.traderDisplayName,
    vegetableId: line.vegetableId,
    vegetableName: line.vegetableDisplayName,
    paymentMethod: null,
    paymentDirection: null,
    statusLabel: line.correctionStatus,
    sourceRef: line.traderBillNumber,
    metrics: {
      package_count: line.packageCount,
      weight_hundredths: line.netWeightHundredths,
      gross_sale_minor: line.saleAmountMinor,
      commission_minor: line.commissionAmountMinor,
      farmer_entitlement_minor: line.farmerReceivesMinor,
    },
    notes: null,
  };
}

function paymentToRow(payment: ReportPaymentRow): ReportRowDto {
  return {
    rowId: payment.paymentId,
    label: `${payment.direction} ${payment.method} ${payment.referenceNumber}`,
    businessDate: payment.businessDate,
    farmerId: payment.farmerId,
    farmerName: payment.farmerDisplayName,
    buyerId: payment.traderId,
    buyerName: payment.traderDisplayName,
    vegetableId: null,
    vegetableName: null,
    paymentMethod: payment.method,
    paymentDirection: payment.direction,
    statusLabel: payment.status,
    sourceRef: payment.referenceNumber,
    metrics: {
      payment_count: 1,
      payment_gross_minor: payment.status === "posted" ? payment.amountMinor : 0,
      payment_reversal_minor: payment.status === "reversed" ? payment.amountMinor : 0,
      payment_net_minor: payment.status === "posted" ? payment.amountMinor : -payment.amountMinor,
      allocated_minor: payment.allocatedTotalMinor,
      unapplied_minor: payment.unappliedAmountMinor,
    },
    notes: null,
  };
}

function sumSaleMetrics(lines: readonly ReportSaleLineRow[]): ReportSummaryTotalsDto {
  const totals = emptyTotals() as ReportSummaryTotalsDto;
  for (const line of lines) {
    addMetric(totals, "package_count", line.packageCount);
    addMetric(totals, "weight_hundredths", line.netWeightHundredths);
    addMetric(totals, "gross_sale_minor", line.saleAmountMinor);
    addMetric(totals, "commission_minor", line.commissionAmountMinor);
    addMetric(totals, "farmer_entitlement_minor", line.farmerReceivesMinor);
  }
  return totals;
}

function groupSaleRows(
  lines: readonly ReportSaleLineRow[],
  grouping: string | undefined,
): ReportRowDto[] {
  if (!grouping || grouping === "none") {
    return lines.map(saleLineToRow);
  }
  const buckets = new Map<string, ReportSaleLineRow[]>();
  for (const line of lines) {
    let key: string;
    switch (grouping) {
      case "business_date":
        key = line.businessDate;
        break;
      case "vegetable":
        key = line.vegetableId;
        break;
      case "farmer":
        key = line.farmerId ?? "unknown";
        break;
      case "buyer":
        key = line.traderId;
        break;
      default:
        key = line.saleLineId;
    }
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }
  const rows: ReportRowDto[] = [];
  for (const [key, group] of buckets) {
    const first = group[0]!;
    const metrics = sumSaleMetrics(group);
    rows.push({
      rowId: `group:${grouping}:${key}`,
      label:
        grouping === "business_date"
          ? first.businessDate
          : grouping === "vegetable"
            ? first.vegetableDisplayName
            : grouping === "farmer"
              ? (first.farmerDisplayName ?? key)
              : first.traderDisplayName,
      businessDate: grouping === "business_date" ? first.businessDate : null,
      farmerId: grouping === "farmer" ? first.farmerId : null,
      farmerName: grouping === "farmer" ? first.farmerDisplayName : null,
      buyerId: grouping === "buyer" ? first.traderId : null,
      buyerName: grouping === "buyer" ? first.traderDisplayName : null,
      vegetableId: grouping === "vegetable" ? first.vegetableId : null,
      vegetableName: grouping === "vegetable" ? first.vegetableDisplayName : null,
      paymentMethod: null,
      paymentDirection: null,
      statusLabel: null,
      sourceRef: null,
      metrics,
      notes: null,
    });
  }
  return rows;
}

function loadSalesReport(
  database: LocalDatabase,
  stallId: string,
  reportType: ReportTypeDto,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): { rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number } {
  const from = filters.fromBusinessDate!;
  const to = filters.toBusinessDate!;
  const base = {
    stallId,
    fromBusinessDate: from,
    toBusinessDate: to,
    watermarks,
    farmerId: filters.farmerId,
    buyerId: filters.buyerId,
    vegetableId: filters.vegetableId,
  };
  const allLines = listReportSaleLines(database, base);
  const summary = sumSaleMetrics(allLines);
  let rows = groupSaleRows(allLines, filters.grouping);
  if (reportType === "sales_detail") {
    rows = allLines.map(saleLineToRow);
  } else if (reportType === "commission") {
    rows = groupSaleRows(allLines, filters.grouping ?? "business_date").map((row) => ({
      ...row,
      metrics: {
        commission_minor: row.metrics.commission_minor ?? 0,
        weight_hundredths: row.metrics.weight_hundredths ?? 0,
        gross_sale_minor: row.metrics.gross_sale_minor ?? 0,
      },
    }));
  }
  const totalCount = rows.length;
  const page = rows.slice(offset, offset + limit);
  return { rows: page, summary, totalCount };
}

function loadPaymentsReport(
  database: LocalDatabase,
  stallId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): { rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number } {
  const base = {
    stallId,
    fromBusinessDate: filters.fromBusinessDate!,
    toBusinessDate: filters.toBusinessDate!,
    watermarks,
    farmerId: filters.farmerId,
    buyerId: filters.buyerId,
    paymentMethod: filters.paymentMethod,
    paymentDirection: filters.paymentDirection,
    paymentStatus: filters.paymentStatus ?? "all",
  };
  const all = listReportPayments(database, base);
  const summary = emptyTotals() as ReportSummaryTotalsDto;
  for (const p of all) {
    addMetric(summary, "payment_count", 1);
    if (p.status === "posted") {
      addMetric(summary, "payment_gross_minor", p.amountMinor);
      addMetric(summary, "payment_net_minor", p.amountMinor);
    } else {
      addMetric(summary, "payment_reversal_minor", p.amountMinor);
      addMetric(summary, "payment_net_minor", -p.amountMinor);
    }
    addMetric(summary, "allocated_minor", p.allocatedTotalMinor);
    addMetric(summary, "unapplied_minor", p.unappliedAmountMinor);
  }
  let rows = all.map(paymentToRow);
  if (filters.grouping && filters.grouping !== "none") {
    const buckets = new Map<string, ReportPaymentRow[]>();
    for (const p of all) {
      const key =
        filters.grouping === "business_date"
          ? p.businessDate
          : filters.grouping === "payment_method"
            ? p.method
            : filters.grouping === "farmer"
              ? (p.farmerId ?? "none")
              : filters.grouping === "buyer"
                ? (p.traderId ?? "none")
                : p.paymentId;
      const list = buckets.get(key) ?? [];
      list.push(p);
      buckets.set(key, list);
    }
    rows = [];
    for (const [key, group] of buckets) {
      const metrics = emptyTotals() as ReportSummaryTotalsDto;
      for (const p of group) {
        addMetric(metrics, "payment_count", 1);
        if (p.status === "posted") {
          addMetric(metrics, "payment_gross_minor", p.amountMinor);
          addMetric(metrics, "payment_net_minor", p.amountMinor);
        } else {
          addMetric(metrics, "payment_reversal_minor", p.amountMinor);
          addMetric(metrics, "payment_net_minor", -p.amountMinor);
        }
      }
      const first = group[0]!;
      rows.push({
        rowId: `paygroup:${key}`,
        label: key,
        businessDate: filters.grouping === "business_date" ? first.businessDate : null,
        farmerId: null,
        farmerName: null,
        buyerId: null,
        buyerName: null,
        vegetableId: null,
        vegetableName: null,
        paymentMethod: filters.grouping === "payment_method" ? first.method : null,
        paymentDirection: null,
        statusLabel: null,
        sourceRef: null,
        metrics,
        notes: null,
      });
    }
  }
  return { rows: rows.slice(offset, offset + limit), summary, totalCount: rows.length };
}

function loadPricesReport(
  database: LocalDatabase,
  stallId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): { rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number } {
  const from = filters.fromBusinessDate!;
  const to = filters.toBusinessDate!;
  const lines = listReportSaleLines(database, {
    stallId,
    fromBusinessDate: from,
    toBusinessDate: to,
    watermarks,
    vegetableId: filters.vegetableId,
    activeOnly: true,
  });
  // Also load a lookback day for carry-forward: one day before from.
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  const lookback = fromDate.toISOString().slice(0, 10);
  const priorLines = listReportSaleLines(database, {
    stallId,
    fromBusinessDate: lookback,
    toBusinessDate: lookback,
    watermarks,
    vegetableId: filters.vegetableId,
    activeOnly: true,
  });

  const vegetableIds = new Set<string>();
  for (const line of [...priorLines, ...lines]) vegetableIds.add(line.vegetableId);

  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const priceRows: ReportRowDto[] = [];
  const summary = emptyTotals() as ReportSummaryTotalsDto;
  for (const vegetableId of vegetableIds) {
    const vegLines = [...priorLines, ...lines].filter((l) => l.vegetableId === vegetableId);
    const name = vegLines[0]?.vegetableDisplayName ?? vegetableId;
    let prior: VegetablePriceDay | null = null;
    const priorDayLines = priorLines.filter((l) => l.vegetableId === vegetableId);
    prior = buildVegetablePriceDay({
      vegetableId,
      businessDate: lookback,
      sales: priorDayLines.map((l) => ({
        sellingPricePerKgMinor: l.unitPricePerKgMinor,
        netWeightHundredths: l.netWeightHundredths,
        saleAmountMinor: l.saleAmountMinor,
        cancelled: false,
      })),
      prior: null,
    });
    for (const day of days) {
      const daySales = lines.filter((l) => l.vegetableId === vegetableId && l.businessDate === day);
      const built = buildVegetablePriceDay({
        vegetableId,
        businessDate: day,
        sales: daySales.map((l) => ({
          sellingPricePerKgMinor: l.unitPricePerKgMinor,
          netWeightHundredths: l.netWeightHundredths,
          saleAmountMinor: l.saleAmountMinor,
          cancelled: false,
        })),
        prior,
      });
      prior = built;
      priceRows.push({
        rowId: `price:${vegetableId}:${day}`,
        label: name,
        businessDate: day,
        farmerId: null,
        farmerName: null,
        buyerId: null,
        buyerName: null,
        vegetableId,
        vegetableName: name,
        paymentMethod: null,
        paymentDirection: null,
        statusLabel: built.carriedForward
          ? "carried_forward"
          : built.priceUnavailable
            ? "unavailable"
            : "observed",
        sourceRef: null,
        metrics: {
          price_min_per_kg_minor: built.minPerKgMinor,
          price_max_per_kg_minor: built.maxPerKgMinor,
          price_avg_per_kg_minor: built.avgPerKgMinor,
          eligible_line_count: built.eligibleLineCount,
          weight_hundredths: built.soldWeightHundredths,
        },
        notes: built.carriedForward ? "No sales for selected day" : null,
        carriedForward: built.carriedForward,
        observationDate: built.observationDate,
        priceUnavailable: built.priceUnavailable,
      });
      if (!built.priceUnavailable && !built.carriedForward) {
        addMetric(summary, "eligible_line_count", built.eligibleLineCount);
        addMetric(summary, "weight_hundredths", built.soldWeightHundredths);
      }
    }
  }
  return {
    rows: priceRows.slice(offset, offset + limit),
    summary,
    totalCount: priceRows.length,
  };
}

function loadCorrectionsReport(
  database: LocalDatabase,
  stallId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): { rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number } {
  const all = listReportCorrections(database, {
    stallId,
    fromBusinessDate: filters.fromBusinessDate!,
    toBusinessDate: filters.toBusinessDate!,
    watermarks,
    buyerId: filters.buyerId,
  });
  const summary = emptyTotals() as ReportSummaryTotalsDto;
  const rows: ReportRowDto[] = all.map((op) => {
    addMetric(summary, "original_count", 1);
    if (op.action === "reverse" || op.action === "correct") {
      addMetric(summary, "reversal_count", 1);
    }
    if (op.replacementSaleId) {
      addMetric(summary, "replacement_count", 1);
    }
    return {
      rowId: op.operationId,
      label: `${op.action} ${op.sourceSaleId}`,
      businessDate: op.businessDate,
      farmerId: null,
      farmerName: null,
      buyerId: op.traderId,
      buyerName: null,
      vegetableId: null,
      vegetableName: null,
      paymentMethod: null,
      paymentDirection: null,
      statusLabel: op.action,
      sourceRef: op.sourceSaleId,
      metrics: {
        original_count: 1,
        reversal_count: 1,
        replacement_count: op.replacementSaleId ? 1 : 0,
      },
      notes: op.reason,
    };
  });
  return { rows: rows.slice(offset, offset + limit), summary, totalCount: rows.length };
}

function loadOutstandingReport(
  database: LocalDatabase,
  stallId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): {
  rows: ReportRowDto[];
  summary: ReportSummaryTotalsDto;
  totalCount: number;
  limitations: string[];
} {
  const asOf = filters.asOfBusinessDate!;
  const limitations: string[] = [
    "Outstanding reuses Phase 28 obligation and unapplied queries at the same cutoff.",
    "Aging unavailable.",
  ];
  const rows: ReportRowDto[] = [];
  const summary = emptyTotals() as ReportSummaryTotalsDto;

  const partyKind: "farmer" | "trader" = filters.farmerId ? "farmer" : "trader";
  const partyId = (filters.farmerId ?? filters.buyerId)!;

  const obligations =
    partyKind === "trader"
      ? [
          ...listEligibleTraderBillObligations(database, stallId, partyId),
          ...listEligibleOpeningObligations(database, stallId, partyKind, partyId),
        ]
      : [
          ...listEligibleFarmerSaleLineObligations(database, stallId, partyId),
          ...listEligibleOpeningObligations(database, stallId, partyKind, partyId),
        ];

  let remainingTotal = 0;
  for (const row of obligations) {
    remainingTotal += row.remainingMinor;
    rows.push({
      rowId: `ob:${row.obligationKind}:${row.targetId}`,
      label: row.label,
      businessDate: row.businessDate,
      farmerId: partyKind === "farmer" ? partyId : null,
      farmerName: null,
      buyerId: partyKind === "trader" ? partyId : null,
      buyerName: null,
      vegetableId: null,
      vegetableName: null,
      paymentMethod: null,
      paymentDirection: null,
      statusLabel: row.obligationKind,
      sourceRef: row.documentNumber ?? row.targetId,
      metrics: { remaining_obligations_minor: row.remainingMinor },
      notes: `as_of=${asOf}`,
    });
  }
  addMetric(summary, "remaining_obligations_minor", remainingTotal);

  const unapplied = listUnappliedPaymentsAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    watermarks,
    asOf,
  );
  let unappliedTotal = 0;
  for (const u of unapplied) {
    unappliedTotal += u.unappliedAmountMinor;
    rows.push({
      rowId: `unapplied:${u.paymentId}`,
      label: `Unapplied ${u.referenceNumber}`,
      businessDate: u.businessDate,
      farmerId: partyKind === "farmer" ? partyId : null,
      farmerName: null,
      buyerId: partyKind === "trader" ? partyId : null,
      buyerName: null,
      vegetableId: null,
      vegetableName: null,
      paymentMethod: u.method,
      paymentDirection: null,
      statusLabel: "unapplied",
      sourceRef: u.referenceNumber,
      metrics: { unapplied_minor: u.unappliedAmountMinor },
      notes: null,
    });
  }
  addMetric(summary, "unapplied_minor", unappliedTotal);

  const balance = sumAccountBalanceAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    watermarks.maxPostingSequence,
    asOf,
  );
  limitations.push(`Account balance at cutoff (natural sign): ${balance}`);

  return {
    rows: rows.slice(offset, offset + limit),
    summary,
    totalCount: rows.length,
    limitations,
  };
}

export function loadReportCatalog(): ReportCatalogResponse {
  return reportCatalogResponseSchema.parse({
    definitionVersion: REPORT_DEFINITION_VERSION,
    items: REPORT_DEFINITIONS.map((d) => ({
      reportType: d.reportType,
      title: d.title,
      description: d.description,
      dateModel: d.dateModel,
      supportedFilters: [...d.supportedFilters],
      supportedGroupings: [...d.supportedGroupings],
      available: d.available,
      unavailableReason: d.unavailableReason,
    })),
  });
}

export function loadReport(
  database: LocalDatabase,
  stallId: string,
  query: ReportQuery,
  nowIso: string,
): ReportResponse {
  const parsed = reportQuerySchema.parse(query);
  const filters = normalizeFilters(parsed.filters);
  const reportType = parsed.reportType as ReportType;

  try {
    assertFiltersAllowed(reportType, filters as Record<string, unknown>);
    if (filters.fromBusinessDate && filters.toBusinessDate) {
      assertDateRangeWithinLimit(filters.fromBusinessDate, filters.toBusinessDate);
    }
  } catch (error) {
    mapDomainError(error);
  }

  const def = getReportDefinition(reportType);
  const { payload, token, watermarks } = resolveOrCreateReportSnapshot({
    database,
    stallId,
    reportType,
    filters,
    snapshotToken: parsed.snapshotToken,
    nowIso,
  });

  let offset = 0;
  if (parsed.cursor) {
    try {
      const decoded = decodeReportPageCursor(parsed.cursor);
      if (decoded.snapshotToken !== token) {
        throw conflictError("Pagination cursor does not match the report snapshot.");
      }
      offset = decoded.offset;
    } catch (error) {
      if (error instanceof DomainError) mapDomainError(error);
      throw error;
    }
  }

  const limit = parsed.limit;
  let result: {
    rows: ReportRowDto[];
    summary: ReportSummaryTotalsDto;
    totalCount: number;
    limitations?: string[];
  };

  switch (reportType) {
    case "payments":
      result = loadPaymentsReport(database, stallId, filters, watermarks, limit, offset);
      break;
    case "vegetable_prices":
      result = loadPricesReport(database, stallId, filters, watermarks, limit, offset);
      break;
    case "corrections_reversals":
      result = loadCorrectionsReport(database, stallId, filters, watermarks, limit, offset);
      break;
    case "outstanding":
      result = loadOutstandingReport(database, stallId, filters, watermarks, limit, offset);
      break;
    default:
      result = loadSalesReport(database, stallId, reportType, filters, watermarks, limit, offset);
  }

  const nextOffset = offset + result.rows.length;
  const nextCursor =
    nextOffset < result.totalCount
      ? encodeReportPageCursor({ snapshotToken: token, offset: nextOffset })
      : null;

  // Touch unused count helpers so indexes stay relevant in tests / future tuning.
  void countReportSaleLines;
  void countReportPayments;
  void countReportCorrections;

  return reportResponseSchema.parse({
    reportType,
    definitionVersion: REPORT_DEFINITION_VERSION,
    scope: {
      stallId,
      currency: "LKR",
      weightUnit: "kg",
      businessTimezone: "UTC",
      dateModel: def.dateModel,
      dateBasisLabel: def.dateBasisLabel,
    },
    normalizedFilters: filters,
    snapshot: snapshotMeta(token, payload),
    summary: result.summary,
    rows: result.rows,
    nextCursor,
    rowCountEstimate: result.totalCount,
    limitations: [...def.limitations, ...(result.limitations ?? [])],
    emptyReason: result.totalCount === 0 ? "no_activity" : null,
  });
}

function buildExportRows(
  database: LocalDatabase,
  stallId: string,
  reportType: ReportTypeDto,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
): ReportRowDto[] {
  const pageSize = 100;
  let offset = 0;
  const all: ReportRowDto[] = [];
  for (;;) {
    let page: { rows: ReportRowDto[]; totalCount: number };
    switch (reportType) {
      case "payments":
        page = loadPaymentsReport(database, stallId, filters, watermarks, pageSize, offset);
        break;
      case "vegetable_prices":
        page = loadPricesReport(database, stallId, filters, watermarks, pageSize, offset);
        break;
      case "corrections_reversals":
        page = loadCorrectionsReport(database, stallId, filters, watermarks, pageSize, offset);
        break;
      case "outstanding":
        page = loadOutstandingReport(database, stallId, filters, watermarks, pageSize, offset);
        break;
      default:
        page = loadSalesReport(
          database,
          stallId,
          reportType,
          filters,
          watermarks,
          pageSize,
          offset,
        );
    }
    all.push(...page.rows);
    if (all.length > REPORT_EXPORT_MAX_ROWS) {
      throw validationError(
        `Export exceeds ${REPORT_EXPORT_MAX_ROWS} rows; narrow the date range or filters.`,
        [{ path: "filters", code: "EXPORT_TOO_LARGE", message: "Too many rows" }],
      );
    }
    offset += page.rows.length;
    if (page.rows.length === 0 || offset >= page.totalCount) break;
  }
  return all;
}

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

export function createReportExportJob(
  deps: CommandDeps,
  context: ExecutionContext,
  input: CreateReportExportRequest,
  createOperationId: string,
): CreateReportExportResponse {
  const existing = getReportExportJobByCreateOperationId(
    deps.database,
    context.stallId,
    createOperationId,
  );
  if (existing) {
    return createReportExportResponseSchema.parse({ job: toExportJobDto(existing) });
  }

  const filters = normalizeFilters(input.filters);
  const reportType = input.reportType as ReportType;
  try {
    assertFiltersAllowed(reportType, filters as Record<string, unknown>);
    if (filters.fromBusinessDate && filters.toBusinessDate) {
      assertDateRangeWithinLimit(filters.fromBusinessDate, filters.toBusinessDate);
    }
  } catch (error) {
    mapDomainError(error);
  }

  const { payload, token, watermarks } = resolveOrCreateReportSnapshot({
    database: deps.database,
    stallId: context.stallId,
    reportType,
    filters,
    snapshotToken: input.snapshotToken,
    nowIso: deps.now(),
  });

  const def = getReportDefinition(reportType);
  const rows = buildExportRows(
    deps.database,
    context.stallId,
    input.reportType,
    filters,
    watermarks,
  );
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
      title: def.title,
      stallId: context.stallId,
      dateBasisLabel: def.dateBasisLabel,
      fromBusinessDate: filters.fromBusinessDate ?? null,
      toBusinessDate: filters.toBusinessDate ?? null,
      asOfBusinessDate: filters.asOfBusinessDate ?? null,
      recordingCutoffAt: payload.capturedAt,
      currency: "LKR",
      weightUnit: "kg",
      definitionVersion: REPORT_DEFINITION_VERSION,
      columns,
      rows: rows.map((r) => ({
        rowId: r.rowId,
        label: r.label,
        businessDate: r.businessDate,
        farmerName: r.farmerName,
        buyerName: r.buyerName,
        vegetableName: r.vegetableName,
        statusLabel: r.statusLabel,
        sourceRef: r.sourceRef,
        metricsJson: JSON.stringify(r.metrics),
        notes: r.notes,
      })),
    });
    contentBytes = Buffer.from(csv, "utf8");
    contentType = "text/csv; charset=utf-8";
  } else {
    const identity = getStallPrintIdentity(deps.database);
    const html = renderReportPdfHtml({
      stallDisplayName: identity?.displayName ?? `Stall ${context.stallId}`,
      stallAddress: identity?.address ?? null,
      reportTitle: def.title,
      filterSummary: JSON.stringify(filters),
      dateBasisLabel: def.dateBasisLabel,
      recordingCutoffAt: payload.capturedAt,
      generatedAt: deps.now(),
      currency: "LKR",
      weightUnit: "kg",
      summaryLines: Object.entries(
        rows.reduce((acc, r) => {
          for (const [k, v] of Object.entries(r.metrics)) {
            if (typeof v === "number") addMetric(acc, k, v);
          }
          return acc;
        }, emptyTotals()),
      ).map(
        ([k, v]) =>
          `${k}: ${typeof v === "number" && k.includes("minor") ? formatReportMoneyCell(v) : k.includes("weight") ? formatReportWeightCell(v) : String(v)}`,
      ),
      columnHeaders: ["Date", "Label", "Status", "Source", "Metrics"],
      rows: rows.map((r) => ({
        cells: [
          r.businessDate ?? "",
          r.label,
          r.statusLabel ?? "",
          r.sourceRef ?? "",
          JSON.stringify(r.metrics),
        ],
      })),
    });
    contentBytes = Buffer.from(html, "utf8");
    contentType = "text/html; charset=utf-8";
  }

  const contentSha256 = createHash("sha256").update(contentBytes).digest("hex");
  const jobId = deps.createId();
  const createdAt = deps.now();
  const expiresAt = new Date(Date.parse(createdAt) + EXPORT_TTL_MS).toISOString();

  const job = runInTransaction(deps.database.db, (tx) => {
    const created = insertReportExportJob(tx, {
      id: jobId,
      stallId: context.stallId,
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
      createdByStaffId: context.actorRef,
      createdByDeviceId: context.deviceRef,
      createOperationId,
      createdAt,
      expiresAt,
      readyAt: createdAt,
    });

    const eventPayload = reportExportJobEventPayloadSchema.parse({
      exportJobId: created.id,
      reportType: created.reportType,
      format: created.format,
      snapshotToken: created.snapshotToken,
      rowCount: created.rowCount,
      status: created.status,
      filterFingerprint: created.filterFingerprint,
    });

    appendAuditEvent(tx, {
      id: deps.createId(),
      stallId: context.stallId,
      tenantId: context.tenantId,
      actorRef: context.actorRef,
      deviceRef: context.deviceRef,
      action: REPORT_EXPORT_JOB_CREATED_EVENT_TYPE,
      targetType: "report_export_job",
      targetId: created.id,
      occurredAt: createdAt,
      correlationRef: context.requestId,
      reason: null,
      changeDetailsJson: JSON.stringify({
        eventType: REPORT_EXPORT_JOB_READY_EVENT_TYPE,
        schemaVersion: REPORT_EVENT_SCHEMA_VERSION,
        payload: eventPayload,
      }),
    });

    return created;
  });

  return createReportExportResponseSchema.parse({ job: toExportJobDto(job) });
}

export function loadReportExportArtifact(
  database: LocalDatabase,
  stallId: string,
  jobId: string,
  nowIso: string,
  staffId: string,
): ReportExportArtifactDto {
  const job = getReportExportJobById(database, stallId, jobId);
  if (job === null) {
    throw notFoundError("Export job not found.");
  }
  if (job.createdByStaffId !== staffId) {
    throw forbiddenError("Export job belongs to another session principal.");
  }
  if (Date.parse(nowIso) > Date.parse(job.expiresAt)) {
    markReportExportJobExpired(database, stallId, jobId);
    throw conflictError("Export job expired; create a new export.");
  }
  if (job.status !== "ready") {
    throw conflictError(`Export job is not ready (status=${job.status}).`);
  }
  const bytes = getReportExportJobContent(database, stallId, jobId);
  if (bytes === null || job.byteLength === null || !job.contentType) {
    throw conflictError("Export artifact is missing; create a new export.");
  }
  const contentType =
    job.format === "csv"
      ? ("text/csv; charset=utf-8" as const)
      : ("text/html; charset=utf-8" as const);
  return reportExportArtifactSchema.parse({
    job: toExportJobDto(job),
    contentBase64: Buffer.from(bytes).toString("base64"),
    contentType,
    byteLength: job.byteLength,
  });
}
