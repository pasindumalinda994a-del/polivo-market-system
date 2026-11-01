import { moneyMinorToSqliteInteger } from "../numeric.js";
import {
  mapBillRow,
  type BillRecord,
  type BillStatus,
  type BillType,
  type PaymentStatus,
} from "../mapping/records.js";
import { RevisionConflictError, type DbExecutor } from "./types.js";

const BILL_TABLE: Record<BillType, string> = {
  farmer: "farmer_bills",
  trader: "trader_bills",
};

const PARTY_COLUMN: Record<BillType, string> = {
  farmer: "farmer_id",
  trader: "trader_id",
};

export function getBillById(
  executor: DbExecutor,
  kind: BillType,
  stallId: string,
  billId: string,
): BillRecord | null {
  const table = BILL_TABLE[kind];
  const partyColumn = PARTY_COLUMN[kind];
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, sale_id, ${partyColumn}, bill_number, business_date, status,
              revision, total_amount_minor, payment_status, created_at, updated_at
       FROM ${table}
       WHERE id = ? AND stall_id = ?`,
    )
    .get(billId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapBillRow(row, kind);
}

export type BillOptimisticUpdate = {
  expectedRevision: number;
  status?: BillStatus;
  billNumber?: string | null;
  totalAmountMinor?: number | null;
  paymentStatus?: PaymentStatus | null;
  updatedAt: string;
};

/**
 * Update a bill only when the stored revision matches expectedRevision.
 * On success, increments revision by 1 and returns the new revision.
 */
export function updateBillWithExpectedRevision(
  executor: DbExecutor,
  kind: BillType,
  stallId: string,
  billId: string,
  update: BillOptimisticUpdate,
): number {
  const table = BILL_TABLE[kind];
  const sets: string[] = ["revision = revision + 1", "updated_at = ?"];
  const params: Array<string | number | bigint | null> = [update.updatedAt];

  if (update.status !== undefined) {
    sets.push("status = ?");
    params.push(update.status);
  }
  if (update.billNumber !== undefined) {
    sets.push("bill_number = ?");
    params.push(update.billNumber);
  }
  if (update.totalAmountMinor !== undefined) {
    sets.push("total_amount_minor = ?");
    params.push(
      update.totalAmountMinor === null ? null : moneyMinorToSqliteInteger(update.totalAmountMinor),
    );
  }
  if (update.paymentStatus !== undefined) {
    sets.push("payment_status = ?");
    params.push(update.paymentStatus);
  }

  params.push(billId, stallId, update.expectedRevision);

  const result = executor.db
    .prepare(
      `UPDATE ${table}
       SET ${sets.join(", ")}
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(...params);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}
