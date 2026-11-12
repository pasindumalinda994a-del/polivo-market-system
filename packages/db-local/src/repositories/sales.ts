import {
  moneyMinorFromSqliteInteger,
  moneyMinorToSqliteInteger,
  weightHundredthsFromSqliteInteger,
  weightHundredthsToSqliteInteger,
} from "../numeric.js";
import {
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireInteger,
  requireString,
} from "../mapping/errors.js";
import { RevisionConflictError, RepositoryError, type DbExecutor } from "./types.js";

export type SaleStatus = "draft" | "finalized" | "cancelled";

export type SaleCorrectionStatus = "active" | "reversed" | "superseded";

export type SaleWeightRowRecord = {
  id: string;
  rowKey: string;
  packageIndex: number;
  packageTypeId: string | null;
  grossWeightHundredths: number;
};

export type SaleLineRecord = {
  id: string;
  stallId: string;
  saleId: string;
  lineOrder: number;
  farmerId: string | null;
  farmerShortCode: string | null;
  farmerDisplayName: string | null;
  vegetableId: string;
  vegetableShortCode: string | null;
  vegetableDisplayName: string | null;
  packageTypeId: string | null;
  packageTypeShortCode: string | null;
  packageTypeDisplayName: string | null;
  unitPricePerKgMinor: number;
  packagingWeightHundredths: number;
  notes: string | null;
  weights: SaleWeightRowRecord[];
  grossWeightHundredths: number | null;
  netWeightHundredths: number | null;
  lineSaleAmountMinor: number | null;
  appliedCommissionRatePerKgMinor: number | null;
  appliedCommissionAmountMinor: number | null;
  commissionPolicyId: string | null;
  commissionVersionId: string | null;
  commissionBandId: string | null;
  traderPaysMinor: number | null;
  farmerReceivesMinor: number | null;
};

export type SaleRecord = {
  id: string;
  stallId: string;
  traderId: string;
  traderShortCode: string | null;
  traderDisplayName: string | null;
  businessDate: string;
  status: SaleStatus;
  revision: number;
  correctsSaleId: string | null;
  correctionStatus: SaleCorrectionStatus;
  correctionOperationId: string | null;
  replacementSaleId: string | null;
  reversalPostingId: string | null;
  finalizedAt: string | null;
  commissionPolicyId: string | null;
  commissionVersionId: string | null;
  calculationFingerprint: string | null;
  postingId: string | null;
  totalSaleAmountMinor: number | null;
  totalCommissionMinor: number | null;
  totalTraderPaysMinor: number | null;
  totalFarmerReceivesMinor: number | null;
  lines: SaleLineRecord[];
  createdAt: string;
  updatedAt: string;
};

export type SaleDraftListItem = {
  id: string;
  traderId: string;
  traderDisplayName: string;
  businessDate: string;
  status: "draft";
  revision: number;
  lineCount: number;
  updatedAt: string;
};

export type InsertSaleDraftLineInput = {
  id: string;
  farmerId: string;
  vegetableId: string;
  packageTypeId: string;
  unitPricePerKgMinor: number;
  packagingWeightHundredths: number;
  notes: string | null;
  weights: Array<{
    id: string;
    rowKey: string;
    packageIndex: number;
    packageTypeId?: string | null;
    grossWeightHundredths: number;
  }>;
};

export type InsertSaleDraftInput = {
  id: string;
  stallId: string;
  traderId: string;
  businessDate: string;
  lines: InsertSaleDraftLineInput[];
  createdAt: string;
  updatedAt: string;
  /** Set when creating a replacement sale draft for a correction (ADR 0016). */
  correctsSaleId?: string | null;
};

export type ReplaceSaleDraftInput = {
  stallId: string;
  saleId: string;
  expectedRevision: number;
  traderId: string;
  businessDate: string;
  lines: InsertSaleDraftLineInput[];
  updatedAt: string;
};

export type FinalizeSaleLineSnapshotInput = {
  lineId: string;
  farmerId: string;
  farmerShortCode: string;
  farmerDisplayName: string;
  vegetableShortCode: string;
  vegetableDisplayName: string;
  packageTypeId: string;
  packageTypeShortCode: string;
  packageTypeDisplayName: string;
  grossWeightHundredths: number;
  netWeightHundredths: number;
  lineSaleAmountMinor: number;
  appliedCommissionRatePerKgMinor: number;
  appliedCommissionAmountMinor: number;
  commissionPolicyId: string;
  commissionVersionId: string;
  commissionBandId: string;
  traderPaysMinor: number;
  farmerReceivesMinor: number;
};

export type FinalizeSaleInput = {
  stallId: string;
  saleId: string;
  expectedRevision: number;
  traderShortCode: string;
  traderDisplayName: string;
  commissionPolicyId: string;
  commissionVersionId: string;
  calculationFingerprint: string;
  postingId: string;
  totalSaleAmountMinor: number;
  totalCommissionMinor: number;
  totalTraderPaysMinor: number;
  totalFarmerReceivesMinor: number;
  lineSnapshots: FinalizeSaleLineSnapshotInput[];
  finalizedAt: string;
  updatedAt: string;
};

export type InsertTraderBillInput = {
  id: string;
  stallId: string;
  saleId: string;
  traderId: string;
  traderShortCode: string;
  traderDisplayName: string;
  stallDisplayName: string | null;
  stallAddress: string | null;
  billNumber: string;
  businessDate: string;
  totalAmountMinor: number;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
  commissionPolicyId: string;
  commissionVersionId: string;
  calculationFingerprint: string;
  postingId: string;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TraderBillDetailRecord = {
  id: string;
  stallId: string;
  saleId: string;
  traderId: string;
  traderShortCode: string;
  traderDisplayName: string;
  stallDisplayName: string | null;
  stallAddress: string | null;
  billType: "trader";
  billNumber: string;
  businessDate: string;
  status: "finalized";
  correctionStatus: SaleCorrectionStatus;
  correctionOperationId: string | null;
  replacementTraderBillId: string | null;
  totalAmountMinor: number;
  paymentStatus: "unpaid" | "partially_paid" | "fully_paid";
  commissionPolicyId: string;
  commissionVersionId: string;
  calculationFingerprint: string;
  postingId: string;
  totalCommissionMinor: number;
  totalFarmerReceivesMinor: number;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TraderBillListItem = {
  id: string;
  saleId: string;
  traderId: string;
  traderDisplayName: string;
  billNumber: string;
  businessDate: string;
  totalAmountMinor: number;
  paymentStatus: "unpaid" | "partially_paid" | "fully_paid";
  correctionStatus: SaleCorrectionStatus;
  finalizedAt: string;
};

const SALE_SELECT = `s.id, s.stall_id, s.trader_id, s.trader_short_code, s.trader_display_name,
  s.business_date, s.status, s.revision, s.corrects_sale_id, s.finalized_at,
  s.commission_policy_id, s.commission_version_id, s.calculation_fingerprint, s.posting_id,
  s.total_sale_amount_minor, s.total_commission_minor, s.total_trader_pays_minor,
  s.total_farmer_receives_minor, s.created_at, s.updated_at,
  s.correction_status, s.correction_operation_id, s.replacement_sale_id, s.reversal_posting_id`;

function mapCorrectionStatus(value: unknown): SaleCorrectionStatus {
  const status = optionalString(value, "sales.correction_status") ?? "active";
  if (status !== "active" && status !== "reversed" && status !== "superseded") {
    throw new RepositoryError(`Unexpected sale correction status: ${status}`);
  }
  return status;
}

function mapSaleHeader(row: Record<string, unknown>, lines: SaleLineRecord[]): SaleRecord {
  const status = requireString(row["status"], "sales.status");
  if (status !== "draft" && status !== "finalized" && status !== "cancelled") {
    throw new RepositoryError(`Unexpected sale status: ${status}`);
  }
  return {
    id: requireString(row["id"], "sales.id"),
    stallId: requireString(row["stall_id"], "sales.stall_id"),
    traderId: requireString(row["trader_id"], "sales.trader_id"),
    traderShortCode: optionalString(row["trader_short_code"], "sales.trader_short_code"),
    traderDisplayName: optionalString(row["trader_display_name"], "sales.trader_display_name"),
    businessDate: requireCalendarDate(row["business_date"], "sales.business_date"),
    status,
    revision: requireInteger(row["revision"], "sales.revision"),
    correctsSaleId: optionalString(row["corrects_sale_id"], "sales.corrects_sale_id"),
    correctionStatus: mapCorrectionStatus(row["correction_status"]),
    correctionOperationId: optionalString(
      row["correction_operation_id"],
      "sales.correction_operation_id",
    ),
    replacementSaleId: optionalString(row["replacement_sale_id"], "sales.replacement_sale_id"),
    reversalPostingId: optionalString(row["reversal_posting_id"], "sales.reversal_posting_id"),
    finalizedAt: optionalString(row["finalized_at"], "sales.finalized_at"),
    commissionPolicyId: optionalString(row["commission_policy_id"], "sales.commission_policy_id"),
    commissionVersionId: optionalString(
      row["commission_version_id"],
      "sales.commission_version_id",
    ),
    calculationFingerprint: optionalString(
      row["calculation_fingerprint"],
      "sales.calculation_fingerprint",
    ),
    postingId: optionalString(row["posting_id"], "sales.posting_id"),
    totalSaleAmountMinor: optionalMoney(row["total_sale_amount_minor"]),
    totalCommissionMinor: optionalMoney(row["total_commission_minor"]),
    totalTraderPaysMinor: optionalMoney(row["total_trader_pays_minor"]),
    totalFarmerReceivesMinor: optionalMoney(row["total_farmer_receives_minor"]),
    lines,
    createdAt: requireAbsoluteTimestamp(row["created_at"], "sales.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "sales.updated_at"),
  };
}

function optionalMoney(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return moneyMinorFromSqliteInteger(value);
}

function loadWeights(
  executor: DbExecutor,
  stallId: string,
  saleLineId: string,
): SaleWeightRowRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT id, package_index, row_key, gross_weight_hundredths
       FROM sale_line_package_weights
       WHERE stall_id = ? AND sale_line_id = ?
       ORDER BY package_index ASC`,
    )
    .all(stallId, saleLineId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const packageIndex = requireInteger(row["package_index"], "package_index");
    const rowKey =
      optionalString(row["row_key"], "sale_line_package_weights.row_key") ?? String(packageIndex);
    return {
      id: requireString(row["id"], "sale_line_package_weights.id"),
      rowKey,
      packageIndex,
      packageTypeId: null,
      grossWeightHundredths: weightHundredthsFromSqliteInteger(row["gross_weight_hundredths"]),
    };
  });
}

function loadLines(executor: DbExecutor, stallId: string, saleId: string): SaleLineRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT id, stall_id, sale_id, vegetable_id, line_order, unit_price_per_kg_minor,
              packaging_weight_hundredths, line_sale_amount_minor,
              applied_commission_rate_per_kg_minor, applied_commission_amount_minor,
              package_type_id, notes, farmer_id, farmer_short_code, farmer_display_name,
              vegetable_short_code, vegetable_display_name, package_type_short_code,
              package_type_display_name, gross_weight_hundredths, net_weight_hundredths,
              commission_policy_id, commission_version_id, commission_band_id,
              trader_pays_minor, farmer_receives_minor
       FROM sale_lines
       WHERE stall_id = ? AND sale_id = ?
       ORDER BY line_order ASC`,
    )
    .all(stallId, saleId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const lineId = requireString(row["id"], "sale_lines.id");
    return {
      id: lineId,
      stallId: requireString(row["stall_id"], "sale_lines.stall_id"),
      saleId: requireString(row["sale_id"], "sale_lines.sale_id"),
      lineOrder: requireInteger(row["line_order"], "sale_lines.line_order"),
      farmerId: optionalString(row["farmer_id"], "sale_lines.farmer_id"),
      farmerShortCode: optionalString(row["farmer_short_code"], "sale_lines.farmer_short_code"),
      farmerDisplayName: optionalString(
        row["farmer_display_name"],
        "sale_lines.farmer_display_name",
      ),
      vegetableId: requireString(row["vegetable_id"], "sale_lines.vegetable_id"),
      vegetableShortCode: optionalString(
        row["vegetable_short_code"],
        "sale_lines.vegetable_short_code",
      ),
      vegetableDisplayName: optionalString(
        row["vegetable_display_name"],
        "sale_lines.vegetable_display_name",
      ),
      packageTypeId: optionalString(row["package_type_id"], "sale_lines.package_type_id"),
      packageTypeShortCode: optionalString(
        row["package_type_short_code"],
        "sale_lines.package_type_short_code",
      ),
      packageTypeDisplayName: optionalString(
        row["package_type_display_name"],
        "sale_lines.package_type_display_name",
      ),
      unitPricePerKgMinor: moneyMinorFromSqliteInteger(row["unit_price_per_kg_minor"]),
      packagingWeightHundredths: weightHundredthsFromSqliteInteger(
        row["packaging_weight_hundredths"],
      ),
      notes: optionalString(row["notes"], "sale_lines.notes"),
      weights: loadWeights(executor, stallId, lineId),
      grossWeightHundredths:
        row["gross_weight_hundredths"] === null || row["gross_weight_hundredths"] === undefined
          ? null
          : weightHundredthsFromSqliteInteger(row["gross_weight_hundredths"]),
      netWeightHundredths:
        row["net_weight_hundredths"] === null || row["net_weight_hundredths"] === undefined
          ? null
          : weightHundredthsFromSqliteInteger(row["net_weight_hundredths"]),
      lineSaleAmountMinor: optionalMoney(row["line_sale_amount_minor"]),
      appliedCommissionRatePerKgMinor: optionalMoney(row["applied_commission_rate_per_kg_minor"]),
      appliedCommissionAmountMinor: optionalMoney(row["applied_commission_amount_minor"]),
      commissionPolicyId: optionalString(
        row["commission_policy_id"],
        "sale_lines.commission_policy_id",
      ),
      commissionVersionId: optionalString(
        row["commission_version_id"],
        "sale_lines.commission_version_id",
      ),
      commissionBandId: optionalString(row["commission_band_id"], "sale_lines.commission_band_id"),
      traderPaysMinor: optionalMoney(row["trader_pays_minor"]),
      farmerReceivesMinor: optionalMoney(row["farmer_receives_minor"]),
    };
  });
}

function insertLines(
  executor: DbExecutor,
  stallId: string,
  saleId: string,
  lines: InsertSaleDraftLineInput[],
): void {
  const insertLine = executor.db.prepare(
    `INSERT INTO sale_lines (
       id, stall_id, sale_id, vegetable_id, line_order, unit_price_per_kg_minor,
       packaging_weight_hundredths, package_type_id, notes, farmer_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertWeight = executor.db.prepare(
    `INSERT INTO sale_line_package_weights (
       id, stall_id, sale_line_id, package_index, gross_weight_hundredths, row_key
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAllocation = executor.db.prepare(
    `INSERT INTO sale_farmer_allocations (
       id, stall_id, sale_id, sale_line_id, farmer_id, allocated_net_weight_hundredths
     ) VALUES (?, ?, ?, ?, ?, 0)`,
  );

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineOrder = index + 1;
    insertLine.run(
      line.id,
      stallId,
      saleId,
      line.vegetableId,
      lineOrder,
      moneyMinorToSqliteInteger(line.unitPricePerKgMinor),
      weightHundredthsToSqliteInteger(line.packagingWeightHundredths),
      line.packageTypeId,
      line.notes,
      line.farmerId,
    );

    for (const weight of line.weights) {
      insertWeight.run(
        weight.id,
        stallId,
        line.id,
        weight.packageIndex,
        weightHundredthsToSqliteInteger(weight.grossWeightHundredths),
        weight.rowKey,
      );
    }

    insertAllocation.run(`${line.id}:alloc`, stallId, saleId, line.id, line.farmerId);
  }
}

function deleteSaleChildren(executor: DbExecutor, stallId: string, saleId: string): void {
  const lineIds = (
    executor.db
      .prepare(`SELECT id FROM sale_lines WHERE stall_id = ? AND sale_id = ?`)
      .all(stallId, saleId) as Array<{ id: string }>
  ).map((row) => row.id);

  for (const lineId of lineIds) {
    executor.db
      .prepare(`DELETE FROM sale_line_package_weights WHERE stall_id = ? AND sale_line_id = ?`)
      .run(stallId, lineId);
  }
  executor.db
    .prepare(`DELETE FROM sale_farmer_allocations WHERE stall_id = ? AND sale_id = ?`)
    .run(stallId, saleId);
  executor.db
    .prepare(`DELETE FROM sale_lines WHERE stall_id = ? AND sale_id = ?`)
    .run(stallId, saleId);
}

export function getSaleById(
  executor: DbExecutor,
  stallId: string,
  saleId: string,
): SaleRecord | null {
  const row = executor.db
    .prepare(`SELECT ${SALE_SELECT} FROM sales s WHERE s.id = ? AND s.stall_id = ?`)
    .get(saleId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapSaleHeader(row, loadLines(executor, stallId, saleId));
}

export function insertSaleDraft(executor: DbExecutor, input: InsertSaleDraftInput): SaleRecord {
  if (input.correctsSaleId !== undefined && input.correctsSaleId === input.id) {
    throw new RepositoryError("A sale cannot correct itself.");
  }
  executor.db
    .prepare(
      `INSERT INTO sales (
         id, stall_id, trader_id, business_date, status, revision,
         corrects_sale_id, finalized_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'draft', 1, ?, NULL, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.traderId,
      input.businessDate,
      input.correctsSaleId ?? null,
      input.createdAt,
      input.updatedAt,
    );

  insertLines(executor, input.stallId, input.id, input.lines);
  const created = getSaleById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load sale draft after insert.");
  }
  return created;
}

export function replaceSaleDraftWithExpectedRevision(
  executor: DbExecutor,
  input: ReplaceSaleDraftInput,
): SaleRecord {
  const result = executor.db
    .prepare(
      `UPDATE sales
       SET trader_id = ?, business_date = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ? AND status = 'draft'`,
    )
    .run(
      input.traderId,
      input.businessDate,
      input.updatedAt,
      input.saleId,
      input.stallId,
      input.expectedRevision,
    );

  if (result.changes !== 1) {
    throw new RevisionConflictError("Sale draft revision conflict or draft is not editable.");
  }

  deleteSaleChildren(executor, input.stallId, input.saleId);
  insertLines(executor, input.stallId, input.saleId, input.lines);

  const updated = getSaleById(executor, input.stallId, input.saleId);
  if (updated === null) {
    throw new RepositoryError("Failed to load sale draft after update.");
  }
  return updated;
}

export function abandonSaleDraftWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  saleId: string,
  expectedRevision: number,
  updatedAt: string,
): SaleRecord {
  const result = executor.db
    .prepare(
      `UPDATE sales
       SET status = 'cancelled', revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ? AND status = 'draft'`,
    )
    .run(updatedAt, saleId, stallId, expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError("Sale draft revision conflict or draft is not editable.");
  }

  const abandoned = getSaleById(executor, stallId, saleId);
  if (abandoned === null) {
    throw new RepositoryError("Failed to load sale draft after abandon.");
  }
  return abandoned;
}

export function listSaleDrafts(
  executor: DbExecutor,
  input: {
    stallId: string;
    limit: number;
    offset: number;
    traderId?: string;
  },
): { items: SaleDraftListItem[]; totalCount: number } {
  const params: Array<string | number> = [input.stallId];
  let where = `s.stall_id = ? AND s.status = 'draft'`;
  if (input.traderId !== undefined) {
    where += ` AND s.trader_id = ?`;
    params.push(input.traderId);
  }

  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM sales s WHERE ${where}`)
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const rows = executor.db
    .prepare(
      `SELECT s.id, s.trader_id, t.display_name AS trader_display_name, s.business_date,
              s.revision, s.updated_at,
              (SELECT COUNT(*) FROM sale_lines sl WHERE sl.sale_id = s.id AND sl.stall_id = s.stall_id) AS line_count
       FROM sales s
       INNER JOIN traders t ON t.id = s.trader_id AND t.stall_id = s.stall_id
       WHERE ${where}
       ORDER BY s.updated_at DESC, s.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, input.limit, input.offset) as Array<Record<string, unknown>>;

  return {
    totalCount,
    items: rows.map((row) => ({
      id: requireString(row["id"], "sales.id"),
      traderId: requireString(row["trader_id"], "sales.trader_id"),
      traderDisplayName: requireString(row["trader_display_name"], "traders.display_name"),
      businessDate: requireCalendarDate(row["business_date"], "sales.business_date"),
      status: "draft" as const,
      revision: requireInteger(row["revision"], "sales.revision"),
      lineCount: requireInteger(row["line_count"], "line_count"),
      updatedAt: requireAbsoluteTimestamp(row["updated_at"], "sales.updated_at"),
    })),
  };
}

export function finalizeSaleWithExpectedRevision(
  executor: DbExecutor,
  input: FinalizeSaleInput,
): SaleRecord {
  // Snapshot lines while the sale is still a draft so finalized-line immutability
  // triggers do not block the finalize write itself.
  const draftGuard = executor.db
    .prepare(
      `SELECT id FROM sales
       WHERE id = ? AND stall_id = ? AND revision = ? AND status = 'draft'`,
    )
    .get(input.saleId, input.stallId, input.expectedRevision) as { id: string } | undefined;
  if (draftGuard === undefined) {
    throw new RevisionConflictError("Sale could not be finalized (stale revision or status).");
  }

  const updateLine = executor.db.prepare(
    `UPDATE sale_lines
     SET farmer_id = ?,
         farmer_short_code = ?,
         farmer_display_name = ?,
         vegetable_short_code = ?,
         vegetable_display_name = ?,
         package_type_id = ?,
         package_type_short_code = ?,
         package_type_display_name = ?,
         gross_weight_hundredths = ?,
         net_weight_hundredths = ?,
         line_sale_amount_minor = ?,
         applied_commission_rate_per_kg_minor = ?,
         applied_commission_amount_minor = ?,
         commission_policy_id = ?,
         commission_version_id = ?,
         commission_band_id = ?,
         trader_pays_minor = ?,
         farmer_receives_minor = ?
     WHERE id = ? AND stall_id = ? AND sale_id = ?`,
  );

  const updateAllocation = executor.db.prepare(
    `UPDATE sale_farmer_allocations
     SET allocated_net_weight_hundredths = ?
     WHERE stall_id = ? AND sale_id = ? AND sale_line_id = ? AND farmer_id = ?`,
  );

  for (const line of input.lineSnapshots) {
    const lineResult = updateLine.run(
      line.farmerId,
      line.farmerShortCode,
      line.farmerDisplayName,
      line.vegetableShortCode,
      line.vegetableDisplayName,
      line.packageTypeId,
      line.packageTypeShortCode,
      line.packageTypeDisplayName,
      weightHundredthsToSqliteInteger(line.grossWeightHundredths),
      weightHundredthsToSqliteInteger(line.netWeightHundredths),
      moneyMinorToSqliteInteger(line.lineSaleAmountMinor),
      moneyMinorToSqliteInteger(line.appliedCommissionRatePerKgMinor),
      moneyMinorToSqliteInteger(line.appliedCommissionAmountMinor),
      line.commissionPolicyId,
      line.commissionVersionId,
      line.commissionBandId,
      moneyMinorToSqliteInteger(line.traderPaysMinor),
      moneyMinorToSqliteInteger(line.farmerReceivesMinor),
      line.lineId,
      input.stallId,
      input.saleId,
    );
    if (lineResult.changes !== 1) {
      throw new RepositoryError(`Failed to snapshot sale line ${line.lineId}.`);
    }

    const allocResult = updateAllocation.run(
      weightHundredthsToSqliteInteger(line.netWeightHundredths),
      input.stallId,
      input.saleId,
      line.lineId,
      line.farmerId,
    );
    if (allocResult.changes !== 1) {
      throw new RepositoryError(`Failed to snapshot farmer allocation for line ${line.lineId}.`);
    }
  }

  const result = executor.db
    .prepare(
      `UPDATE sales
       SET status = 'finalized',
           revision = revision + 1,
           trader_short_code = ?,
           trader_display_name = ?,
           commission_policy_id = ?,
           commission_version_id = ?,
           calculation_fingerprint = ?,
           posting_id = ?,
           total_sale_amount_minor = ?,
           total_commission_minor = ?,
           total_trader_pays_minor = ?,
           total_farmer_receives_minor = ?,
           finalized_at = ?,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ? AND status = 'draft'`,
    )
    .run(
      input.traderShortCode,
      input.traderDisplayName,
      input.commissionPolicyId,
      input.commissionVersionId,
      input.calculationFingerprint,
      input.postingId,
      moneyMinorToSqliteInteger(input.totalSaleAmountMinor),
      moneyMinorToSqliteInteger(input.totalCommissionMinor),
      moneyMinorToSqliteInteger(input.totalTraderPaysMinor),
      moneyMinorToSqliteInteger(input.totalFarmerReceivesMinor),
      input.finalizedAt,
      input.updatedAt,
      input.saleId,
      input.stallId,
      input.expectedRevision,
    );

  if (result.changes !== 1) {
    throw new RevisionConflictError("Sale could not be finalized (stale revision or status).");
  }

  const finalized = getSaleById(executor, input.stallId, input.saleId);
  if (finalized === null) {
    throw new RepositoryError("Failed to load sale after finalize.");
  }
  return finalized;
}

export function insertFinalizedTraderBill(
  executor: DbExecutor,
  input: InsertTraderBillInput,
): TraderBillDetailRecord {
  executor.db
    .prepare(
      `INSERT INTO trader_bills (
         id, stall_id, sale_id, trader_id, bill_number, business_date, status, revision,
         total_amount_minor, payment_status, created_at, updated_at,
         trader_short_code, trader_display_name, bill_type,
         commission_policy_id, commission_version_id, calculation_fingerprint, posting_id,
         total_commission_minor, total_farmer_receives_minor, finalized_at,
         stall_display_name, stall_address
       ) VALUES (
         ?, ?, ?, ?, ?, ?, 'finalized', 1,
         ?, 'unpaid', ?, ?,
         ?, ?, 'trader',
         ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?
       )`,
    )
    .run(
      input.id,
      input.stallId,
      input.saleId,
      input.traderId,
      input.billNumber,
      input.businessDate,
      moneyMinorToSqliteInteger(input.totalAmountMinor),
      input.createdAt,
      input.updatedAt,
      input.traderShortCode,
      input.traderDisplayName,
      input.commissionPolicyId,
      input.commissionVersionId,
      input.calculationFingerprint,
      input.postingId,
      moneyMinorToSqliteInteger(input.totalCommissionMinor),
      moneyMinorToSqliteInteger(input.totalFarmerReceivesMinor),
      input.finalizedAt,
      input.stallDisplayName,
      input.stallAddress,
    );

  const created = getTraderBillById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load trader bill after insert.");
  }
  return created;
}

export function getTraderBillById(
  executor: DbExecutor,
  stallId: string,
  billId: string,
): TraderBillDetailRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, sale_id, trader_id, trader_short_code, trader_display_name,
              stall_display_name, stall_address,
              bill_type, bill_number, business_date, status, total_amount_minor, payment_status,
              commission_policy_id, commission_version_id, calculation_fingerprint, posting_id,
              total_commission_minor, total_farmer_receives_minor, finalized_at,
              created_at, updated_at,
              correction_status, correction_operation_id, replacement_trader_bill_id
       FROM trader_bills
       WHERE id = ? AND stall_id = ?`,
    )
    .get(billId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapTraderBillDetail(row);
}

export function getTraderBillBySaleId(
  executor: DbExecutor,
  stallId: string,
  saleId: string,
): TraderBillDetailRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, sale_id, trader_id, trader_short_code, trader_display_name,
              stall_display_name, stall_address,
              bill_type, bill_number, business_date, status, total_amount_minor, payment_status,
              commission_policy_id, commission_version_id, calculation_fingerprint, posting_id,
              total_commission_minor, total_farmer_receives_minor, finalized_at,
              created_at, updated_at,
              correction_status, correction_operation_id, replacement_trader_bill_id
       FROM trader_bills
       WHERE sale_id = ? AND stall_id = ?`,
    )
    .get(saleId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapTraderBillDetail(row);
}

function mapTraderBillDetail(row: Record<string, unknown>): TraderBillDetailRecord {
  const status = requireString(row["status"], "trader_bills.status");
  if (status !== "finalized") {
    throw new RepositoryError(`Expected finalized trader bill, got ${status}`);
  }
  const paymentStatus = requireString(row["payment_status"], "trader_bills.payment_status");
  if (
    paymentStatus !== "unpaid" &&
    paymentStatus !== "partially_paid" &&
    paymentStatus !== "fully_paid"
  ) {
    throw new RepositoryError(`Unexpected payment status: ${paymentStatus}`);
  }
  return {
    id: requireString(row["id"], "trader_bills.id"),
    stallId: requireString(row["stall_id"], "trader_bills.stall_id"),
    saleId: requireString(row["sale_id"], "trader_bills.sale_id"),
    traderId: requireString(row["trader_id"], "trader_bills.trader_id"),
    traderShortCode: requireString(row["trader_short_code"], "trader_bills.trader_short_code"),
    traderDisplayName: requireString(
      row["trader_display_name"],
      "trader_bills.trader_display_name",
    ),
    stallDisplayName: optionalString(row["stall_display_name"], "trader_bills.stall_display_name"),
    stallAddress: optionalString(row["stall_address"], "trader_bills.stall_address"),
    billType: "trader",
    billNumber: requireString(row["bill_number"], "trader_bills.bill_number"),
    businessDate: requireCalendarDate(row["business_date"], "trader_bills.business_date"),
    status: "finalized",
    correctionStatus: mapCorrectionStatus(row["correction_status"]),
    correctionOperationId: optionalString(
      row["correction_operation_id"],
      "trader_bills.correction_operation_id",
    ),
    replacementTraderBillId: optionalString(
      row["replacement_trader_bill_id"],
      "trader_bills.replacement_trader_bill_id",
    ),
    totalAmountMinor: moneyMinorFromSqliteInteger(row["total_amount_minor"]),
    paymentStatus,
    commissionPolicyId: requireString(
      row["commission_policy_id"],
      "trader_bills.commission_policy_id",
    ),
    commissionVersionId: requireString(
      row["commission_version_id"],
      "trader_bills.commission_version_id",
    ),
    calculationFingerprint: requireString(
      row["calculation_fingerprint"],
      "trader_bills.calculation_fingerprint",
    ),
    postingId: requireString(row["posting_id"], "trader_bills.posting_id"),
    totalCommissionMinor: moneyMinorFromSqliteInteger(row["total_commission_minor"]),
    totalFarmerReceivesMinor: moneyMinorFromSqliteInteger(row["total_farmer_receives_minor"]),
    finalizedAt: requireAbsoluteTimestamp(row["finalized_at"], "trader_bills.finalized_at"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "trader_bills.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "trader_bills.updated_at"),
  };
}

export function listFinalizedTraderBills(
  executor: DbExecutor,
  input: {
    stallId: string;
    limit: number;
    offset: number;
    traderId?: string;
    businessDateFrom?: string;
    businessDateTo?: string;
  },
): { items: TraderBillListItem[]; totalCount: number } {
  const params: Array<string | number> = [input.stallId];
  let where = `tb.stall_id = ? AND tb.status = 'finalized'`;
  if (input.traderId !== undefined) {
    where += ` AND tb.trader_id = ?`;
    params.push(input.traderId);
  }
  if (input.businessDateFrom !== undefined) {
    where += ` AND tb.business_date >= ?`;
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += ` AND tb.business_date <= ?`;
    params.push(input.businessDateTo);
  }

  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM trader_bills tb WHERE ${where}`)
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const rows = executor.db
    .prepare(
      `SELECT tb.id, tb.sale_id, tb.trader_id,
              COALESCE(tb.trader_display_name, t.display_name) AS trader_display_name,
              tb.bill_number, tb.business_date, tb.total_amount_minor, tb.payment_status,
              tb.correction_status, tb.finalized_at
       FROM trader_bills tb
       INNER JOIN traders t ON t.id = tb.trader_id AND t.stall_id = tb.stall_id
       WHERE ${where}
       ORDER BY tb.finalized_at DESC, tb.id DESC
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
        id: requireString(row["id"], "trader_bills.id"),
        saleId: requireString(row["sale_id"], "trader_bills.sale_id"),
        traderId: requireString(row["trader_id"], "trader_bills.trader_id"),
        traderDisplayName: requireString(row["trader_display_name"], "trader_display_name"),
        billNumber: requireString(row["bill_number"], "bill_number"),
        businessDate: requireCalendarDate(row["business_date"], "business_date"),
        totalAmountMinor: moneyMinorFromSqliteInteger(row["total_amount_minor"]),
        paymentStatus,
        correctionStatus: mapCorrectionStatus(row["correction_status"]),
        finalizedAt: requireAbsoluteTimestamp(row["finalized_at"], "finalized_at"),
      };
    }),
  };
}
