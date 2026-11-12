import { DomainError } from "./money.js";
import {
  STATEMENT_SNAPSHOT_TTL_MS,
  buildSnapshotExpiry,
  isSnapshotExpired,
  type StatementSnapshotWatermarks,
} from "./account-statements.js";
import {
  escapePrintText,
  formatMoneyMinorForPrint,
  formatWeightHundredthsForPrint,
} from "./printing.js";
import { summarizePublicPrices, type FinalizedSalePricePoint } from "./public-prices.js";

/** Pure fingerprint for filter binding (no Node crypto — safe for Electron renderer). */
function fingerprintMaterial(material: string): string {
  let hash = 2166136261;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Expand with a second pass for collision resistance sufficient for filter binding.
  let hash2 = 0x811c9dc5;
  for (let i = material.length - 1; i >= 0; i -= 1) {
    hash2 ^= material.charCodeAt(i);
    hash2 = Math.imul(hash2, 16777619);
  }
  const a = (hash >>> 0).toString(16).padStart(8, "0");
  const b = (hash2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}${a}${b}`.slice(0, 32);
}

export const REPORT_DEFINITION_VERSION = "1" as const;
export const REPORT_SNAPSHOT_TTL_MS = STATEMENT_SNAPSHOT_TTL_MS;
export const REPORT_EXPORT_MAX_ROWS = 50_000;
export const REPORT_MAX_DATE_RANGE_DAYS = 366;

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
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportDateModel = "activity_range" | "effective_as_of" | "outstanding_as_of";

export type ReportFilterKey =
  | "fromBusinessDate"
  | "toBusinessDate"
  | "asOfBusinessDate"
  | "farmerId"
  | "buyerId"
  | "vegetableId"
  | "paymentMethod"
  | "paymentDirection"
  | "paymentStatus"
  | "grouping"
  | "sort";

export type ReportGrouping =
  "business_date" | "vegetable" | "farmer" | "buyer" | "payment_method" | "none";

export type ReportMetricDefinition = {
  key: string;
  sourceRecords: string;
  unit: "count" | "weight_hundredths" | "money_minor" | "price_per_kg_minor";
  includedLifecycleStates: string;
  dateBasis: string;
  correctionTreatment: string;
  currencyOrWeight: string;
  rounding: string;
  applicableFilters: readonly ReportFilterKey[];
  drillDownQuery: string;
};

export type ReportDefinition = {
  reportType: ReportType;
  title: string;
  description: string;
  dateModel: ReportDateModel;
  dateBasisLabel: string;
  supportedFilters: readonly ReportFilterKey[];
  supportedGroupings: readonly ReportGrouping[];
  available: boolean;
  unavailableReason: string | null;
  metrics: readonly ReportMetricDefinition[];
  limitations: readonly string[];
};

const COMMON_SALES_FILTERS: readonly ReportFilterKey[] = [
  "fromBusinessDate",
  "toBusinessDate",
  "farmerId",
  "buyerId",
  "vegetableId",
  "grouping",
  "sort",
];

const SALES_METRICS: readonly ReportMetricDefinition[] = [
  {
    key: "package_count",
    sourceRecords: "Finalized sale package weight rows for eligible sale lines",
    unit: "count",
    includedLifecycleStates:
      "finalized sales; activity includes reversed/superseded and replacements by effective date",
    dateBasis: "sale business_date",
    correctionTreatment:
      "Activity: signed events on their effective dates; do not rewrite earlier periods",
    currencyOrWeight: "count",
    rounding: "integer count",
    applicableFilters: COMMON_SALES_FILTERS,
    drillDownQuery: "sales_detail",
  },
  {
    key: "weight_hundredths",
    sourceRecords: "sale_lines.net_weight_hundredths on eligible finalized lines",
    unit: "weight_hundredths",
    includedLifecycleStates: "finalized; activity model preserves reversal signs",
    dateBasis: "sale business_date",
    correctionTreatment: "Activity: original/reversal/replacement as separate signed events",
    currencyOrWeight: "kg (hundredths)",
    rounding: "integer hundredths",
    applicableFilters: COMMON_SALES_FILTERS,
    drillDownQuery: "sales_detail",
  },
  {
    key: "gross_sale_minor",
    sourceRecords: "sale_lines.line_sale_amount_minor (recorded at finalize)",
    unit: "money_minor",
    includedLifecycleStates: "finalized",
    dateBasis: "sale business_date",
    correctionTreatment: "Do not recompute from current prices",
    currencyOrWeight: "LKR paisa",
    rounding: "recorded per-bag half-up totals",
    applicableFilters: COMMON_SALES_FILTERS,
    drillDownQuery: "sales_detail",
  },
  {
    key: "commission_minor",
    sourceRecords: "sale_lines.applied_commission_amount_minor snapshots",
    unit: "money_minor",
    includedLifecycleStates: "finalized",
    dateBasis: "sale business_date",
    correctionTreatment: "Use recorded commission; never recompute with current bands",
    currencyOrWeight: "LKR paisa",
    rounding: "recorded snapshot",
    applicableFilters: COMMON_SALES_FILTERS,
    drillDownQuery: "commission",
  },
  {
    key: "farmer_entitlement_minor",
    sourceRecords:
      "sale_lines.farmer_receives_minor; identity gross − commission where model applies",
    unit: "money_minor",
    includedLifecycleStates: "finalized",
    dateBasis: "sale business_date",
    correctionTreatment: "Recorded entitlement; reconcile to gross − commission",
    currencyOrWeight: "LKR paisa",
    rounding: "recorded",
    applicableFilters: COMMON_SALES_FILTERS,
    drillDownQuery: "farmer_activity",
  },
];

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    reportType: "sales_summary",
    title: "Sales summary",
    description: "Gross sales, weight, commission, and farmer entitlement",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: COMMON_SALES_FILTERS,
    supportedGroupings: ["business_date", "vegetable", "farmer", "buyer", "none"],
    available: true,
    unavailableReason: null,
    metrics: SALES_METRICS,
    limitations: [
      "Do not label gross vegetable turnover as stall profit.",
      "Farmer-bill issuance is not a second sale.",
    ],
  },
  {
    reportType: "sales_detail",
    title: "Sales detail",
    description: "Traceable finalized sale-line activity",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: COMMON_SALES_FILTERS,
    supportedGroupings: ["none"],
    available: true,
    unavailableReason: null,
    metrics: SALES_METRICS,
    limitations: ["Original, reversed, and replacement lines shown with status labels."],
  },
  {
    reportType: "vegetable_sales",
    title: "Vegetable sales",
    description: "Quantity and amount breakdown by vegetable",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: [
      "fromBusinessDate",
      "toBusinessDate",
      "vegetableId",
      "farmerId",
      "buyerId",
      "sort",
    ],
    supportedGroupings: ["vegetable", "business_date", "none"],
    available: true,
    unavailableReason: null,
    metrics: SALES_METRICS,
    limitations: ["Category reports unavailable while categories remain deferred."],
  },
  {
    reportType: "farmer_activity",
    title: "Farmer activity",
    description: "Farmer-attributed sales, commission, and entitlement",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: ["fromBusinessDate", "toBusinessDate", "farmerId", "vegetableId", "sort"],
    supportedGroupings: ["farmer", "business_date", "vegetable", "none"],
    available: true,
    unavailableReason: null,
    metrics: SALES_METRICS,
    limitations: [],
  },
  {
    reportType: "buyer_activity",
    title: "Buyer activity",
    description: "Buyer-attributed sales and obligations",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: ["fromBusinessDate", "toBusinessDate", "buyerId", "vegetableId", "sort"],
    supportedGroupings: ["buyer", "business_date", "vegetable", "none"],
    available: true,
    unavailableReason: null,
    metrics: SALES_METRICS,
    limitations: [],
  },
  {
    reportType: "commission",
    title: "Commission",
    description: "Recorded commission by date and source",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by sale business date",
    supportedFilters: [
      "fromBusinessDate",
      "toBusinessDate",
      "farmerId",
      "vegetableId",
      "grouping",
      "sort",
    ],
    supportedGroupings: ["business_date", "vegetable", "farmer", "none"],
    available: true,
    unavailableReason: null,
    metrics: [
      SALES_METRICS.find((m) => m.key === "commission_minor")!,
      SALES_METRICS.find((m) => m.key === "weight_hundredths")!,
      SALES_METRICS.find((m) => m.key === "gross_sale_minor")!,
    ],
    limitations: ["Commission from recorded snapshots only."],
  },
  {
    reportType: "payments",
    title: "Payments",
    description: "Receipts and payouts by method and direction",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by payment business date (cheque at handover)",
    supportedFilters: [
      "fromBusinessDate",
      "toBusinessDate",
      "farmerId",
      "buyerId",
      "paymentMethod",
      "paymentDirection",
      "paymentStatus",
      "grouping",
      "sort",
    ],
    supportedGroupings: ["business_date", "payment_method", "farmer", "buyer", "none"],
    available: true,
    unavailableReason: null,
    metrics: [
      {
        key: "payment_gross_minor",
        sourceRecords: "Posted payments",
        unit: "money_minor",
        includedLifecycleStates: "posted and reversed (shown separately)",
        dateBasis: "payment business_date / cheque handover",
        correctionTreatment: "Reversals as separate signed amounts",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: [
          "fromBusinessDate",
          "toBusinessDate",
          "paymentMethod",
          "paymentDirection",
          "paymentStatus",
        ],
        drillDownQuery: "payments",
      },
      {
        key: "payment_reversal_minor",
        sourceRecords: "Reversal payment rows",
        unit: "money_minor",
        includedLifecycleStates: "reversed",
        dateBasis: "reversal business_date",
        correctionTreatment: "Shown separately from originals",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["fromBusinessDate", "toBusinessDate", "paymentMethod"],
        drillDownQuery: "payments",
      },
      {
        key: "payment_net_minor",
        sourceRecords: "Posted minus reversal amounts",
        unit: "money_minor",
        includedLifecycleStates: "net of posted and reversed",
        dateBasis: "payment business_date",
        correctionTreatment: "Net after reversals",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "payments",
      },
      {
        key: "allocated_minor",
        sourceRecords: "Active payment allocations (not additional receipts)",
        unit: "money_minor",
        includedLifecycleStates: "allocations active at cutoff",
        dateBasis: "allocation created_at vs cutoff",
        correctionTreatment: "Released allocations excluded at cutoff",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "payments",
      },
      {
        key: "unapplied_minor",
        sourceRecords: "Unapplied payment remainder",
        unit: "money_minor",
        includedLifecycleStates: "posted payments with unapplied remainder",
        dateBasis: "payment business_date",
        correctionTreatment: "At snapshot cutoff",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "payments",
      },
    ],
    limitations: [
      "Allocations are not additional receipts or payouts.",
      "Cash movement summary is not a verified cash-drawer balance.",
      "Manually recorded bank transfers are not independently reconciled bank activity.",
      "No pending-clearance cheque totals.",
    ],
  },
  {
    reportType: "outstanding",
    title: "Outstanding",
    description: "Remaining obligations and supported unapplied payments",
    dateModel: "outstanding_as_of",
    dateBasisLabel: "Outstanding as of business date at recording cutoff",
    supportedFilters: ["asOfBusinessDate", "farmerId", "buyerId", "sort"],
    supportedGroupings: ["farmer", "buyer", "none"],
    available: true,
    unavailableReason: null,
    metrics: [
      {
        key: "remaining_obligations_minor",
        sourceRecords:
          "Phase 28 obligation queries (trader_bill, farmer_sale_line, opening_balance)",
        unit: "money_minor",
        includedLifecycleStates: "remaining at as-of + cutoff",
        dateBasis: "as-of business date + recording cutoff",
        correctionTreatment: "Reuse Phase 28 reconstruction",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["asOfBusinessDate", "farmerId", "buyerId"],
        drillDownQuery: "Phase 28 outstanding",
      },
      {
        key: "unapplied_minor",
        sourceRecords: "Phase 28 unapplied payments",
        unit: "money_minor",
        includedLifecycleStates: "unapplied at cutoff",
        dateBasis: "as-of + cutoff",
        correctionTreatment: "Reuse Phase 28",
        currencyOrWeight: "LKR paisa",
        rounding: "recorded",
        applicableFilters: ["asOfBusinessDate", "farmerId", "buyerId"],
        drillDownQuery: "Phase 28 unapplied",
      },
    ],
    limitations: [
      "Remaining obligations, unapplied funds, and net balance stay separate.",
      "Farmer and buyer roles are never netted for the same person.",
      "Aging unavailable (no approved due-date rule).",
      "Account statements remain on Phase 28 APIs.",
    ],
  },
  {
    reportType: "vegetable_prices",
    title: "Vegetable prices",
    description: "Minimum, maximum, and weight-weighted average price",
    dateModel: "effective_as_of",
    dateBasisLabel: "Eligible finalized sale-line prices by business date",
    supportedFilters: ["fromBusinessDate", "toBusinessDate", "vegetableId", "sort"],
    supportedGroupings: ["vegetable", "business_date", "none"],
    available: true,
    unavailableReason: null,
    metrics: [
      {
        key: "price_min_per_kg_minor",
        sourceRecords: "Eligible finalized sale-line unit prices",
        unit: "price_per_kg_minor",
        includedLifecycleStates: "finalized active effective sources at cutoff",
        dateBasis: "sale business_date",
        correctionTreatment: "Recompute when corrections remove/replace eligible sources",
        currencyOrWeight: "LKR paisa per kg",
        rounding: "recorded unit price",
        applicableFilters: ["fromBusinessDate", "toBusinessDate", "vegetableId"],
        drillDownQuery: "sales_detail",
      },
      {
        key: "price_max_per_kg_minor",
        sourceRecords: "Eligible finalized sale-line unit prices",
        unit: "price_per_kg_minor",
        includedLifecycleStates: "finalized active effective sources at cutoff",
        dateBasis: "sale business_date",
        correctionTreatment: "Recompute on correction",
        currencyOrWeight: "LKR paisa per kg",
        rounding: "recorded unit price",
        applicableFilters: ["fromBusinessDate", "toBusinessDate", "vegetableId"],
        drillDownQuery: "sales_detail",
      },
      {
        key: "price_avg_per_kg_minor",
        sourceRecords:
          "Weight-weighted average: total rounded saleAmountMinor ÷ total net kg (summarizePublicPrices)",
        unit: "price_per_kg_minor",
        includedLifecycleStates: "finalized non-cancelled eligible lines",
        dateBasis: "sale business_date",
        correctionTreatment: "Recompute from eligible sources; numerator uses rounded line totals",
        currencyOrWeight: "LKR paisa per kg",
        rounding: "half-up via roundHalfUpRatio",
        applicableFilters: ["fromBusinessDate", "toBusinessDate", "vegetableId"],
        drillDownQuery: "sales_detail",
      },
    ],
    limitations: [
      "Average numerator uses rounded monetary line totals, not exact price×weight before rounding.",
      "Do not average already-averaged daily values across longer periods.",
      "Carry-forward shows observation date; no fabricated volume or commission.",
      "Market-wide prices from one stall are not claimed.",
    ],
  },
  {
    reportType: "corrections_reversals",
    title: "Corrections and reversals",
    description: "Original, reversal, and replacement activity",
    dateModel: "activity_range",
    dateBasisLabel: "Activity by correction operation business date",
    supportedFilters: ["fromBusinessDate", "toBusinessDate", "farmerId", "buyerId", "sort"],
    supportedGroupings: ["business_date", "none"],
    available: true,
    unavailableReason: null,
    metrics: [
      {
        key: "original_count",
        sourceRecords: "sale_correction_operations originals",
        unit: "count",
        includedLifecycleStates: "recorded correction operations",
        dateBasis: "correction business_date",
        correctionTreatment: "Listed with lineage references",
        currencyOrWeight: "count",
        rounding: "integer",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "sales_detail",
      },
      {
        key: "reversal_count",
        sourceRecords: "Reversal sales from correction operations",
        unit: "count",
        includedLifecycleStates: "reversed",
        dateBasis: "correction business_date",
        correctionTreatment: "Linked to original",
        currencyOrWeight: "count",
        rounding: "integer",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "sales_detail",
      },
      {
        key: "replacement_count",
        sourceRecords: "Replacement sales from correction operations",
        unit: "count",
        includedLifecycleStates: "replacement finalized",
        dateBasis: "correction business_date",
        correctionTreatment: "Linked to original",
        currencyOrWeight: "count",
        rounding: "integer",
        applicableFilters: ["fromBusinessDate", "toBusinessDate"],
        drillDownQuery: "sales_detail",
      },
    ],
    limitations: [],
  },
];

export function getReportDefinition(reportType: ReportType): ReportDefinition {
  const found = REPORT_DEFINITIONS.find((d) => d.reportType === reportType);
  if (!found) {
    throw new DomainError("INVALID_REPORT", `Unknown report type: ${reportType}`);
  }
  return found;
}

export function assertFiltersAllowed(
  reportType: ReportType,
  filters: Readonly<Record<string, unknown>>,
): void {
  const def = getReportDefinition(reportType);
  const allowed = new Set<string>(def.supportedFilters);
  for (const key of Object.keys(filters)) {
    if (filters[key] === undefined || filters[key] === null) continue;
    if (!allowed.has(key)) {
      throw new DomainError(
        "UNSUPPORTED_FILTER",
        `Filter "${key}" is not supported for report ${reportType}`,
      );
    }
  }
  const grouping = filters["grouping"];
  if (typeof grouping === "string" && grouping !== "none") {
    if (!def.supportedGroupings.includes(grouping as ReportGrouping)) {
      throw new DomainError(
        "UNSUPPORTED_GROUPING",
        `Grouping "${grouping}" is not supported for report ${reportType}`,
      );
    }
  }
}

export function assertDateRangeWithinLimit(
  fromBusinessDate: string,
  toBusinessDate: string,
  maxDays = REPORT_MAX_DATE_RANGE_DAYS,
): void {
  const from = Date.parse(`${fromBusinessDate}T00:00:00.000Z`);
  const to = Date.parse(`${toBusinessDate}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
    throw new DomainError("INVALID_DATE_RANGE", "Invalid report date range");
  }
  const days = Math.floor((to - from) / 86_400_000) + 1;
  if (days > maxDays) {
    throw new DomainError(
      "DATE_RANGE_TOO_LARGE",
      `Report date range exceeds ${maxDays} days; narrow the range`,
    );
  }
}

export function fingerprintReportFilters(filters: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return fingerprintMaterial(JSON.stringify(entries));
}

export type ReportSnapshotWatermarks = StatementSnapshotWatermarks;

export type ReportSnapshotPayload = {
  v: 1;
  kind: "report";
  stallId: string;
  reportType: ReportType;
  definitionVersion: typeof REPORT_DEFINITION_VERSION;
  currency: "LKR";
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  capturedAt: string;
  expiresAt: string;
  watermarks: ReportSnapshotWatermarks;
  filterFingerprint: string;
};

export type ReportSnapshotBinding = {
  stallId: string;
  reportType: ReportType;
  definitionVersion: typeof REPORT_DEFINITION_VERSION;
  currency: "LKR";
  fromBusinessDate?: string | null;
  toBusinessDate?: string | null;
  asOfBusinessDate?: string | null;
  filterFingerprint: string;
};

export function encodeReportSnapshotToken(payload: ReportSnapshotPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeReportSnapshotToken(token: string): ReportSnapshotPayload {
  let json: string;
  try {
    json = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new DomainError("INVALID_SNAPSHOT", "Report snapshot token is not valid base64url");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DomainError("INVALID_SNAPSHOT", "Report snapshot token JSON is invalid");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new DomainError("INVALID_SNAPSHOT", "Report snapshot payload must be an object");
  }
  const p = parsed as Record<string, unknown>;
  if (p["v"] !== 1 || p["kind"] !== "report") {
    throw new DomainError("INVALID_SNAPSHOT", "Unsupported report snapshot version");
  }
  if (typeof p["stallId"] !== "string" || typeof p["reportType"] !== "string") {
    throw new DomainError("INVALID_SNAPSHOT", "Report snapshot missing required fields");
  }
  if (!REPORT_TYPES.includes(p["reportType"] as ReportType)) {
    throw new DomainError("INVALID_SNAPSHOT", "Report snapshot has unknown report type");
  }
  return parsed as ReportSnapshotPayload;
}

export function assertReportSnapshotMatchesBinding(
  payload: ReportSnapshotPayload,
  binding: ReportSnapshotBinding,
  nowIso: string,
): void {
  if (isSnapshotExpired(payload.expiresAt, nowIso)) {
    throw new DomainError("SNAPSHOT_EXPIRED", "Reporting snapshot expired; refresh required");
  }
  if (
    payload.stallId !== binding.stallId ||
    payload.reportType !== binding.reportType ||
    payload.definitionVersion !== binding.definitionVersion ||
    payload.currency !== binding.currency ||
    payload.filterFingerprint !== binding.filterFingerprint ||
    (payload.fromBusinessDate ?? null) !== (binding.fromBusinessDate ?? null) ||
    (payload.toBusinessDate ?? null) !== (binding.toBusinessDate ?? null) ||
    (payload.asOfBusinessDate ?? null) !== (binding.asOfBusinessDate ?? null)
  ) {
    throw new DomainError("SNAPSHOT_MISMATCH", "Snapshot does not match this report query");
  }
}

export function createReportSnapshotPayload(input: {
  stallId: string;
  reportType: ReportType;
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  filterFingerprint: string;
  watermarks: ReportSnapshotWatermarks;
  capturedAt: string;
}): ReportSnapshotPayload {
  return {
    v: 1,
    kind: "report",
    stallId: input.stallId,
    reportType: input.reportType,
    definitionVersion: REPORT_DEFINITION_VERSION,
    currency: "LKR",
    fromBusinessDate: input.fromBusinessDate,
    toBusinessDate: input.toBusinessDate,
    asOfBusinessDate: input.asOfBusinessDate,
    capturedAt: input.capturedAt,
    expiresAt: buildSnapshotExpiry(input.capturedAt, REPORT_SNAPSHOT_TTL_MS),
    watermarks: input.watermarks,
    filterFingerprint: input.filterFingerprint,
  };
}

export function encodeReportPageCursor(input: { snapshotToken: string; offset: number }): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeReportPageCursor(cursor: string): { snapshotToken: string; offset: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new DomainError("INVALID_CURSOR", "Report pagination cursor is invalid");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["snapshotToken"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["offset"] !== "number"
  ) {
    throw new DomainError("INVALID_CURSOR", "Report pagination cursor is invalid");
  }
  const offset = (parsed as { offset: number }).offset;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new DomainError("INVALID_CURSOR", "Report pagination offset is invalid");
  }
  return parsed as { snapshotToken: string; offset: number };
}

/** Carry-forward daily price observation. */
export type VegetablePriceDay = {
  vegetableId: string;
  businessDate: string;
  minPerKgMinor: number | null;
  maxPerKgMinor: number | null;
  avgPerKgMinor: number | null;
  eligibleLineCount: number;
  soldWeightHundredths: number;
  observationDate: string | null;
  carriedForward: boolean;
  priceUnavailable: boolean;
};

export function buildVegetablePriceDay(input: {
  vegetableId: string;
  businessDate: string;
  sales: readonly FinalizedSalePricePoint[];
  prior: VegetablePriceDay | null;
}): VegetablePriceDay {
  const summary = summarizePublicPrices(input.sales);
  if (summary !== null) {
    return {
      vegetableId: input.vegetableId,
      businessDate: input.businessDate,
      minPerKgMinor: summary.lowPerKgMinor,
      maxPerKgMinor: summary.highPerKgMinor,
      avgPerKgMinor: summary.averagePerKgMinor,
      eligibleLineCount: input.sales.filter((s) => !s.cancelled).length,
      soldWeightHundredths: summary.totalNetWeightHundredths,
      observationDate: input.businessDate,
      carriedForward: false,
      priceUnavailable: false,
    };
  }
  if (input.prior !== null && !input.prior.priceUnavailable) {
    return {
      vegetableId: input.vegetableId,
      businessDate: input.businessDate,
      minPerKgMinor: input.prior.minPerKgMinor,
      maxPerKgMinor: input.prior.maxPerKgMinor,
      avgPerKgMinor: input.prior.avgPerKgMinor,
      eligibleLineCount: 0,
      soldWeightHundredths: 0,
      observationDate: input.prior.observationDate,
      carriedForward: true,
      priceUnavailable: false,
    };
  }
  return {
    vegetableId: input.vegetableId,
    businessDate: input.businessDate,
    minPerKgMinor: null,
    maxPerKgMinor: null,
    avgPerKgMinor: null,
    eligibleLineCount: 0,
    soldWeightHundredths: 0,
    observationDate: null,
    carriedForward: false,
    priceUnavailable: true,
  };
}

/**
 * Neutralize spreadsheet formula injection for user-controlled CSV text.
 * Does not alter legitimate typed negative numeric cells (caller passes those as numbers).
 */
export function neutralizeCsvFormulaCell(value: string): string {
  if (value.length === 0) return value;
  const first = value[0]!;
  if (
    first === "=" ||
    first === "+" ||
    first === "-" ||
    first === "@" ||
    first === "\t" ||
    first === "\r"
  ) {
    return `'${value}`;
  }
  // Control-character variants that some spreadsheet apps treat as formulas.
  if (value.charCodeAt(0) < 32) {
    return `'${value}`;
  }
  return value;
}

export function serializeCsvCell(
  value: string | number | null | undefined,
  options?: { numeric?: boolean },
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new DomainError("INVALID_CSV", "CSV numeric cell must be finite");
    }
    return String(value);
  }
  const text = options?.numeric ? value : neutralizeCsvFormulaCell(value);
  const needsQuotes =
    text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r");
  if (!needsQuotes) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export type ReportCsvColumn = {
  key: string;
  header: string;
};

export function buildReportCsv(input: {
  reportType: ReportType;
  title: string;
  stallId: string;
  dateBasisLabel: string;
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  recordingCutoffAt: string;
  currency: string;
  weightUnit: string;
  definitionVersion: string;
  columns: readonly ReportCsvColumn[];
  rows: readonly Readonly<Record<string, string | number | null>>[];
}): string {
  const metaLines = [
    ["report_type", input.reportType],
    ["title", input.title],
    ["stall_id", input.stallId],
    ["definition_version", input.definitionVersion],
    ["date_basis", input.dateBasisLabel],
    ["from_business_date", input.fromBusinessDate ?? ""],
    ["to_business_date", input.toBusinessDate ?? ""],
    ["as_of_business_date", input.asOfBusinessDate ?? ""],
    ["recording_cutoff_at", input.recordingCutoffAt],
    ["currency", input.currency],
    ["weight_unit", input.weightUnit],
    ["row_count", String(input.rows.length)],
  ];
  const lines: string[] = [];
  lines.push("# polivo_report_manifest_v1");
  for (const [k, v] of metaLines) {
    lines.push(`# ${k}=${serializeCsvCell(v)}`);
  }
  lines.push(input.columns.map((c) => serializeCsvCell(c.header)).join(","));
  for (const row of input.rows) {
    lines.push(
      input.columns
        .map((c) => {
          const raw = row[c.key];
          if (typeof raw === "number") return serializeCsvCell(raw);
          return serializeCsvCell(raw ?? null);
        })
        .join(","),
    );
  }
  // UTF-8 BOM helps Excel preserve Sinhala; machine parsers should tolerate BOM.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export type ReportPdfRow = {
  cells: readonly string[];
};

export function renderReportPdfHtml(input: {
  stallDisplayName: string;
  stallAddress: string | null;
  reportTitle: string;
  filterSummary: string;
  dateBasisLabel: string;
  recordingCutoffAt: string;
  generatedAt: string;
  currency: string;
  weightUnit: string;
  summaryLines: readonly string[];
  columnHeaders: readonly string[];
  rows: readonly ReportPdfRow[];
}): string {
  const headerCells = input.columnHeaders.map((h) => `<th>${escapePrintText(h)}</th>`).join("");
  const bodyRows = input.rows
    .map((row) => `<tr>${row.cells.map((c) => `<td>${escapePrintText(c)}</td>`).join("")}</tr>`)
    .join("\n");
  const summaryHtml = input.summaryLines
    .map((line) => `<li>${escapePrintText(line)}</li>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapePrintText(input.reportTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Noto Sans", "Noto Sans Sinhala", Arial, sans-serif; font-size: 10pt; color: #111; }
  h1 { font-size: 14pt; margin: 0 0 4pt; }
  .meta { margin: 0 0 8pt; color: #333; }
  .meta div { margin: 1pt 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #ccc; padding: 3pt 4pt; vertical-align: top; word-wrap: break-word; }
  th { background: #f3f3f3; text-align: left; }
  thead { display: table-header-group; }
  ul { margin: 4pt 0 8pt; padding-left: 16pt; }
  .footer { margin-top: 8pt; font-size: 8pt; color: #555; }
</style>
</head>
<body>
  <h1>${escapePrintText(input.stallDisplayName)} — ${escapePrintText(input.reportTitle)}</h1>
  <div class="meta">
    ${input.stallAddress ? `<div>${escapePrintText(input.stallAddress)}</div>` : ""}
    <div>Filters: ${escapePrintText(input.filterSummary)}</div>
    <div>Date basis: ${escapePrintText(input.dateBasisLabel)}</div>
    <div>Data cutoff: ${escapePrintText(input.recordingCutoffAt)}</div>
    <div>Currency: ${escapePrintText(input.currency)}; Weight: ${escapePrintText(input.weightUnit)}</div>
    <div>Generated: ${escapePrintText(input.generatedAt)}</div>
  </div>
  <ul>${summaryHtml}</ul>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">PDF export is not an issued bill and is not physical printing.</div>
</body>
</html>`;
}

export function formatReportMoneyCell(minor: number | null): string {
  if (minor === null) return "—";
  return formatMoneyMinorForPrint(minor);
}

export function formatReportWeightCell(hundredths: number | null): string {
  if (hundredths === null) return "—";
  return formatWeightHundredthsForPrint(hundredths);
}

export function defaultReportExportFileName(input: {
  reportType: ReportType;
  format: "csv" | "pdf";
  asOfOrFrom: string;
}): string {
  const safeType = input.reportType.replaceAll("_", "-");
  const safeDate = input.asOfOrFrom.replaceAll(/[^0-9-]/g, "");
  return `polivo-${safeType}-${safeDate}.${input.format}`;
}

export function emptyTotals(): Record<string, number | null> {
  return {};
}

export function addMetric(
  totals: Record<string, number | null>,
  key: string,
  value: number | null,
): void {
  if (value === null) {
    if (!(key in totals)) totals[key] = null;
    return;
  }
  const current = totals[key];
  totals[key] = (current ?? 0) + value;
}

export { buildSnapshotExpiry, isSnapshotExpired };
