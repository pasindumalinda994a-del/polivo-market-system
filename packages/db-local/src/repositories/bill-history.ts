import { moneyMinorFromSqliteInteger } from "../numeric.js";
import {
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireString,
} from "../mapping/errors.js";
import { getFarmerBillById } from "./farmer-bills.js";
import {
  getSaleCorrectionOperationById,
  getSaleCorrectionOperationBySourceSaleId,
} from "./sale-corrections.js";
import { getSaleById, getTraderBillById, type SaleCorrectionStatus } from "./sales.js";
import { RepositoryError, type DbExecutor } from "./types.js";

export type BillHistoryBillType = "trader" | "farmer";

export type BillHistoryListItem = {
  billType: BillHistoryBillType;
  billId: string;
  billNumber: string;
  partyId: string;
  partyCode: string;
  partyDisplayName: string;
  businessDate: string;
  issuedAt: string;
  originalAmountMinor: number;
  documentStatus: string;
  correctionStatus: SaleCorrectionStatus | "none";
  hasCorrection: boolean;
  saleId: string | null;
  replacementBillId: string | null;
  paymentStatus: string | null;
};

export type BillHistoryListResult = {
  items: BillHistoryListItem[];
  totalCount: number;
};

export type ListBillHistoryInput = {
  stallId: string;
  billType?: BillHistoryBillType;
  billNumber?: string;
  partyQuery?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  documentStatus?: string;
  correctionPresence?: "any" | "with_correction" | "without_correction";
  limit: number;
  offset: number;
};

export function listBillHistory(
  executor: DbExecutor,
  input: ListBillHistoryInput,
): BillHistoryListResult {
  const trader = listTraderHistory(executor, input);
  const farmer = listFarmerHistory(executor, input);

  const items: BillHistoryListItem[] =
    input.billType === "trader"
      ? trader.items
      : input.billType === "farmer"
        ? farmer.items
        : [...trader.items, ...farmer.items].sort((a, b) => {
            if (a.issuedAt === b.issuedAt) {
              return a.billId < b.billId ? 1 : -1;
            }
            return a.issuedAt < b.issuedAt ? 1 : -1;
          });

  const totalCount =
    input.billType === "trader"
      ? trader.totalCount
      : input.billType === "farmer"
        ? farmer.totalCount
        : trader.totalCount + farmer.totalCount;

  const paged =
    input.billType === undefined ? items.slice(input.offset, input.offset + input.limit) : items;

  return { items: paged, totalCount };
}

export type BillHistoryChainDetail = {
  billType: BillHistoryBillType;
  billId: string;
  billNumber: string;
  saleId: string | null;
  originalAmountMinor: number;
  businessDate: string;
  issuedAt: string;
  documentStatus: string;
  correctionStatus: SaleCorrectionStatus | "none";
  paymentStatus: string | null;
  party: {
    id: string;
    shortCode: string;
    displayName: string;
  };
  sale: ReturnType<typeof getSaleById>;
  traderBill: ReturnType<typeof getTraderBillById>;
  farmerBill: ReturnType<typeof getFarmerBillById>;
  correctionOperation: ReturnType<typeof getSaleCorrectionOperationById>;
  replacementSaleId: string | null;
  replacementTraderBillId: string | null;
  activity: Array<{
    kind: string;
    at: string;
    label: string;
    referenceId: string | null;
  }>;
};

export function getBillHistoryChainDetail(
  executor: DbExecutor,
  input: { stallId: string; billType: BillHistoryBillType; billId: string },
): BillHistoryChainDetail | null {
  if (input.billType === "trader") {
    const traderBill = getTraderBillById(executor, input.stallId, input.billId);
    if (traderBill === null) {
      return null;
    }
    const sale = getSaleById(executor, input.stallId, traderBill.saleId);
    const operation =
      sale === null
        ? null
        : (getSaleCorrectionOperationBySourceSaleId(executor, input.stallId, sale.id) ??
          (sale.correctionOperationId
            ? getSaleCorrectionOperationById(executor, input.stallId, sale.correctionOperationId)
            : null));
    const activity: BillHistoryChainDetail["activity"] = [
      {
        kind: "trader_bill_issued",
        at: traderBill.finalizedAt,
        label: `Buyer bill ${traderBill.billNumber} issued`,
        referenceId: traderBill.id,
      },
    ];
    if (sale?.finalizedAt) {
      activity.unshift({
        kind: "sale_finalized",
        at: sale.finalizedAt,
        label: "Sale finalized",
        referenceId: sale.id,
      });
    }
    if (operation !== null) {
      activity.push({
        kind: operation.action === "correct" ? "sale_corrected" : "sale_reversed",
        at: operation.recordedAt,
        label:
          operation.action === "correct"
            ? `Corrected: ${operation.reason}`
            : `Reversed: ${operation.reason}`,
        referenceId: operation.id,
      });
      if (operation.replacementSaleId !== null) {
        activity.push({
          kind: "replacement_sale",
          at: operation.recordedAt,
          label: "Replacement sale posted",
          referenceId: operation.replacementSaleId,
        });
      }
    }
    activity.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    return {
      billType: "trader",
      billId: traderBill.id,
      billNumber: traderBill.billNumber,
      saleId: traderBill.saleId,
      originalAmountMinor: traderBill.totalAmountMinor,
      businessDate: traderBill.businessDate,
      issuedAt: traderBill.finalizedAt,
      documentStatus: traderBill.status,
      correctionStatus: traderBill.correctionStatus,
      paymentStatus: traderBill.paymentStatus,
      party: {
        id: traderBill.traderId,
        shortCode: traderBill.traderShortCode,
        displayName: traderBill.traderDisplayName,
      },
      sale,
      traderBill,
      farmerBill: null,
      correctionOperation: operation,
      replacementSaleId: sale?.replacementSaleId ?? operation?.replacementSaleId ?? null,
      replacementTraderBillId:
        traderBill.replacementTraderBillId ?? operation?.replacementTraderBillId ?? null,
      activity,
    };
  }

  const farmerBill = getFarmerBillById(executor, input.stallId, input.billId);
  if (farmerBill === null) {
    return null;
  }
  return {
    billType: "farmer",
    billId: farmerBill.id,
    billNumber: farmerBill.billNumber,
    saleId: null,
    originalAmountMinor: farmerBill.totalAmountMinor,
    businessDate: farmerBill.businessDate,
    issuedAt: farmerBill.finalizedAt,
    documentStatus: farmerBill.status,
    correctionStatus: "none",
    paymentStatus: farmerBill.paymentStatus,
    party: {
      id: farmerBill.farmerId,
      shortCode: farmerBill.farmerShortCode,
      displayName: farmerBill.farmerDisplayName,
    },
    sale: null,
    traderBill: null,
    farmerBill,
    correctionOperation: null,
    replacementSaleId: null,
    replacementTraderBillId: null,
    activity: [
      {
        kind: "farmer_bill_issued",
        at: farmerBill.finalizedAt,
        label: `Farmer bill ${farmerBill.billNumber} issued`,
        referenceId: farmerBill.id,
      },
    ],
  };
}

function listTraderHistory(
  executor: DbExecutor,
  input: ListBillHistoryInput,
): BillHistoryListResult {
  const params: Array<string | number> = [input.stallId];
  let where = `tb.stall_id = ? AND tb.status = 'finalized'`;
  if (input.billNumber !== undefined && input.billNumber.trim().length > 0) {
    where += ` AND tb.bill_number LIKE ? ESCAPE '\\'`;
    params.push(`%${escapeLike(input.billNumber.trim())}%`);
  }
  if (input.partyQuery !== undefined && input.partyQuery.trim().length > 0) {
    where += ` AND (
      COALESCE(tb.trader_short_code, t.short_code) LIKE ? ESCAPE '\\'
      OR COALESCE(tb.trader_display_name, t.display_name) LIKE ? ESCAPE '\\'
    )`;
    const pattern = `%${escapeLike(input.partyQuery.trim())}%`;
    params.push(pattern, pattern);
  }
  if (input.businessDateFrom !== undefined) {
    where += ` AND tb.business_date >= ?`;
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += ` AND tb.business_date <= ?`;
    params.push(input.businessDateTo);
  }
  if (input.issueDateFrom !== undefined) {
    where += ` AND substr(tb.finalized_at, 1, 10) >= ?`;
    params.push(input.issueDateFrom);
  }
  if (input.issueDateTo !== undefined) {
    where += ` AND substr(tb.finalized_at, 1, 10) <= ?`;
    params.push(input.issueDateTo);
  }
  if (input.documentStatus !== undefined) {
    where += ` AND tb.status = ?`;
    params.push(input.documentStatus);
  }
  if (input.correctionPresence === "with_correction") {
    where += ` AND tb.correction_status != 'active'`;
  } else if (input.correctionPresence === "without_correction") {
    where += ` AND tb.correction_status = 'active'`;
  }

  const totalRow = executor.db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM trader_bills tb
       INNER JOIN traders t ON t.id = tb.trader_id AND t.stall_id = tb.stall_id
       WHERE ${where}`,
    )
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const limit = input.billType === undefined ? 500 : input.limit;
  const offset = input.billType === undefined ? 0 : input.offset;

  const rows = executor.db
    .prepare(
      `SELECT tb.id, tb.sale_id, tb.bill_number, tb.trader_id,
              COALESCE(tb.trader_short_code, t.short_code) AS party_code,
              COALESCE(tb.trader_display_name, t.display_name) AS party_name,
              tb.business_date, tb.finalized_at, tb.total_amount_minor, tb.status,
              tb.correction_status, tb.replacement_trader_bill_id, tb.payment_status
       FROM trader_bills tb
       INNER JOIN traders t ON t.id = tb.trader_id AND t.stall_id = tb.stall_id
       WHERE ${where}
       ORDER BY tb.finalized_at DESC, tb.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    totalCount,
    items: rows.map((row) => {
      const correctionStatus = mapCorrectionStatus(row["correction_status"]);
      return {
        billType: "trader" as const,
        billId: requireString(row["id"], "id"),
        billNumber: requireString(row["bill_number"], "bill_number"),
        partyId: requireString(row["trader_id"], "trader_id"),
        partyCode: requireString(row["party_code"], "party_code"),
        partyDisplayName: requireString(row["party_name"], "party_name"),
        businessDate: requireCalendarDate(row["business_date"], "business_date"),
        issuedAt: requireAbsoluteTimestamp(row["finalized_at"], "finalized_at"),
        originalAmountMinor: moneyMinorFromSqliteInteger(row["total_amount_minor"]),
        documentStatus: requireString(row["status"], "status"),
        correctionStatus,
        hasCorrection: correctionStatus !== "active",
        saleId: requireString(row["sale_id"], "sale_id"),
        replacementBillId: optionalString(
          row["replacement_trader_bill_id"],
          "replacement_trader_bill_id",
        ),
        paymentStatus: optionalString(row["payment_status"], "payment_status"),
      };
    }),
  };
}

function listFarmerHistory(
  executor: DbExecutor,
  input: ListBillHistoryInput,
): BillHistoryListResult {
  const params: Array<string | number> = [input.stallId];
  let where = `fb.stall_id = ? AND fb.status = 'finalized'`;
  if (input.billNumber !== undefined && input.billNumber.trim().length > 0) {
    where += ` AND fb.bill_number LIKE ? ESCAPE '\\'`;
    params.push(`%${escapeLike(input.billNumber.trim())}%`);
  }
  if (input.partyQuery !== undefined && input.partyQuery.trim().length > 0) {
    where += ` AND (
      fb.farmer_short_code LIKE ? ESCAPE '\\'
      OR fb.farmer_display_name LIKE ? ESCAPE '\\'
    )`;
    const pattern = `%${escapeLike(input.partyQuery.trim())}%`;
    params.push(pattern, pattern);
  }
  if (input.businessDateFrom !== undefined) {
    where += ` AND fb.business_date >= ?`;
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += ` AND fb.business_date <= ?`;
    params.push(input.businessDateTo);
  }
  if (input.issueDateFrom !== undefined) {
    where += ` AND substr(fb.finalized_at, 1, 10) >= ?`;
    params.push(input.issueDateFrom);
  }
  if (input.issueDateTo !== undefined) {
    where += ` AND substr(fb.finalized_at, 1, 10) <= ?`;
    params.push(input.issueDateTo);
  }
  if (input.documentStatus !== undefined) {
    where += ` AND fb.status = ?`;
    params.push(input.documentStatus);
  }
  if (input.correctionPresence === "with_correction") {
    // Farmer bills are not corrected in Phase 25; no matches.
    return { items: [], totalCount: 0 };
  }

  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM farmer_bills fb WHERE ${where}`)
    .get(...params) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const limit = input.billType === undefined ? 500 : input.limit;
  const offset = input.billType === undefined ? 0 : input.offset;

  const rows = executor.db
    .prepare(
      `SELECT fb.id, fb.bill_number, fb.farmer_id, fb.farmer_short_code, fb.farmer_display_name,
              fb.business_date, fb.finalized_at, fb.total_amount_minor, fb.status, fb.payment_status
       FROM farmer_bills fb
       WHERE ${where}
       ORDER BY fb.finalized_at DESC, fb.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    totalCount,
    items: rows.map((row) => ({
      billType: "farmer" as const,
      billId: requireString(row["id"], "id"),
      billNumber: requireString(row["bill_number"], "bill_number"),
      partyId: requireString(row["farmer_id"], "farmer_id"),
      partyCode: requireString(row["farmer_short_code"], "farmer_short_code"),
      partyDisplayName: requireString(row["farmer_display_name"], "farmer_display_name"),
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      issuedAt: requireAbsoluteTimestamp(row["finalized_at"], "finalized_at"),
      originalAmountMinor: moneyMinorFromSqliteInteger(row["total_amount_minor"]),
      documentStatus: requireString(row["status"], "status"),
      correctionStatus: "none" as const,
      hasCorrection: false,
      saleId: null,
      replacementBillId: null,
      paymentStatus: optionalString(row["payment_status"], "payment_status"),
    })),
  };
}

function mapCorrectionStatus(value: unknown): SaleCorrectionStatus {
  const status = optionalString(value, "correction_status") ?? "active";
  if (status !== "active" && status !== "reversed" && status !== "superseded") {
    throw new RepositoryError(`Unexpected correction status: ${status}`);
  }
  return status;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
