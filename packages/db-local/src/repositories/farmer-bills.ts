import {
  moneyMinorFromSqliteInteger,
  moneyMinorToSqliteInteger,
  weightHundredthsFromSqliteInteger,
} from "../numeric.js";
import {
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireInteger,
  requireString,
} from "../mapping/errors.js";
import { RepositoryError, type DbExecutor } from "./types.js";

export type FarmerSaleLineQueryRow = {
  saleLineId: string;
  saleId: string;
  traderBillId: string | null;
  traderBillNumber: string | null;
  traderId: string;
  traderDisplayName: string;
  businessDate: string;
  vegetableId: string;
  vegetableCode: string;
  vegetableDisplayName: string;
  packageCount: number;
  netWeightHundredths: number;
  unitPricePerKgMinor: number;
  saleAmountMinor: number;
  commissionAmountMinor: number;
  farmerReceivesMinor: number;
  inclusionStatus: "unbilled" | "billed";
  farmerBillId: string | null;
  farmerBillNumber: string | null;
  commissionPolicyId: string | null;
  commissionVersionId: string | null;
  commissionBandId: string | null;
  appliedCommissionRatePerKgMinor: number | null;
  salePostingId: string | null;
  packageTypeId: string | null;
  packageTypeCode: string | null;
  packageTypeDisplayName: string | null;
};

export type FarmerSalesSummaryRecord = {
  farmerId: string;
  matchingLineCount: number;
  unbilledLineCount: number;
  billedLineCount: number;
  totalNetWeightHundredths: number;
  totalSaleAmountMinor: number;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
};

export type FarmerBillLineInsertInput = {
  id: string;
  saleId: string;
  saleLineId: string;
  lineOrder: number;
  traderBillId: string | null;
  traderBillNumber: string | null;
  businessDate: string;
  vegetableId: string;
  vegetableShortCode: string;
  vegetableDisplayName: string;
  packageTypeId: string | null;
  packageTypeShortCode: string | null;
  packageTypeDisplayName: string | null;
  packageCount: number;
  netWeightHundredths: number;
  unitPricePerKgMinor: number;
  saleAmountMinor: number;
  commissionAmountMinor: number;
  farmerReceivesMinor: number;
  commissionPolicyId: string | null;
  commissionVersionId: string | null;
  commissionBandId: string | null;
  appliedCommissionRatePerKgMinor: number | null;
  salePostingId: string | null;
};

export type InsertFarmerBillInput = {
  id: string;
  stallId: string;
  farmerId: string;
  farmerShortCode: string;
  farmerDisplayName: string;
  stallDisplayName: string | null;
  stallAddress: string | null;
  billNumber: string;
  businessDate: string;
  coveredBusinessDateFrom: string;
  coveredBusinessDateTo: string;
  totalSaleAmountMinor: number;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
  totalAmountMinor: number;
  selectionFingerprint: string;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
  lines: readonly FarmerBillLineInsertInput[];
};

export type FarmerBillLineRecord = FarmerBillLineInsertInput & {
  stallId: string;
  farmerBillId: string;
  createdAt: string;
};

export type FarmerBillDetailRecord = {
  id: string;
  stallId: string;
  farmerId: string;
  farmerShortCode: string;
  farmerDisplayName: string;
  stallDisplayName: string | null;
  stallAddress: string | null;
  billType: "farmer";
  billNumber: string;
  businessDate: string;
  status: "finalized";
  coveredBusinessDateFrom: string;
  coveredBusinessDateTo: string;
  totalSaleAmountMinor: number;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
  totalAmountMinor: number;
  currency: "LKR";
  paymentStatus: "unpaid" | "partially_paid" | "fully_paid";
  selectionFingerprint: string;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
  lines: FarmerBillLineRecord[];
};

export type FarmerBillListItem = {
  id: string;
  farmerId: string;
  farmerDisplayName: string;
  billNumber: string;
  businessDate: string;
  coveredBusinessDateFrom: string;
  coveredBusinessDateTo: string;
  totalSaleAmountMinor: number;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
  paymentStatus: "unpaid" | "partially_paid" | "fully_paid";
  finalizedAt: string;
};

export type ListFarmerSalesInput = {
  stallId: string;
  farmerId: string;
  limit: number;
  offset: number;
  businessDateFrom?: string;
  businessDateTo?: string;
  vegetableId?: string;
  traderId?: string;
  inclusionStatus?: "unbilled" | "billed";
};

function farmerSalesWhere(input: ListFarmerSalesInput): {
  where: string;
  params: Array<string | number>;
} {
  const params: Array<string | number> = [input.stallId, input.farmerId];
  let where = `
    sl.stall_id = ?
    AND sl.farmer_id = ?
    AND s.status = 'finalized'
    AND s.correction_status = 'active'
  `;
  if (input.businessDateFrom !== undefined) {
    where += ` AND s.business_date >= ?`;
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += ` AND s.business_date <= ?`;
    params.push(input.businessDateTo);
  }
  if (input.vegetableId !== undefined) {
    where += ` AND sl.vegetable_id = ?`;
    params.push(input.vegetableId);
  }
  if (input.traderId !== undefined) {
    where += ` AND s.trader_id = ?`;
    params.push(input.traderId);
  }
  if (input.inclusionStatus === "unbilled") {
    where += ` AND fbl.sale_line_id IS NULL`;
  } else if (input.inclusionStatus === "billed") {
    where += ` AND fbl.sale_line_id IS NOT NULL`;
  }
  return { where, params };
}

const FARMER_SALES_FROM = `
  FROM sale_lines sl
  INNER JOIN sales s ON s.id = sl.sale_id AND s.stall_id = sl.stall_id
  INNER JOIN traders t ON t.id = s.trader_id AND t.stall_id = s.stall_id
  LEFT JOIN trader_bills tb ON tb.sale_id = s.id AND tb.stall_id = s.stall_id AND tb.status = 'finalized'
  LEFT JOIN farmer_bill_lines fbl ON fbl.sale_line_id = sl.id AND fbl.stall_id = sl.stall_id
  LEFT JOIN farmer_bills fb ON fb.id = fbl.farmer_bill_id AND fb.stall_id = fbl.stall_id
`;

function mapFarmerSaleLineRow(row: Record<string, unknown>): FarmerSaleLineQueryRow {
  const farmerBillId = optionalString(row["farmer_bill_id"], "farmer_bill_id");
  return {
    saleLineId: requireString(row["sale_line_id"], "sale_line_id"),
    saleId: requireString(row["sale_id"], "sale_id"),
    traderBillId: optionalString(row["trader_bill_id"], "trader_bill_id"),
    traderBillNumber: optionalString(row["trader_bill_number"], "trader_bill_number"),
    traderId: requireString(row["trader_id"], "trader_id"),
    traderDisplayName: requireString(row["trader_display_name"], "trader_display_name"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    vegetableId: requireString(row["vegetable_id"], "vegetable_id"),
    vegetableCode: requireString(row["vegetable_code"], "vegetable_code"),
    vegetableDisplayName: requireString(row["vegetable_display_name"], "vegetable_display_name"),
    packageCount: requireInteger(row["package_count"], "package_count"),
    netWeightHundredths: weightHundredthsFromSqliteInteger(row["net_weight_hundredths"]),
    unitPricePerKgMinor: moneyMinorFromSqliteInteger(row["unit_price_per_kg_minor"]),
    saleAmountMinor: moneyMinorFromSqliteInteger(row["sale_amount_minor"]),
    commissionAmountMinor: moneyMinorFromSqliteInteger(row["commission_amount_minor"]),
    farmerReceivesMinor: moneyMinorFromSqliteInteger(row["farmer_receives_minor"]),
    inclusionStatus: farmerBillId === null ? "unbilled" : "billed",
    farmerBillId,
    farmerBillNumber: optionalString(row["farmer_bill_number"], "farmer_bill_number"),
    commissionPolicyId: optionalString(row["commission_policy_id"], "commission_policy_id"),
    commissionVersionId: optionalString(row["commission_version_id"], "commission_version_id"),
    commissionBandId: optionalString(row["commission_band_id"], "commission_band_id"),
    appliedCommissionRatePerKgMinor:
      row["applied_commission_rate_per_kg_minor"] === null ||
      row["applied_commission_rate_per_kg_minor"] === undefined
        ? null
        : moneyMinorFromSqliteInteger(row["applied_commission_rate_per_kg_minor"]),
    salePostingId: optionalString(row["sale_posting_id"], "sale_posting_id"),
    packageTypeId: optionalString(row["package_type_id"], "package_type_id"),
    packageTypeCode: optionalString(row["package_type_code"], "package_type_code"),
    packageTypeDisplayName: optionalString(
      row["package_type_display_name"],
      "package_type_display_name",
    ),
  };
}

const FARMER_SALES_SELECT = `
  SELECT
    sl.id AS sale_line_id,
    sl.sale_id AS sale_id,
    tb.id AS trader_bill_id,
    tb.bill_number AS trader_bill_number,
    s.trader_id AS trader_id,
    COALESCE(s.trader_display_name, t.display_name) AS trader_display_name,
    s.business_date AS business_date,
    sl.vegetable_id AS vegetable_id,
    COALESCE(sl.vegetable_short_code, '') AS vegetable_code,
    COALESCE(sl.vegetable_display_name, '') AS vegetable_display_name,
    (
      SELECT COUNT(*)
      FROM sale_line_package_weights pw
      WHERE pw.stall_id = sl.stall_id AND pw.sale_line_id = sl.id
    ) AS package_count,
    COALESCE(sl.net_weight_hundredths, 0) AS net_weight_hundredths,
    sl.unit_price_per_kg_minor AS unit_price_per_kg_minor,
    COALESCE(sl.line_sale_amount_minor, 0) AS sale_amount_minor,
    COALESCE(sl.applied_commission_amount_minor, 0) AS commission_amount_minor,
    COALESCE(sl.farmer_receives_minor, 0) AS farmer_receives_minor,
    fb.id AS farmer_bill_id,
    fb.bill_number AS farmer_bill_number,
    sl.commission_policy_id AS commission_policy_id,
    sl.commission_version_id AS commission_version_id,
    sl.commission_band_id AS commission_band_id,
    sl.applied_commission_rate_per_kg_minor AS applied_commission_rate_per_kg_minor,
    s.posting_id AS sale_posting_id,
    sl.package_type_id AS package_type_id,
    sl.package_type_short_code AS package_type_code,
    sl.package_type_display_name AS package_type_display_name
`;

export function summarizeFarmerSales(
  executor: DbExecutor,
  input: Omit<ListFarmerSalesInput, "limit" | "offset">,
): FarmerSalesSummaryRecord {
  const { where, params } = farmerSalesWhere({ ...input, limit: 0, offset: 0 });
  const row = executor.db
    .prepare(
      `SELECT
         COUNT(*) AS matching_line_count,
         COALESCE(SUM(CASE WHEN fbl.sale_line_id IS NULL THEN 1 ELSE 0 END), 0) AS unbilled_line_count,
         COALESCE(SUM(CASE WHEN fbl.sale_line_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS billed_line_count,
         COALESCE(SUM(COALESCE(sl.net_weight_hundredths, 0)), 0) AS total_net_weight_hundredths,
         COALESCE(SUM(COALESCE(sl.line_sale_amount_minor, 0)), 0) AS total_sale_amount_minor,
         COALESCE(SUM(COALESCE(sl.applied_commission_amount_minor, 0)), 0) AS total_commission_minor,
         COALESCE(SUM(COALESCE(sl.farmer_receives_minor, 0)), 0) AS total_farmer_receives_minor
       ${FARMER_SALES_FROM}
       WHERE ${where}`,
    )
    .get(...params) as Record<string, unknown>;

  return {
    farmerId: input.farmerId,
    matchingLineCount: requireInteger(row["matching_line_count"], "matching_line_count"),
    unbilledLineCount: requireInteger(row["unbilled_line_count"], "unbilled_line_count"),
    billedLineCount: requireInteger(row["billed_line_count"], "billed_line_count"),
    totalNetWeightHundredths: weightHundredthsFromSqliteInteger(row["total_net_weight_hundredths"]),
    totalSaleAmountMinor: moneyMinorFromSqliteInteger(row["total_sale_amount_minor"]),
    totalCommissionMinor: moneyMinorFromSqliteInteger(row["total_commission_minor"]),
    totalFarmerReceivesMinor: moneyMinorFromSqliteInteger(row["total_farmer_receives_minor"]),
  };
}

export function listFarmerSaleLines(
  executor: DbExecutor,
  input: ListFarmerSalesInput,
): { items: FarmerSaleLineQueryRow[]; totalCount: number } {
  const { where, params } = farmerSalesWhere(input);
  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count ${FARMER_SALES_FROM} WHERE ${where}`)
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const rows = executor.db
    .prepare(
      `${FARMER_SALES_SELECT}
       ${FARMER_SALES_FROM}
       WHERE ${where}
       ORDER BY s.business_date DESC, s.finalized_at DESC, sl.line_order ASC, sl.id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, input.limit, input.offset) as Array<Record<string, unknown>>;

  return {
    totalCount,
    items: rows.map(mapFarmerSaleLineRow),
  };
}

export function loadEligibleFarmerSaleLinesByIds(
  executor: DbExecutor,
  input: {
    stallId: string;
    farmerId: string;
    saleLineIds: readonly string[];
  },
): FarmerSaleLineQueryRow[] {
  if (input.saleLineIds.length === 0) {
    return [];
  }
  const placeholders = input.saleLineIds.map(() => "?").join(", ");
  const rows = executor.db
    .prepare(
      `${FARMER_SALES_SELECT}
       ${FARMER_SALES_FROM}
       WHERE sl.stall_id = ?
         AND sl.farmer_id = ?
         AND s.status = 'finalized'
         AND s.correction_status = 'active'
         AND sl.id IN (${placeholders})
       ORDER BY s.business_date ASC, sl.line_order ASC, sl.id ASC`,
    )
    .all(input.stallId, input.farmerId, ...input.saleLineIds) as Array<Record<string, unknown>>;

  return rows.map(mapFarmerSaleLineRow);
}

export function findOriginalFarmerBillInclusion(
  executor: DbExecutor,
  stallId: string,
  saleLineId: string,
): { farmerBillId: string; billNumber: string } | null {
  const row = executor.db
    .prepare(
      `SELECT fbl.farmer_bill_id AS farmer_bill_id, fb.bill_number AS bill_number
       FROM farmer_bill_lines fbl
       INNER JOIN farmer_bills fb ON fb.id = fbl.farmer_bill_id AND fb.stall_id = fbl.stall_id
       WHERE fbl.stall_id = ? AND fbl.sale_line_id = ?`,
    )
    .get(stallId, saleLineId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    farmerBillId: requireString(row["farmer_bill_id"], "farmer_bill_id"),
    billNumber: requireString(row["bill_number"], "bill_number"),
  };
}

export function insertFinalizedFarmerBill(
  executor: DbExecutor,
  input: InsertFarmerBillInput,
): FarmerBillDetailRecord {
  executor.db
    .prepare(
      `INSERT INTO farmer_bills (
         id, stall_id, farmer_id, farmer_short_code, farmer_display_name, bill_type,
         bill_number, business_date, status, revision,
         covered_business_date_from, covered_business_date_to,
         total_sale_amount_minor, total_commission_minor, total_farmer_receives_minor,
         total_amount_minor, currency, payment_status, selection_fingerprint,
         finalized_at, created_at, updated_at,
         stall_display_name, stall_address
       ) VALUES (
         ?, ?, ?, ?, ?, 'farmer',
         ?, ?, 'finalized', 1,
         ?, ?,
         ?, ?, ?,
         ?, 'LKR', 'unpaid', ?,
         ?, ?, ?,
         ?, ?
       )`,
    )
    .run(
      input.id,
      input.stallId,
      input.farmerId,
      input.farmerShortCode,
      input.farmerDisplayName,
      input.billNumber,
      input.businessDate,
      input.coveredBusinessDateFrom,
      input.coveredBusinessDateTo,
      moneyMinorToSqliteInteger(input.totalSaleAmountMinor),
      moneyMinorToSqliteInteger(input.totalCommissionMinor),
      moneyMinorToSqliteInteger(input.totalFarmerReceivesMinor),
      moneyMinorToSqliteInteger(input.totalAmountMinor),
      input.selectionFingerprint,
      input.finalizedAt,
      input.createdAt,
      input.updatedAt,
      input.stallDisplayName,
      input.stallAddress,
    );

  const insertLine = executor.db.prepare(
    `INSERT INTO farmer_bill_lines (
       id, stall_id, farmer_bill_id, sale_id, sale_line_id, line_order,
       trader_bill_id, trader_bill_number, business_date,
       vegetable_id, vegetable_short_code, vegetable_display_name,
       package_type_id, package_type_short_code, package_type_display_name,
       package_count, net_weight_hundredths, unit_price_per_kg_minor,
       sale_amount_minor, commission_amount_minor, farmer_receives_minor,
       commission_policy_id, commission_version_id, commission_band_id,
       applied_commission_rate_per_kg_minor, sale_posting_id, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?
     )`,
  );

  for (const line of input.lines) {
    insertLine.run(
      line.id,
      input.stallId,
      input.id,
      line.saleId,
      line.saleLineId,
      line.lineOrder,
      line.traderBillId,
      line.traderBillNumber,
      line.businessDate,
      line.vegetableId,
      line.vegetableShortCode,
      line.vegetableDisplayName,
      line.packageTypeId,
      line.packageTypeShortCode,
      line.packageTypeDisplayName,
      line.packageCount,
      line.netWeightHundredths,
      moneyMinorToSqliteInteger(line.unitPricePerKgMinor),
      moneyMinorToSqliteInteger(line.saleAmountMinor),
      moneyMinorToSqliteInteger(line.commissionAmountMinor),
      moneyMinorToSqliteInteger(line.farmerReceivesMinor),
      line.commissionPolicyId,
      line.commissionVersionId,
      line.commissionBandId,
      line.appliedCommissionRatePerKgMinor === null
        ? null
        : moneyMinorToSqliteInteger(line.appliedCommissionRatePerKgMinor),
      line.salePostingId,
      input.createdAt,
    );
  }

  const created = getFarmerBillById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load farmer bill after insert.");
  }
  return created;
}

function mapFarmerBillLine(row: Record<string, unknown>): FarmerBillLineRecord {
  return {
    id: requireString(row["id"], "farmer_bill_lines.id"),
    stallId: requireString(row["stall_id"], "farmer_bill_lines.stall_id"),
    farmerBillId: requireString(row["farmer_bill_id"], "farmer_bill_lines.farmer_bill_id"),
    saleId: requireString(row["sale_id"], "farmer_bill_lines.sale_id"),
    saleLineId: requireString(row["sale_line_id"], "farmer_bill_lines.sale_line_id"),
    lineOrder: requireInteger(row["line_order"], "farmer_bill_lines.line_order"),
    traderBillId: optionalString(row["trader_bill_id"], "farmer_bill_lines.trader_bill_id"),
    traderBillNumber: optionalString(
      row["trader_bill_number"],
      "farmer_bill_lines.trader_bill_number",
    ),
    businessDate: requireCalendarDate(row["business_date"], "farmer_bill_lines.business_date"),
    vegetableId: requireString(row["vegetable_id"], "farmer_bill_lines.vegetable_id"),
    vegetableShortCode: requireString(
      row["vegetable_short_code"],
      "farmer_bill_lines.vegetable_short_code",
    ),
    vegetableDisplayName: requireString(
      row["vegetable_display_name"],
      "farmer_bill_lines.vegetable_display_name",
    ),
    packageTypeId: optionalString(row["package_type_id"], "farmer_bill_lines.package_type_id"),
    packageTypeShortCode: optionalString(
      row["package_type_short_code"],
      "farmer_bill_lines.package_type_short_code",
    ),
    packageTypeDisplayName: optionalString(
      row["package_type_display_name"],
      "farmer_bill_lines.package_type_display_name",
    ),
    packageCount: requireInteger(row["package_count"], "farmer_bill_lines.package_count"),
    netWeightHundredths: weightHundredthsFromSqliteInteger(row["net_weight_hundredths"]),
    unitPricePerKgMinor: moneyMinorFromSqliteInteger(row["unit_price_per_kg_minor"]),
    saleAmountMinor: moneyMinorFromSqliteInteger(row["sale_amount_minor"]),
    commissionAmountMinor: moneyMinorFromSqliteInteger(row["commission_amount_minor"]),
    farmerReceivesMinor: moneyMinorFromSqliteInteger(row["farmer_receives_minor"]),
    commissionPolicyId: optionalString(
      row["commission_policy_id"],
      "farmer_bill_lines.commission_policy_id",
    ),
    commissionVersionId: optionalString(
      row["commission_version_id"],
      "farmer_bill_lines.commission_version_id",
    ),
    commissionBandId: optionalString(
      row["commission_band_id"],
      "farmer_bill_lines.commission_band_id",
    ),
    appliedCommissionRatePerKgMinor:
      row["applied_commission_rate_per_kg_minor"] === null ||
      row["applied_commission_rate_per_kg_minor"] === undefined
        ? null
        : moneyMinorFromSqliteInteger(row["applied_commission_rate_per_kg_minor"]),
    salePostingId: optionalString(row["sale_posting_id"], "farmer_bill_lines.sale_posting_id"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "farmer_bill_lines.created_at"),
  };
}

export function getFarmerBillById(
  executor: DbExecutor,
  stallId: string,
  billId: string,
): FarmerBillDetailRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, farmer_id, farmer_short_code, farmer_display_name, bill_type,
              stall_display_name, stall_address,
              bill_number, business_date, status, covered_business_date_from, covered_business_date_to,
              total_sale_amount_minor, total_commission_minor, total_farmer_receives_minor,
              total_amount_minor, currency, payment_status, selection_fingerprint,
              finalized_at, created_at, updated_at
       FROM farmer_bills
       WHERE id = ? AND stall_id = ?`,
    )
    .get(billId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }

  const status = requireString(row["status"], "farmer_bills.status");
  if (status !== "finalized") {
    throw new RepositoryError(`Expected finalized farmer bill, got ${status}`);
  }
  const paymentStatus = requireString(row["payment_status"], "farmer_bills.payment_status");
  if (
    paymentStatus !== "unpaid" &&
    paymentStatus !== "partially_paid" &&
    paymentStatus !== "fully_paid"
  ) {
    throw new RepositoryError(`Unexpected payment status: ${paymentStatus}`);
  }

  const lineRows = executor.db
    .prepare(
      `SELECT id, stall_id, farmer_bill_id, sale_id, sale_line_id, line_order,
              trader_bill_id, trader_bill_number, business_date,
              vegetable_id, vegetable_short_code, vegetable_display_name,
              package_type_id, package_type_short_code, package_type_display_name,
              package_count, net_weight_hundredths, unit_price_per_kg_minor,
              sale_amount_minor, commission_amount_minor, farmer_receives_minor,
              commission_policy_id, commission_version_id, commission_band_id,
              applied_commission_rate_per_kg_minor, sale_posting_id, created_at
       FROM farmer_bill_lines
       WHERE stall_id = ? AND farmer_bill_id = ?
       ORDER BY line_order ASC`,
    )
    .all(stallId, billId) as Array<Record<string, unknown>>;

  return {
    id: requireString(row["id"], "farmer_bills.id"),
    stallId: requireString(row["stall_id"], "farmer_bills.stall_id"),
    farmerId: requireString(row["farmer_id"], "farmer_bills.farmer_id"),
    farmerShortCode: requireString(row["farmer_short_code"], "farmer_bills.farmer_short_code"),
    farmerDisplayName: requireString(
      row["farmer_display_name"],
      "farmer_bills.farmer_display_name",
    ),
    stallDisplayName: optionalString(row["stall_display_name"], "farmer_bills.stall_display_name"),
    stallAddress: optionalString(row["stall_address"], "farmer_bills.stall_address"),
    billType: "farmer",
    billNumber: requireString(row["bill_number"], "farmer_bills.bill_number"),
    businessDate: requireCalendarDate(row["business_date"], "farmer_bills.business_date"),
    status: "finalized",
    coveredBusinessDateFrom: requireCalendarDate(
      row["covered_business_date_from"],
      "farmer_bills.covered_business_date_from",
    ),
    coveredBusinessDateTo: requireCalendarDate(
      row["covered_business_date_to"],
      "farmer_bills.covered_business_date_to",
    ),
    totalSaleAmountMinor: moneyMinorFromSqliteInteger(row["total_sale_amount_minor"]),
    totalCommissionMinor: moneyMinorFromSqliteInteger(row["total_commission_minor"]),
    totalFarmerReceivesMinor: moneyMinorFromSqliteInteger(row["total_farmer_receives_minor"]),
    totalAmountMinor: moneyMinorFromSqliteInteger(row["total_amount_minor"]),
    currency: "LKR",
    paymentStatus,
    selectionFingerprint: requireString(
      row["selection_fingerprint"],
      "farmer_bills.selection_fingerprint",
    ),
    finalizedAt: requireAbsoluteTimestamp(row["finalized_at"], "farmer_bills.finalized_at"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "farmer_bills.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "farmer_bills.updated_at"),
    lines: lineRows.map(mapFarmerBillLine),
  };
}

export function listFinalizedFarmerBills(
  executor: DbExecutor,
  input: {
    stallId: string;
    limit: number;
    offset: number;
    farmerId?: string;
    billNumber?: string;
    businessDateFrom?: string;
    businessDateTo?: string;
  },
): { items: FarmerBillListItem[]; totalCount: number } {
  const params: Array<string | number> = [input.stallId];
  let where = `fb.stall_id = ? AND fb.status = 'finalized'`;
  if (input.farmerId !== undefined) {
    where += ` AND fb.farmer_id = ?`;
    params.push(input.farmerId);
  }
  if (input.billNumber !== undefined) {
    where += ` AND fb.bill_number = ?`;
    params.push(input.billNumber);
  }
  if (input.businessDateFrom !== undefined) {
    where += ` AND fb.business_date >= ?`;
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += ` AND fb.business_date <= ?`;
    params.push(input.businessDateTo);
  }

  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM farmer_bills fb WHERE ${where}`)
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const rows = executor.db
    .prepare(
      `SELECT fb.id, fb.farmer_id, fb.farmer_display_name, fb.bill_number, fb.business_date,
              fb.covered_business_date_from, fb.covered_business_date_to,
              fb.total_sale_amount_minor, fb.total_commission_minor, fb.total_farmer_receives_minor,
              fb.payment_status, fb.finalized_at
       FROM farmer_bills fb
       WHERE ${where}
       ORDER BY fb.finalized_at DESC, fb.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, input.limit, input.offset) as Array<Record<string, unknown>>;

  return {
    totalCount,
    items: rows.map((row) => {
      const paymentStatus = requireString(row["payment_status"], "payment_status");
      if (
        paymentStatus !== "unpaid" &&
        paymentStatus !== "partially_paid" &&
        paymentStatus !== "fully_paid"
      ) {
        throw new RepositoryError(`Unexpected payment status: ${paymentStatus}`);
      }
      return {
        id: requireString(row["id"], "farmer_bills.id"),
        farmerId: requireString(row["farmer_id"], "farmer_bills.farmer_id"),
        farmerDisplayName: requireString(row["farmer_display_name"], "farmer_display_name"),
        billNumber: requireString(row["bill_number"], "bill_number"),
        businessDate: requireCalendarDate(row["business_date"], "business_date"),
        coveredBusinessDateFrom: requireCalendarDate(
          row["covered_business_date_from"],
          "covered_business_date_from",
        ),
        coveredBusinessDateTo: requireCalendarDate(
          row["covered_business_date_to"],
          "covered_business_date_to",
        ),
        totalSaleAmountMinor: moneyMinorFromSqliteInteger(row["total_sale_amount_minor"]),
        totalCommissionMinor: moneyMinorFromSqliteInteger(row["total_commission_minor"]),
        totalFarmerReceivesMinor: moneyMinorFromSqliteInteger(row["total_farmer_receives_minor"]),
        paymentStatus,
        finalizedAt: requireAbsoluteTimestamp(row["finalized_at"], "finalized_at"),
      };
    }),
  };
}
