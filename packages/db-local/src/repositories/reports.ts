import {
  moneyMinorFromSqliteInteger,
  weightHundredthsFromSqliteInteger,
} from "../numeric.js";
import {
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireInteger,
  requireString,
} from "../mapping/errors.js";
import type { ReportingWatermarks } from "./account-statements.js";
import { RepositoryError, type DbExecutor } from "./types.js";

export type ReportSaleLineRow = {
  saleLineId: string;
  saleId: string;
  businessDate: string;
  recordedAt: string;
  postingSequence: number | null;
  traderId: string;
  traderDisplayName: string;
  farmerId: string | null;
  farmerDisplayName: string | null;
  vegetableId: string;
  vegetableCode: string;
  vegetableDisplayName: string;
  packageCount: number;
  netWeightHundredths: number;
  unitPricePerKgMinor: number;
  saleAmountMinor: number;
  commissionAmountMinor: number;
  farmerReceivesMinor: number;
  correctionStatus: "active" | "reversed" | "superseded";
  traderBillNumber: string | null;
};

export type ListReportSaleLinesInput = {
  stallId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  watermarks: ReportingWatermarks;
  farmerId?: string;
  buyerId?: string;
  vegetableId?: string;
  /** When true, only correction_status = active (price / effective). */
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
};

function saleLinesWhere(input: ListReportSaleLinesInput): {
  where: string;
  params: Array<string | number>;
} {
  const params: Array<string | number> = [
    input.stallId,
    input.fromBusinessDate,
    input.toBusinessDate,
  ];
  let where = `
    s.stall_id = ?
    AND s.status = 'finalized'
    AND s.business_date >= ?
    AND s.business_date <= ?
  `;
  // Recording cutoff via ledger posting sequence when posting exists.
  where += `
    AND (
      s.posting_id IS NULL
      OR EXISTS (
        SELECT 1 FROM ledger_postings lp
        INNER JOIN ledger_entries le ON le.posting_id = lp.id AND le.stall_id = lp.stall_id
        WHERE lp.id = s.posting_id AND lp.stall_id = s.stall_id
          AND le.posting_sequence <= ?
      )
    )
  `;
  params.push(input.watermarks.maxPostingSequence);

  if (input.activeOnly) {
    where += ` AND COALESCE(s.correction_status, 'active') = 'active'`;
  }
  if (input.farmerId) {
    where += ` AND sl.farmer_id = ?`;
    params.push(input.farmerId);
  }
  if (input.buyerId) {
    where += ` AND s.trader_id = ?`;
    params.push(input.buyerId);
  }
  if (input.vegetableId) {
    where += ` AND sl.vegetable_id = ?`;
    params.push(input.vegetableId);
  }
  return { where, params };
}

const SALE_LINE_SELECT = `
  SELECT
    sl.id AS sale_line_id,
    sl.sale_id AS sale_id,
    s.business_date AS business_date,
    COALESCE(s.finalized_at, s.updated_at) AS recorded_at,
    (
      SELECT MIN(le.posting_sequence)
      FROM ledger_postings lp
      INNER JOIN ledger_entries le ON le.posting_id = lp.id AND le.stall_id = lp.stall_id
      WHERE lp.id = s.posting_id AND lp.stall_id = s.stall_id
    ) AS posting_sequence,
    s.trader_id AS trader_id,
    COALESCE(s.trader_display_name, t.display_name, '') AS trader_display_name,
    sl.farmer_id AS farmer_id,
    f.display_name AS farmer_display_name,
    sl.vegetable_id AS vegetable_id,
    COALESCE(sl.vegetable_short_code, '') AS vegetable_code,
    COALESCE(sl.vegetable_display_name, '') AS vegetable_display_name,
    (
      SELECT COUNT(*)
      FROM sale_line_package_weights pw
      WHERE pw.stall_id = sl.stall_id AND pw.sale_line_id = sl.id
    ) AS package_count,
    COALESCE(sl.net_weight_hundredths, 0) AS net_weight_hundredths,
    COALESCE(sl.unit_price_per_kg_minor, 0) AS unit_price_per_kg_minor,
    COALESCE(sl.line_sale_amount_minor, 0) AS sale_amount_minor,
    COALESCE(sl.applied_commission_amount_minor, 0) AS commission_amount_minor,
    COALESCE(sl.farmer_receives_minor, 0) AS farmer_receives_minor,
    COALESCE(s.correction_status, 'active') AS correction_status,
    tb.bill_number AS trader_bill_number
  FROM sale_lines sl
  INNER JOIN sales s ON s.id = sl.sale_id AND s.stall_id = sl.stall_id
  INNER JOIN traders t ON t.id = s.trader_id AND t.stall_id = s.stall_id
  LEFT JOIN farmers f ON f.id = sl.farmer_id AND f.stall_id = sl.stall_id
  LEFT JOIN trader_bills tb ON tb.sale_id = s.id AND tb.stall_id = s.stall_id AND tb.status = 'finalized'
`;

function mapSaleLineRow(row: Record<string, unknown>): ReportSaleLineRow {
  const statusRaw = requireString(row["correction_status"], "correction_status");
  const correctionStatus =
    statusRaw === "reversed" || statusRaw === "superseded" ? statusRaw : "active";
  return {
    saleLineId: requireString(row["sale_line_id"], "sale_line_id"),
    saleId: requireString(row["sale_id"], "sale_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    postingSequence:
      row["posting_sequence"] === null || row["posting_sequence"] === undefined
        ? null
        : requireInteger(row["posting_sequence"], "posting_sequence"),
    traderId: requireString(row["trader_id"], "trader_id"),
    traderDisplayName: requireString(row["trader_display_name"], "trader_display_name"),
    farmerId: optionalString(row["farmer_id"], "farmer_id"),
    farmerDisplayName: optionalString(row["farmer_display_name"], "farmer_display_name"),
    vegetableId: requireString(row["vegetable_id"], "vegetable_id"),
    vegetableCode: requireString(row["vegetable_code"], "vegetable_code"),
    vegetableDisplayName: requireString(row["vegetable_display_name"], "vegetable_display_name"),
    packageCount: requireInteger(row["package_count"], "package_count"),
    netWeightHundredths: weightHundredthsFromSqliteInteger(row["net_weight_hundredths"]),
    unitPricePerKgMinor: moneyMinorFromSqliteInteger(row["unit_price_per_kg_minor"]),
    saleAmountMinor: moneyMinorFromSqliteInteger(row["sale_amount_minor"]),
    commissionAmountMinor: moneyMinorFromSqliteInteger(row["commission_amount_minor"]),
    farmerReceivesMinor: moneyMinorFromSqliteInteger(row["farmer_receives_minor"]),
    correctionStatus,
    traderBillNumber: optionalString(row["trader_bill_number"], "trader_bill_number"),
  };
}

export function listReportSaleLines(
  executor: DbExecutor,
  input: ListReportSaleLinesInput,
): ReportSaleLineRow[] {
  const { where, params } = saleLinesWhere(input);
  let sql = `${SALE_LINE_SELECT} WHERE ${where} ORDER BY s.business_date ASC, sl.id ASC`;
  if (input.limit !== undefined) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(input.limit, input.offset ?? 0);
  }
  const rows = executor.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapSaleLineRow);
}

export function countReportSaleLines(
  executor: DbExecutor,
  input: Omit<ListReportSaleLinesInput, "limit" | "offset">,
): number {
  const { where, params } = saleLinesWhere(input);
  const row = executor.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM sale_lines sl
       INNER JOIN sales s ON s.id = sl.sale_id AND s.stall_id = sl.stall_id
       WHERE ${where}`,
    )
    .get(...params) as Record<string, unknown>;
  return requireInteger(row["c"], "count");
}

export type ReportPaymentRow = {
  paymentId: string;
  businessDate: string;
  recordedAt: string;
  partyKind: "farmer" | "trader";
  farmerId: string | null;
  farmerDisplayName: string | null;
  traderId: string | null;
  traderDisplayName: string | null;
  direction: "receive" | "pay";
  method: "cash" | "bank_transfer" | "cheque";
  amountMinor: number;
  status: "posted" | "reversed";
  referenceNumber: string;
  allocatedTotalMinor: number;
  unappliedAmountMinor: number;
};

export type ListReportPaymentsInput = {
  stallId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  watermarks: ReportingWatermarks;
  farmerId?: string;
  buyerId?: string;
  paymentMethod?: "cash" | "bank_transfer" | "cheque";
  paymentDirection?: "receive" | "pay";
  paymentStatus?: "posted" | "reversed" | "all";
  limit?: number;
  offset?: number;
};

export function listReportPayments(
  executor: DbExecutor,
  input: ListReportPaymentsInput,
): ReportPaymentRow[] {
  // Placeholder order follows appearance in the SQL string (subquery first).
  const params: Array<string | number> = [
    input.watermarks.maxAllocationCreatedAt,
    input.watermarks.maxAllocationCreatedAt,
    input.watermarks.maxAllocationId,
    input.watermarks.maxAllocationCreatedAt,
    input.stallId,
    input.fromBusinessDate,
    input.toBusinessDate,
    input.watermarks.maxPaymentRecordedAt,
    input.watermarks.maxPaymentRecordedAt,
    input.watermarks.maxPaymentId,
  ];
  let where = `
    p.stall_id = ?
    AND p.business_date >= ?
    AND p.business_date <= ?
    AND (
      p.recorded_at < ?
      OR (p.recorded_at = ? AND p.id <= ?)
    )
  `;

  if (input.farmerId) {
    where += ` AND p.farmer_id = ?`;
    params.push(input.farmerId);
  }
  if (input.buyerId) {
    where += ` AND p.trader_id = ?`;
    params.push(input.buyerId);
  }
  if (input.paymentMethod) {
    where += ` AND p.method = ?`;
    params.push(input.paymentMethod);
  }
  if (input.paymentDirection) {
    where += ` AND p.direction = ?`;
    params.push(input.paymentDirection);
  }
  if (input.paymentStatus === "posted" || input.paymentStatus === "reversed") {
    where += ` AND p.status = ?`;
    params.push(input.paymentStatus);
  }

  let sql = `
    SELECT
      p.id AS payment_id,
      p.business_date AS business_date,
      p.recorded_at AS recorded_at,
      CASE WHEN p.farmer_id IS NOT NULL THEN 'farmer' ELSE 'trader' END AS party_kind,
      p.farmer_id AS farmer_id,
      f.display_name AS farmer_display_name,
      p.trader_id AS trader_id,
      t.display_name AS trader_display_name,
      p.direction AS direction,
      p.method AS method,
      p.amount_minor AS amount_minor,
      p.status AS status,
      p.reference_number AS reference_number,
      COALESCE((
        SELECT SUM(pa.applied_amount_minor)
        FROM payment_allocations pa
        WHERE pa.stall_id = p.stall_id
          AND pa.payment_id = p.id
          AND pa.status = 'active'
          AND (
            pa.created_at < ?
            OR (pa.created_at = ? AND pa.id <= ?)
          )
          AND (pa.released_at IS NULL OR pa.released_at > ?)
      ), 0) AS allocated_total_minor
    FROM payments p
    LEFT JOIN farmers f ON f.id = p.farmer_id AND f.stall_id = p.stall_id
    LEFT JOIN traders t ON t.id = p.trader_id AND t.stall_id = p.stall_id
    WHERE ${where}
    ORDER BY p.business_date ASC, p.id ASC
  `;

  if (input.limit !== undefined) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(input.limit, input.offset ?? 0);
  }

  const rows = executor.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((row) => {
    const amountMinor = moneyMinorFromSqliteInteger(row["amount_minor"]);
    const allocatedTotalMinor = moneyMinorFromSqliteInteger(row["allocated_total_minor"]);
    const status = requireString(row["status"], "status") as "posted" | "reversed";
    const unapplied =
      status === "posted" ? Math.max(0, amountMinor - allocatedTotalMinor) : 0;
    return {
      paymentId: requireString(row["payment_id"], "payment_id"),
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
      partyKind: requireString(row["party_kind"], "party_kind") as "farmer" | "trader",
      farmerId: optionalString(row["farmer_id"], "farmer_id"),
      farmerDisplayName: optionalString(row["farmer_display_name"], "farmer_display_name"),
      traderId: optionalString(row["trader_id"], "trader_id"),
      traderDisplayName: optionalString(row["trader_display_name"], "trader_display_name"),
      direction: requireString(row["direction"], "direction") as "receive" | "pay",
      method: requireString(row["method"], "method") as "cash" | "bank_transfer" | "cheque",
      amountMinor,
      status,
      referenceNumber: requireString(row["reference_number"], "reference_number"),
      allocatedTotalMinor,
      unappliedAmountMinor: unapplied,
    };
  });
}

export function countReportPayments(
  executor: DbExecutor,
  input: Omit<ListReportPaymentsInput, "limit" | "offset">,
): number {
  const params: Array<string | number> = [
    input.stallId,
    input.fromBusinessDate,
    input.toBusinessDate,
    input.watermarks.maxPaymentRecordedAt,
    input.watermarks.maxPaymentRecordedAt,
    input.watermarks.maxPaymentId,
  ];
  let where = `
    p.stall_id = ?
    AND p.business_date >= ?
    AND p.business_date <= ?
    AND (
      p.recorded_at < ?
      OR (p.recorded_at = ? AND p.id <= ?)
    )
  `;
  if (input.farmerId) {
    where += ` AND p.farmer_id = ?`;
    params.push(input.farmerId);
  }
  if (input.buyerId) {
    where += ` AND p.trader_id = ?`;
    params.push(input.buyerId);
  }
  if (input.paymentMethod) {
    where += ` AND p.method = ?`;
    params.push(input.paymentMethod);
  }
  if (input.paymentDirection) {
    where += ` AND p.direction = ?`;
    params.push(input.paymentDirection);
  }
  if (input.paymentStatus === "posted" || input.paymentStatus === "reversed") {
    where += ` AND p.status = ?`;
    params.push(input.paymentStatus);
  }
  const row = executor.db
    .prepare(`SELECT COUNT(*) AS c FROM payments p WHERE ${where}`)
    .get(...params) as Record<string, unknown>;
  return requireInteger(row["c"], "count");
}

export type ReportCorrectionRow = {
  operationId: string;
  businessDate: string;
  recordedAt: string;
  action: string;
  sourceSaleId: string;
  replacementSaleId: string | null;
  reversalPostingId: string;
  traderId: string | null;
  reason: string | null;
};

export function listReportCorrections(
  executor: DbExecutor,
  input: {
    stallId: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    watermarks: ReportingWatermarks;
    buyerId?: string;
    limit?: number;
    offset?: number;
  },
): ReportCorrectionRow[] {
  const params: Array<string | number> = [
    input.stallId,
    input.fromBusinessDate,
    input.toBusinessDate,
    input.watermarks.maxPostingSequence,
  ];
  let where = `
    sco.stall_id = ?
    AND sco.business_date >= ?
    AND sco.business_date <= ?
    AND (
      sco.reversal_posting_id IS NULL
      OR EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.posting_id = sco.reversal_posting_id AND le.stall_id = sco.stall_id
          AND le.posting_sequence <= ?
      )
    )
  `;
  if (input.buyerId) {
    where += ` AND EXISTS (
      SELECT 1 FROM sales s WHERE s.id = sco.source_sale_id AND s.stall_id = sco.stall_id AND s.trader_id = ?
    )`;
    params.push(input.buyerId);
  }
  let sql = `
    SELECT
      sco.id AS operation_id,
      sco.business_date AS business_date,
      sco.recorded_at AS recorded_at,
      sco.action AS action,
      sco.source_sale_id AS source_sale_id,
      sco.replacement_sale_id AS replacement_sale_id,
      sco.reversal_posting_id AS reversal_posting_id,
      s.trader_id AS trader_id,
      sco.reason AS reason
    FROM sale_correction_operations sco
    LEFT JOIN sales s ON s.id = sco.source_sale_id AND s.stall_id = sco.stall_id
    WHERE ${where}
    ORDER BY sco.business_date ASC, sco.id ASC
  `;
  if (input.limit !== undefined) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(input.limit, input.offset ?? 0);
  }
  const rows = executor.db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((row) => ({
    operationId: requireString(row["operation_id"], "operation_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    action: requireString(row["action"], "action"),
    sourceSaleId: requireString(row["source_sale_id"], "source_sale_id"),
    replacementSaleId: optionalString(row["replacement_sale_id"], "replacement_sale_id"),
    reversalPostingId: requireString(row["reversal_posting_id"], "reversal_posting_id"),
    traderId: optionalString(row["trader_id"], "trader_id"),
    reason: optionalString(row["reason"], "reason"),
  }));
}

export function countReportCorrections(
  executor: DbExecutor,
  input: {
    stallId: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    watermarks: ReportingWatermarks;
    buyerId?: string;
  },
): number {
  const params: Array<string | number> = [
    input.stallId,
    input.fromBusinessDate,
    input.toBusinessDate,
    input.watermarks.maxPostingSequence,
  ];
  let where = `
    sco.stall_id = ?
    AND sco.business_date >= ?
    AND sco.business_date <= ?
    AND (
      sco.reversal_posting_id IS NULL
      OR EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.posting_id = sco.reversal_posting_id AND le.stall_id = sco.stall_id
          AND le.posting_sequence <= ?
      )
    )
  `;
  if (input.buyerId) {
    where += ` AND EXISTS (
      SELECT 1 FROM sales s WHERE s.id = sco.source_sale_id AND s.stall_id = sco.stall_id AND s.trader_id = ?
    )`;
    params.push(input.buyerId);
  }
  const row = executor.db
    .prepare(`SELECT COUNT(*) AS c FROM sale_correction_operations sco WHERE ${where}`)
    .get(...params) as Record<string, unknown>;
  return requireInteger(row["c"], "count");
}

export type ReportExportJobRecord = {
  id: string;
  stallId: string;
  reportType: string;
  format: "csv" | "pdf";
  status: "preparing" | "ready" | "failed" | "expired";
  definitionVersion: string;
  snapshotToken: string;
  filterFingerprint: string;
  normalizedFiltersJson: string;
  rowCount: number | null;
  contentSha256: string | null;
  contentType: string | null;
  byteLength: number | null;
  defaultFileName: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdByStaffId: string;
  createdByDeviceId: string;
  createOperationId: string;
  createdAt: string;
  expiresAt: string;
  readyAt: string | null;
};

export type InsertReportExportJobInput = {
  id: string;
  stallId: string;
  reportType: string;
  format: "csv" | "pdf";
  status: "preparing" | "ready" | "failed" | "expired";
  definitionVersion: string;
  snapshotToken: string;
  filterFingerprint: string;
  normalizedFiltersJson: string;
  rowCount: number | null;
  contentSha256: string | null;
  contentBytes: Uint8Array | null;
  contentType: string | null;
  byteLength: number | null;
  defaultFileName: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdByStaffId: string;
  createdByDeviceId: string;
  createOperationId: string;
  createdAt: string;
  expiresAt: string;
  readyAt: string | null;
};

function mapExportJob(row: Record<string, unknown>): ReportExportJobRecord {
  return {
    id: requireString(row["id"], "report_export_jobs.id"),
    stallId: requireString(row["stall_id"], "report_export_jobs.stall_id"),
    reportType: requireString(row["report_type"], "report_export_jobs.report_type"),
    format: requireString(row["format"], "report_export_jobs.format") as "csv" | "pdf",
    status: requireString(row["status"], "report_export_jobs.status") as ReportExportJobRecord["status"],
    definitionVersion: requireString(
      row["definition_version"],
      "report_export_jobs.definition_version",
    ),
    snapshotToken: requireString(row["snapshot_token"], "report_export_jobs.snapshot_token"),
    filterFingerprint: requireString(
      row["filter_fingerprint"],
      "report_export_jobs.filter_fingerprint",
    ),
    normalizedFiltersJson: requireString(
      row["normalized_filters_json"],
      "report_export_jobs.normalized_filters_json",
    ),
    rowCount:
      row["row_count"] === null || row["row_count"] === undefined
        ? null
        : requireInteger(row["row_count"], "report_export_jobs.row_count"),
    contentSha256: optionalString(row["content_sha256"], "report_export_jobs.content_sha256"),
    contentType: optionalString(row["content_type"], "report_export_jobs.content_type"),
    byteLength:
      row["byte_length"] === null || row["byte_length"] === undefined
        ? null
        : requireInteger(row["byte_length"], "report_export_jobs.byte_length"),
    defaultFileName: requireString(
      row["default_file_name"],
      "report_export_jobs.default_file_name",
    ),
    failureCode: optionalString(row["failure_code"], "report_export_jobs.failure_code"),
    failureMessage: optionalString(row["failure_message"], "report_export_jobs.failure_message"),
    createdByStaffId: requireString(
      row["created_by_staff_id"],
      "report_export_jobs.created_by_staff_id",
    ),
    createdByDeviceId: requireString(
      row["created_by_device_id"],
      "report_export_jobs.created_by_device_id",
    ),
    createOperationId: requireString(
      row["create_operation_id"],
      "report_export_jobs.create_operation_id",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "report_export_jobs.created_at"),
    expiresAt: requireAbsoluteTimestamp(row["expires_at"], "report_export_jobs.expires_at"),
    readyAt: optionalString(row["ready_at"], "report_export_jobs.ready_at"),
  };
}

const EXPORT_JOB_COLUMNS = `
  id, stall_id, report_type, format, status, definition_version, snapshot_token,
  filter_fingerprint, normalized_filters_json, row_count, content_sha256, content_type,
  byte_length, default_file_name, failure_code, failure_message, created_by_staff_id,
  created_by_device_id, create_operation_id, created_at, expires_at, ready_at
`;

export function insertReportExportJob(
  executor: DbExecutor,
  input: InsertReportExportJobInput,
): ReportExportJobRecord {
  executor.db
    .prepare(
      `INSERT INTO report_export_jobs (
         id, stall_id, report_type, format, status, definition_version, snapshot_token,
         filter_fingerprint, normalized_filters_json, row_count, content_sha256, content_bytes,
         content_type, byte_length, default_file_name, failure_code, failure_message,
         created_by_staff_id, created_by_device_id, create_operation_id, created_at, expires_at, ready_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.reportType,
      input.format,
      input.status,
      input.definitionVersion,
      input.snapshotToken,
      input.filterFingerprint,
      input.normalizedFiltersJson,
      input.rowCount,
      input.contentSha256,
      input.contentBytes,
      input.contentType,
      input.byteLength,
      input.defaultFileName,
      input.failureCode,
      input.failureMessage,
      input.createdByStaffId,
      input.createdByDeviceId,
      input.createOperationId,
      input.createdAt,
      input.expiresAt,
      input.readyAt,
    );
  const loaded = getReportExportJobById(executor, input.stallId, input.id);
  if (loaded === null) {
    throw new RepositoryError("Failed to load report export job after insert.");
  }
  return loaded;
}

export function getReportExportJobById(
  executor: DbExecutor,
  stallId: string,
  jobId: string,
): ReportExportJobRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${EXPORT_JOB_COLUMNS}
       FROM report_export_jobs
       WHERE stall_id = ? AND id = ?`,
    )
    .get(stallId, jobId) as Record<string, unknown> | undefined;
  return row ? mapExportJob(row) : null;
}

export function getReportExportJobByCreateOperationId(
  executor: DbExecutor,
  stallId: string,
  createOperationId: string,
): ReportExportJobRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${EXPORT_JOB_COLUMNS}
       FROM report_export_jobs
       WHERE stall_id = ? AND create_operation_id = ?`,
    )
    .get(stallId, createOperationId) as Record<string, unknown> | undefined;
  return row ? mapExportJob(row) : null;
}

export function getReportExportJobContent(
  executor: DbExecutor,
  stallId: string,
  jobId: string,
): Uint8Array | null {
  const row = executor.db
    .prepare(
      `SELECT content_bytes
       FROM report_export_jobs
       WHERE stall_id = ? AND id = ?`,
    )
    .get(stallId, jobId) as { content_bytes: Uint8Array | null } | undefined;
  if (!row || row.content_bytes === null || row.content_bytes === undefined) {
    return null;
  }
  return row.content_bytes;
}

export function markReportExportJobExpired(
  executor: DbExecutor,
  stallId: string,
  jobId: string,
): void {
  executor.db
    .prepare(
      `UPDATE report_export_jobs
       SET status = 'expired', content_bytes = NULL
       WHERE stall_id = ? AND id = ? AND status = 'ready'`,
    )
    .run(stallId, jobId);
}
