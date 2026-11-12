import {
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireInteger,
  requireString,
} from "../mapping/errors.js";
import { findOriginalFarmerBillInclusion } from "./farmer-bills.js";
import { getSaleById, getTraderBillBySaleId, type SaleCorrectionStatus, type SaleRecord } from "./sales.js";
import { RevisionConflictError, RepositoryError, type DbExecutor } from "./types.js";

export type SaleCorrectionAction = "correct" | "reverse";

export type SaleCorrectionOperationRecord = {
  id: string;
  stallId: string;
  action: SaleCorrectionAction;
  sourceSaleId: string;
  replacementSaleId: string | null;
  reason: string;
  actorStaffId: string;
  recordedAt: string;
  businessDate: string;
  previewFingerprint: string;
  sourceRevisionExpected: number;
  status: "committed";
  reversalPostingId: string;
  replacementPostingId: string | null;
  originalTraderBillId: string | null;
  replacementTraderBillId: string | null;
  createdAt: string;
};

export type ObligationAllocationHit = {
  allocationId: string;
  obligationKind: "trader_bill" | "farmer_sale_line" | "opening_balance";
  billKind: "farmer" | "trader" | null;
  traderBillId: string | null;
  farmerBillId: string | null;
  saleLineId: string | null;
};

export type SaleCorrectionEligibilityCode =
  | "allowed"
  | "blocked_already_corrected"
  | "blocked_superseded"
  | "blocked_farmer_bill_inclusion"
  | "blocked_payment_allocation"
  | "blocked_not_finalized"
  | "blocked_inactive_reference"
  | "blocked_stale_revision"
  | "blocked_unsupported";

export type SaleCorrectionEligibilityResult = {
  code: SaleCorrectionEligibilityCode;
  allowed: boolean;
  message: string;
  sale: SaleRecord | null;
  traderBillId: string | null;
  farmerBillInclusions: Array<{ saleLineId: string; farmerBillId: string; billNumber: string }>;
  allocations: ObligationAllocationHit[];
};

/**
 * Shared obligation eligibility check for Phase 25 corrections and Phase 26 payments.
 * Callers must re-run inside the write transaction before attaching allocations or reversing.
 */
export function findAllocationsForTraderBill(
  executor: DbExecutor,
  stallId: string,
  traderBillId: string,
): ObligationAllocationHit[] {
  const rows = executor.db
    .prepare(
      `SELECT id, obligation_kind, trader_bill_id, farmer_bill_id, sale_line_id
       FROM payment_allocations
       WHERE stall_id = ? AND status = 'active' AND trader_bill_id = ?`,
    )
    .all(stallId, traderBillId) as Array<Record<string, unknown>>;
  return rows.map(mapAllocationHit);
}

export function findAllocationsForFarmerBill(
  executor: DbExecutor,
  stallId: string,
  farmerBillId: string,
): ObligationAllocationHit[] {
  const rows = executor.db
    .prepare(
      `SELECT id, obligation_kind, trader_bill_id, farmer_bill_id, sale_line_id
       FROM payment_allocations
       WHERE stall_id = ? AND status = 'active' AND farmer_bill_id = ?`,
    )
    .all(stallId, farmerBillId) as Array<Record<string, unknown>>;
  return rows.map(mapAllocationHit);
}

export function findActiveAllocationsForSaleLines(
  executor: DbExecutor,
  stallId: string,
  saleLineIds: readonly string[],
): ObligationAllocationHit[] {
  if (saleLineIds.length === 0) {
    return [];
  }
  const placeholders = saleLineIds.map(() => "?").join(", ");
  const rows = executor.db
    .prepare(
      `SELECT id, obligation_kind, trader_bill_id, farmer_bill_id, sale_line_id
       FROM payment_allocations
       WHERE stall_id = ? AND status = 'active' AND obligation_kind = 'farmer_sale_line'
         AND sale_line_id IN (${placeholders})`,
    )
    .all(stallId, ...saleLineIds) as Array<Record<string, unknown>>;
  return rows.map(mapAllocationHit);
}

/**
 * True when an obligation may still receive new payment allocations.
 * Reversed/superseded trader bills must not accept future allocations.
 */
export function isTraderBillAllocatable(
  executor: DbExecutor,
  stallId: string,
  traderBillId: string,
): boolean {
  const row = executor.db
    .prepare(
      `SELECT status, correction_status
       FROM trader_bills
       WHERE id = ? AND stall_id = ?`,
    )
    .get(traderBillId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return false;
  }
  const status = requireString(row["status"], "trader_bills.status");
  const correctionStatus = optionalString(row["correction_status"], "correction_status") ?? "active";
  return status === "finalized" && correctionStatus === "active";
}

export function resolveSaleCorrectionEligibility(
  executor: DbExecutor,
  input: {
    stallId: string;
    saleId: string;
    expectedRevision?: number;
  },
): SaleCorrectionEligibilityResult {
  const sale = getSaleById(executor, input.stallId, input.saleId);
  if (sale === null) {
    return {
      code: "blocked_unsupported",
      allowed: false,
      message: "Sale was not found in this stall.",
      sale: null,
      traderBillId: null,
      farmerBillInclusions: [],
      allocations: [],
    };
  }
  if (sale.status !== "finalized") {
    return {
      code: "blocked_not_finalized",
      allowed: false,
      message: "Only finalized sales can be corrected or reversed.",
      sale,
      traderBillId: null,
      farmerBillInclusions: [],
      allocations: [],
    };
  }
  if (input.expectedRevision !== undefined && sale.revision !== input.expectedRevision) {
    return {
      code: "blocked_stale_revision",
      allowed: false,
      message: "Sale revision changed. Reload and preview again.",
      sale,
      traderBillId: null,
      farmerBillInclusions: [],
      allocations: [],
    };
  }
  if (sale.correctionStatus === "reversed") {
    return {
      code: "blocked_already_corrected",
      allowed: false,
      message: "This sale has already been reversed.",
      sale,
      traderBillId: null,
      farmerBillInclusions: [],
      allocations: [],
    };
  }
  if (sale.correctionStatus === "superseded") {
    return {
      code: "blocked_superseded",
      allowed: false,
      message:
        "This sale has already been corrected. Open the current replacement sale to correct further.",
      sale,
      traderBillId: null,
      farmerBillInclusions: [],
      allocations: [],
    };
  }

  const traderBill = getTraderBillBySaleId(executor, input.stallId, sale.id);
  const traderBillId = traderBill?.id ?? null;

  const farmerBillInclusions: SaleCorrectionEligibilityResult["farmerBillInclusions"] = [];
  for (const line of sale.lines) {
    const inclusion = findOriginalFarmerBillInclusion(executor, input.stallId, line.id);
    if (inclusion !== null) {
      farmerBillInclusions.push({
        saleLineId: line.id,
        farmerBillId: inclusion.farmerBillId,
        billNumber: inclusion.billNumber,
      });
    }
  }
  if (farmerBillInclusions.length > 0) {
    const numbers = [...new Set(farmerBillInclusions.map((item) => item.billNumber))].join(", ");
    return {
      code: "blocked_farmer_bill_inclusion",
      allowed: false,
      message: `This sale is included on issued farmer bill(s) ${numbers}. Correction and cancellation are blocked until a linked-document policy is approved.`,
      sale,
      traderBillId,
      farmerBillInclusions,
      allocations: [],
    };
  }

  const saleLineAllocations = findActiveAllocationsForSaleLines(
    executor,
    input.stallId,
    sale.lines.map((line) => line.id),
  );
  if (saleLineAllocations.length > 0) {
    return {
      code: "blocked_payment_allocation",
      allowed: false,
      message:
        "This sale has farmer sale-line payment allocations. Correction and cancellation are blocked until settled-obligation rules are implemented.",
      sale,
      traderBillId,
      farmerBillInclusions: [],
      allocations: saleLineAllocations,
    };
  }

  const allocations =
    traderBillId === null
      ? []
      : findAllocationsForTraderBill(executor, input.stallId, traderBillId);
  if (allocations.length > 0) {
    return {
      code: "blocked_payment_allocation",
      allowed: false,
      message:
        "This buyer bill has payment allocations. Correction and cancellation are blocked until settled-obligation rules are implemented.",
      sale,
      traderBillId,
      farmerBillInclusions: [],
      allocations,
    };
  }

  if (sale.postingId === null) {
    return {
      code: "blocked_unsupported",
      allowed: false,
      message: "Sale has no ledger posting to reverse.",
      sale,
      traderBillId,
      farmerBillInclusions: [],
      allocations: [],
    };
  }

  return {
    code: "allowed",
    allowed: true,
    message: "Sale is eligible for correction or reversal.",
    sale,
    traderBillId,
    farmerBillInclusions: [],
    allocations: [],
  };
}

export type InsertSaleCorrectionOperationInput = {
  id: string;
  stallId: string;
  action: SaleCorrectionAction;
  sourceSaleId: string;
  replacementSaleId: string | null;
  reason: string;
  actorStaffId: string;
  recordedAt: string;
  businessDate: string;
  previewFingerprint: string;
  sourceRevisionExpected: number;
  reversalPostingId: string;
  replacementPostingId: string | null;
  originalTraderBillId: string | null;
  replacementTraderBillId: string | null;
  createdAt: string;
};

export function insertSaleCorrectionOperation(
  executor: DbExecutor,
  input: InsertSaleCorrectionOperationInput,
): SaleCorrectionOperationRecord {
  try {
    executor.db
      .prepare(
        `INSERT INTO sale_correction_operations (
           id, stall_id, action, source_sale_id, replacement_sale_id, reason, actor_staff_id,
           recorded_at, business_date, preview_fingerprint, source_revision_expected, status,
           reversal_posting_id, replacement_posting_id, original_trader_bill_id,
           replacement_trader_bill_id, created_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, 'committed',
           ?, ?, ?,
           ?, ?
         )`,
      )
      .run(
        input.id,
        input.stallId,
        input.action,
        input.sourceSaleId,
        input.replacementSaleId,
        input.reason,
        input.actorStaffId,
        input.recordedAt,
        input.businessDate,
        input.previewFingerprint,
        input.sourceRevisionExpected,
        input.reversalPostingId,
        input.replacementPostingId,
        input.originalTraderBillId,
        input.replacementTraderBillId,
        input.createdAt,
      );
  } catch (error) {
    throw new RepositoryError(
      error instanceof Error
        ? `Failed to insert sale correction operation: ${error.message}`
        : "Failed to insert sale correction operation.",
    );
  }
  const created = getSaleCorrectionOperationById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load sale correction operation after insert.");
  }
  return created;
}

export function getSaleCorrectionOperationById(
  executor: DbExecutor,
  stallId: string,
  operationId: string,
): SaleCorrectionOperationRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, action, source_sale_id, replacement_sale_id, reason, actor_staff_id,
              recorded_at, business_date, preview_fingerprint, source_revision_expected, status,
              reversal_posting_id, replacement_posting_id, original_trader_bill_id,
              replacement_trader_bill_id, created_at
       FROM sale_correction_operations
       WHERE id = ? AND stall_id = ?`,
    )
    .get(operationId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapOperation(row);
}

export function getSaleCorrectionOperationBySourceSaleId(
  executor: DbExecutor,
  stallId: string,
  sourceSaleId: string,
): SaleCorrectionOperationRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, action, source_sale_id, replacement_sale_id, reason, actor_staff_id,
              recorded_at, business_date, preview_fingerprint, source_revision_expected, status,
              reversal_posting_id, replacement_posting_id, original_trader_bill_id,
              replacement_trader_bill_id, created_at
       FROM sale_correction_operations
       WHERE stall_id = ? AND source_sale_id = ?`,
    )
    .get(stallId, sourceSaleId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapOperation(row);
}

export function markSaleCorrectedWithExpectedRevision(
  executor: DbExecutor,
  input: {
    stallId: string;
    saleId: string;
    expectedRevision: number;
    correctionStatus: Extract<SaleCorrectionStatus, "reversed" | "superseded">;
    correctionOperationId: string;
    replacementSaleId: string | null;
    reversalPostingId: string;
    updatedAt: string;
  },
): void {
  const result = executor.db
    .prepare(
      `UPDATE sales
       SET correction_status = ?,
           correction_operation_id = ?,
           replacement_sale_id = ?,
           reversal_posting_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ? AND status = 'finalized'
         AND correction_status = 'active'`,
    )
    .run(
      input.correctionStatus,
      input.correctionOperationId,
      input.replacementSaleId,
      input.reversalPostingId,
      input.updatedAt,
      input.saleId,
      input.stallId,
      input.expectedRevision,
    );
  if (result.changes !== 1) {
    throw new RevisionConflictError(
      "Sale correction projection could not be updated (stale revision or already corrected).",
    );
  }
}

export function markTraderBillCorrected(
  executor: DbExecutor,
  input: {
    stallId: string;
    traderBillId: string;
    correctionStatus: Extract<SaleCorrectionStatus, "reversed" | "superseded">;
    correctionOperationId: string;
    replacementTraderBillId: string | null;
    updatedAt: string;
  },
): void {
  const result = executor.db
    .prepare(
      `UPDATE trader_bills
       SET correction_status = ?,
           correction_operation_id = ?,
           replacement_trader_bill_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND status = 'finalized'
         AND correction_status = 'active'`,
    )
    .run(
      input.correctionStatus,
      input.correctionOperationId,
      input.replacementTraderBillId,
      input.updatedAt,
      input.traderBillId,
      input.stallId,
    );
  if (result.changes !== 1) {
    throw new RevisionConflictError(
      "Trader bill correction projection could not be updated (already corrected).",
    );
  }
}

function mapAllocationHit(row: Record<string, unknown>): ObligationAllocationHit {
  const obligationKind = requireString(row["obligation_kind"], "payment_allocations.obligation_kind");
  if (
    obligationKind !== "trader_bill" &&
    obligationKind !== "farmer_sale_line" &&
    obligationKind !== "opening_balance"
  ) {
    throw new RepositoryError(`Unexpected obligation kind: ${obligationKind}`);
  }
  const farmerBillId = optionalString(row["farmer_bill_id"], "farmer_bill_id");
  let billKind: ObligationAllocationHit["billKind"];
  if (obligationKind === "trader_bill") {
    billKind = "trader";
  } else if (obligationKind === "farmer_sale_line" && farmerBillId !== null) {
    billKind = "farmer";
  } else if (obligationKind === "opening_balance") {
    billKind = null;
  } else {
    billKind = null;
  }
  return {
    allocationId: requireString(row["id"], "payment_allocations.id"),
    obligationKind,
    billKind,
    traderBillId: optionalString(row["trader_bill_id"], "trader_bill_id"),
    farmerBillId,
    saleLineId: optionalString(row["sale_line_id"], "sale_line_id"),
  };
}

function mapOperation(row: Record<string, unknown>): SaleCorrectionOperationRecord {
  const action = requireString(row["action"], "sale_correction_operations.action");
  if (action !== "correct" && action !== "reverse") {
    throw new RepositoryError(`Unexpected correction action: ${action}`);
  }
  const status = requireString(row["status"], "sale_correction_operations.status");
  if (status !== "committed") {
    throw new RepositoryError(`Unexpected correction operation status: ${status}`);
  }
  return {
    id: requireString(row["id"], "sale_correction_operations.id"),
    stallId: requireString(row["stall_id"], "sale_correction_operations.stall_id"),
    action,
    sourceSaleId: requireString(row["source_sale_id"], "source_sale_id"),
    replacementSaleId: optionalString(row["replacement_sale_id"], "replacement_sale_id"),
    reason: requireString(row["reason"], "reason"),
    actorStaffId: requireString(row["actor_staff_id"], "actor_staff_id"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    previewFingerprint: requireString(row["preview_fingerprint"], "preview_fingerprint"),
    sourceRevisionExpected: requireInteger(
      row["source_revision_expected"],
      "source_revision_expected",
    ),
    status: "committed",
    reversalPostingId: requireString(row["reversal_posting_id"], "reversal_posting_id"),
    replacementPostingId: optionalString(row["replacement_posting_id"], "replacement_posting_id"),
    originalTraderBillId: optionalString(row["original_trader_bill_id"], "original_trader_bill_id"),
    replacementTraderBillId: optionalString(
      row["replacement_trader_bill_id"],
      "replacement_trader_bill_id",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "created_at"),
  };
}
