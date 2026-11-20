import {
  REPORT_DEFINITION_VERSION,
  reportQuerySchema,
  reportResponseSchema,
  type ReportFiltersDto,
  type ReportQuery,
  type ReportResponse,
  type ReportRowDto,
  type ReportSummaryTotalsDto,
  type ReportTypeDto,
} from "@polivo/contracts";
import {
  listReportCorrections,
  listReportPayments,
  listReportSaleLines,
  listEligibleFarmerSaleLineObligations,
  listEligibleTraderBillObligations,
  listUnappliedPaymentsAtWatermark,
  sumAccountBalanceAtWatermark,
  type ReportCorrectionRow,
  type ReportPaymentRow,
  type ReportSaleLineRow,
  type ReportingWatermarks,
  type UserReportingClient,
} from "@polivo/db-cloud";
import {
  DomainError,
  addMetric,
  assertDateRangeWithinLimit,
  assertFiltersAllowed,
  buildVegetablePriceDay,
  decodeReportPageCursor,
  emptyTotals,
  encodeReportPageCursor,
  getReportDefinition,
  type ReportType,
  type VegetablePriceDay,
} from "@polivo/domain";

import { conflictError } from "@/lib/auth/errors";

import { stallBinding } from "./client";
import { mapReportDomainError } from "./errors";
import {
  normalizeReportFilters,
  reportSnapshotMeta,
  resolveOrCreateReportSnapshot,
} from "./snapshot";

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

export function sumSaleMetrics(lines: readonly ReportSaleLineRow[]): ReportSummaryTotalsDto {
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

export function groupSaleRows(
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

async function loadSalesReport(
  client: UserReportingClient,
  tenantId: string,
  reportType: ReportTypeDto,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): Promise<{ rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number }> {
  const { stallId } = stallBinding(tenantId);
  const base = {
    tenantId,
    stallId,
    fromBusinessDate: filters.fromBusinessDate!,
    toBusinessDate: filters.toBusinessDate!,
    watermarks,
    farmerId: filters.farmerId,
    buyerId: filters.buyerId,
    vegetableId: filters.vegetableId,
  };
  const allLines = await listReportSaleLines(client, base);
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
  return { rows: rows.slice(offset, offset + limit), summary, totalCount };
}

async function loadPaymentsReport(
  client: UserReportingClient,
  tenantId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): Promise<{ rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number }> {
  const { stallId } = stallBinding(tenantId);
  const base = {
    tenantId,
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
  const all = await listReportPayments(client, base);
  const summary = emptyTotals() as ReportSummaryTotalsDto;
  for (const payment of all) {
    addMetric(summary, "payment_count", 1);
    if (payment.status === "posted") {
      addMetric(summary, "payment_gross_minor", payment.amountMinor);
      addMetric(summary, "payment_net_minor", payment.amountMinor);
    } else {
      addMetric(summary, "payment_reversal_minor", payment.amountMinor);
      addMetric(summary, "payment_net_minor", -payment.amountMinor);
    }
    addMetric(summary, "allocated_minor", payment.allocatedTotalMinor);
    addMetric(summary, "unapplied_minor", payment.unappliedAmountMinor);
  }
  let rows = all.map(paymentToRow);
  if (filters.grouping && filters.grouping !== "none") {
    const buckets = new Map<string, ReportPaymentRow[]>();
    for (const payment of all) {
      const key =
        filters.grouping === "business_date"
          ? payment.businessDate
          : filters.grouping === "payment_method"
            ? payment.method
            : filters.grouping === "farmer"
              ? (payment.farmerId ?? "none")
              : filters.grouping === "buyer"
                ? (payment.traderId ?? "none")
                : payment.paymentId;
      const list = buckets.get(key) ?? [];
      list.push(payment);
      buckets.set(key, list);
    }
    rows = [];
    for (const [key, group] of buckets) {
      const metrics = emptyTotals() as ReportSummaryTotalsDto;
      for (const payment of group) {
        addMetric(metrics, "payment_count", 1);
        if (payment.status === "posted") {
          addMetric(metrics, "payment_gross_minor", payment.amountMinor);
          addMetric(metrics, "payment_net_minor", payment.amountMinor);
        } else {
          addMetric(metrics, "payment_reversal_minor", payment.amountMinor);
          addMetric(metrics, "payment_net_minor", -payment.amountMinor);
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

async function loadPricesReport(
  client: UserReportingClient,
  tenantId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): Promise<{ rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number }> {
  const { stallId } = stallBinding(tenantId);
  const from = filters.fromBusinessDate!;
  const to = filters.toBusinessDate!;
  const lines = await listReportSaleLines(client, {
    tenantId,
    stallId,
    fromBusinessDate: from,
    toBusinessDate: to,
    watermarks,
    vegetableId: filters.vegetableId,
    activeOnly: true,
  });
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  const lookback = fromDate.toISOString().slice(0, 10);
  const priorLines = await listReportSaleLines(client, {
    tenantId,
    stallId,
    fromBusinessDate: lookback,
    toBusinessDate: lookback,
    watermarks,
    vegetableId: filters.vegetableId,
    activeOnly: true,
  });

  const vegetableIds = new Set<string>();
  for (const line of [...priorLines, ...lines]) {
    vegetableIds.add(line.vegetableId);
  }

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
    const vegLines = [...priorLines, ...lines].filter((line) => line.vegetableId === vegetableId);
    const name = vegLines[0]?.vegetableDisplayName ?? vegetableId;
    const priorDayLines = priorLines.filter((line) => line.vegetableId === vegetableId);
    let prior: VegetablePriceDay | null = buildVegetablePriceDay({
      vegetableId,
      businessDate: lookback,
      sales: priorDayLines.map((line) => ({
        sellingPricePerKgMinor: line.unitPricePerKgMinor,
        netWeightHundredths: line.netWeightHundredths,
        saleAmountMinor: line.saleAmountMinor,
        cancelled: false,
      })),
      prior: null,
    });
    for (const day of days) {
      const daySales = lines.filter(
        (line) => line.vegetableId === vegetableId && line.businessDate === day,
      );
      const built = buildVegetablePriceDay({
        vegetableId,
        businessDate: day,
        sales: daySales.map((line) => ({
          sellingPricePerKgMinor: line.unitPricePerKgMinor,
          netWeightHundredths: line.netWeightHundredths,
          saleAmountMinor: line.saleAmountMinor,
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

function correctionToRow(op: ReportCorrectionRow): ReportRowDto {
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
}

async function loadCorrectionsReport(
  client: UserReportingClient,
  tenantId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): Promise<{ rows: ReportRowDto[]; summary: ReportSummaryTotalsDto; totalCount: number }> {
  const { stallId } = stallBinding(tenantId);
  const all = await listReportCorrections(client, {
    tenantId,
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
    return correctionToRow(op);
  });
  return { rows: rows.slice(offset, offset + limit), summary, totalCount: rows.length };
}

async function loadOutstandingReport(
  client: UserReportingClient,
  tenantId: string,
  filters: ReportFiltersDto,
  watermarks: ReportingWatermarks,
  limit: number,
  offset: number,
): Promise<{
  rows: ReportRowDto[];
  summary: ReportSummaryTotalsDto;
  totalCount: number;
  limitations: string[];
}> {
  const { stallId } = stallBinding(tenantId);
  const asOf = filters.asOfBusinessDate!;
  const limitations = [
    "Outstanding uses cloud obligation queries at the same cutoff.",
    "Aging unavailable.",
    "Historical outstanding reconstruction unavailable on web.",
    "Opening-balance draft obligations are limited until opening drafts are fully replicated to cloud; trader bills, farmer sale-line entitlements, unapplied payments, and ledger balance at cutoff are included.",
  ];
  const rows: ReportRowDto[] = [];
  const summary = emptyTotals() as ReportSummaryTotalsDto;

  const partyKind: "farmer" | "trader" = filters.farmerId ? "farmer" : "trader";
  const partyId = (filters.farmerId ?? filters.buyerId)!;

  const obligations =
    partyKind === "trader"
      ? await listEligibleTraderBillObligations(client, tenantId, stallId, partyId)
      : await listEligibleFarmerSaleLineObligations(client, tenantId, stallId, partyId);

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

  const unapplied = await listUnappliedPaymentsAtWatermark(
    client,
    tenantId,
    stallId,
    partyKind,
    partyId,
    watermarks,
    asOf,
  );
  let unappliedTotal = 0;
  for (const item of unapplied) {
    unappliedTotal += item.unappliedAmountMinor;
    rows.push({
      rowId: `unapplied:${item.paymentId}`,
      label: `Unapplied ${item.referenceNumber}`,
      businessDate: item.businessDate,
      farmerId: partyKind === "farmer" ? partyId : null,
      farmerName: null,
      buyerId: partyKind === "trader" ? partyId : null,
      buyerName: null,
      vegetableId: null,
      vegetableName: null,
      paymentMethod: item.method,
      paymentDirection: null,
      statusLabel: "unapplied",
      sourceRef: item.referenceNumber,
      metrics: { unapplied_minor: item.unappliedAmountMinor },
      notes: null,
    });
  }
  addMetric(summary, "unapplied_minor", unappliedTotal);

  const balance = await sumAccountBalanceAtWatermark(
    client,
    tenantId,
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

export async function loadReport(
  client: UserReportingClient,
  tenantId: string,
  query: ReportQuery,
  nowIso: string,
): Promise<ReportResponse> {
  const parsed = reportQuerySchema.parse(query);
  const filters = normalizeReportFilters(parsed.filters);
  const reportType = parsed.reportType as ReportType;
  const { stallId } = stallBinding(tenantId);

  try {
    assertFiltersAllowed(reportType, filters as Record<string, unknown>);
    if (filters.fromBusinessDate && filters.toBusinessDate) {
      assertDateRangeWithinLimit(filters.fromBusinessDate, filters.toBusinessDate);
    }
  } catch (error) {
    mapReportDomainError(error);
  }

  const definition = getReportDefinition(reportType);
  const { payload, token, watermarks } = await resolveOrCreateReportSnapshot({
    client,
    tenantId,
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
      if (error instanceof DomainError) {
        mapReportDomainError(error);
      }
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
      result = await loadPaymentsReport(client, tenantId, filters, watermarks, limit, offset);
      break;
    case "vegetable_prices":
      result = await loadPricesReport(client, tenantId, filters, watermarks, limit, offset);
      break;
    case "corrections_reversals":
      result = await loadCorrectionsReport(client, tenantId, filters, watermarks, limit, offset);
      break;
    case "outstanding":
      result = await loadOutstandingReport(client, tenantId, filters, watermarks, limit, offset);
      break;
    default:
      result = await loadSalesReport(
        client,
        tenantId,
        reportType,
        filters,
        watermarks,
        limit,
        offset,
      );
  }

  const nextOffset = offset + result.rows.length;
  const nextCursor =
    nextOffset < result.totalCount
      ? encodeReportPageCursor({ snapshotToken: token, offset: nextOffset })
      : null;

  return reportResponseSchema.parse({
    reportType,
    definitionVersion: REPORT_DEFINITION_VERSION,
    scope: {
      stallId,
      currency: "LKR",
      weightUnit: "kg",
      businessTimezone: "UTC",
      dateModel: definition.dateModel,
      dateBasisLabel: definition.dateBasisLabel,
    },
    normalizedFilters: filters,
    snapshot: reportSnapshotMeta(token, payload),
    summary: result.summary,
    rows: result.rows,
    nextCursor,
    rowCountEstimate: result.totalCount,
    limitations: [...definition.limitations, ...(result.limitations ?? [])],
    emptyReason: result.totalCount === 0 ? "no_activity" : null,
  });
}
