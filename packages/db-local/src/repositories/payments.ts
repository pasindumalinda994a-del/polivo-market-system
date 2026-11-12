import {
  aggregateBillSettlement,
  buildObligationRemainder,
  obligationRemainingAmountMinor,
  paymentAvailableAmountMinor,
  type ObligationKind,
} from "@polivo/domain";

import { moneyMinorFromSqliteInteger, moneyMinorToSqliteInteger } from "../numeric.js";
import {
  optionalAbsoluteTimestamp,
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireString,
} from "../mapping/errors.js";
import type {
  LedgerPartyKind,
  OpeningBalanceDirection,
  PaymentStatus,
} from "../mapping/records.js";
import { getFarmerBillById } from "./farmer-bills.js";
import { getTraderBillById } from "./sales.js";
import { RepositoryError, RevisionConflictError, type DbExecutor } from "./types.js";

export type PaymentPartyKind = "farmer" | "trader";
export type PaymentDirection = "receive" | "pay";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque";
export type PaymentRecordStatus = "posted" | "reversed";
export type PaymentAllocationStatus = "active" | "reversed";

export type PaymentAllocationRecord = {
  id: string;
  stallId: string;
  paymentId: string;
  obligationKind: ObligationKind;
  traderBillId: string | null;
  saleLineId: string | null;
  openingDraftId: string | null;
  farmerBillId: string | null;
  appliedAmountMinor: number;
  status: PaymentAllocationStatus;
  reversesAllocationId: string | null;
  createdAt: string;
  /** Set when the allocation is released via payment reversal (Phase 28). */
  releasedAt: string | null;
};

export type PaymentRecord = {
  id: string;
  stallId: string;
  partyKind: PaymentPartyKind;
  farmerId: string | null;
  traderId: string | null;
  direction: PaymentDirection;
  method: PaymentMethod;
  amountMinor: number;
  currency: "LKR";
  businessDate: string;
  referenceNumber: string;
  status: PaymentRecordStatus;
  paidAt: string;
  recordedAt: string;
  actorStaffId: string;
  postingId: string;
  reversesPaymentId: string | null;
  reversedByPaymentId: string | null;
  bankTransferReference: string | null;
  bankTransferDate: string | null;
  bankAccountLabel: string | null;
  chequeNumber: string | null;
  issuingBankLabel: string | null;
  chequeDate: string | null;
  physicalHandoverDate: string | null;
  note: string | null;
  createdAt: string;
  allocations: PaymentAllocationRecord[];
};

export type InsertPaymentInput = {
  id: string;
  stallId: string;
  partyKind: PaymentPartyKind;
  farmerId: string | null;
  traderId: string | null;
  direction: PaymentDirection;
  method: PaymentMethod;
  amountMinor: number;
  businessDate: string;
  referenceNumber: string;
  status: PaymentRecordStatus;
  paidAt: string;
  recordedAt: string;
  actorStaffId: string;
  postingId: string;
  reversesPaymentId?: string | null;
  reversedByPaymentId?: string | null;
  bankTransferReference?: string | null;
  bankTransferDate?: string | null;
  bankAccountLabel?: string | null;
  chequeNumber?: string | null;
  issuingBankLabel?: string | null;
  chequeDate?: string | null;
  physicalHandoverDate?: string | null;
  note?: string | null;
  createdAt: string;
};

export type InsertAllocationInput = {
  id: string;
  stallId: string;
  paymentId: string;
  obligationKind: ObligationKind;
  traderBillId?: string | null;
  saleLineId?: string | null;
  openingDraftId?: string | null;
  farmerBillId?: string | null;
  appliedAmountMinor: number;
  status?: PaymentAllocationStatus;
  reversesAllocationId?: string | null;
  createdAt: string;
};

export type BillSettlementSummary = {
  originalAmountMinor: number;
  activeAllocatedMinor: number;
  remainingMinor: number;
  paymentStatus: PaymentStatus;
};

export type EligibleObligationRow = {
  obligationKind: ObligationKind;
  targetId: string;
  label: string;
  businessDate: string | null;
  effectiveAmountMinor: number;
  activeAllocatedMinor: number;
  remainingMinor: number;
  documentKind: "trader_bill" | "farmer_bill" | "opening_balance" | "sale_line" | null;
  documentId: string | null;
  documentNumber: string | null;
  farmerBillId: string | null;
};

export type PaymentListItem = {
  paymentId: string;
  referenceNumber: string;
  partyKind: PaymentPartyKind;
  partyId: string;
  partyCode: string;
  partyDisplayName: string;
  direction: PaymentDirection;
  method: PaymentMethod;
  amountMinor: number;
  status: PaymentRecordStatus;
  businessDate: string;
  recordedAt: string;
  allocatedTotalMinor: number;
  unappliedAmountMinor: number;
  chequeNumber: string | null;
  issuingBankLabel: string | null;
  physicalHandoverDate: string | null;
};

export type ListPaymentsInput = {
  stallId: string;
  partyKind?: PaymentPartyKind;
  partyId?: string;
  direction?: PaymentDirection;
  method?: PaymentMethod;
  status?: PaymentRecordStatus;
  businessDateFrom?: string;
  businessDateTo?: string;
  limit: number;
  cursor?: string;
};

export type ChequeDuplicateMatch = {
  paymentId: string;
  referenceNumber: string;
  chequeNumber: string;
  issuingBankLabel: string;
  status: PaymentRecordStatus;
};

export type ListPaymentsResult = {
  items: PaymentListItem[];
  nextCursor: string | null;
  totalCount: number;
};

const PAYMENT_SELECT = `id, stall_id, party_kind, farmer_id, trader_id, direction, method, amount_minor,
  currency, business_date, reference_number, status, paid_at, recorded_at, actor_staff_id, posting_id,
  reverses_payment_id, reversed_by_payment_id, bank_transfer_reference, bank_transfer_date,
  bank_account_label, cheque_number, issuing_bank_label, cheque_date, physical_handover_date,
  note, created_at`;

const ALLOCATION_SELECT = `id, stall_id, payment_id, obligation_kind, trader_bill_id, sale_line_id,
  opening_draft_id, farmer_bill_id, applied_amount_minor, status, reverses_allocation_id, created_at,
  released_at`;

const PAYMENT_LIST_CURSOR_PREFIX = "payment-list:";

function settleableOpeningDirection(partyKind: LedgerPartyKind): OpeningBalanceDirection {
  return partyKind === "trader" ? "buyer_owes_stall" : "stall_owes_farmer";
}

function encodePaymentListCursor(recordedAt: string, paymentId: string): string {
  return `${PAYMENT_LIST_CURSOR_PREFIX}${recordedAt}:${paymentId}`;
}

function decodePaymentListCursor(cursor: string): { recordedAt: string; paymentId: string } {
  if (!cursor.startsWith(PAYMENT_LIST_CURSOR_PREFIX)) {
    throw new RepositoryError("Invalid payment list cursor.");
  }
  const payload = cursor.slice(PAYMENT_LIST_CURSOR_PREFIX.length);
  const separator = payload.lastIndexOf(":");
  if (separator <= 0) {
    throw new RepositoryError("Invalid payment list cursor.");
  }
  const recordedAt = payload.slice(0, separator);
  const paymentId = payload.slice(separator + 1);
  if (recordedAt.length === 0 || paymentId.length === 0) {
    throw new RepositoryError("Invalid payment list cursor.");
  }
  return { recordedAt, paymentId };
}

function mapAllocationRow(row: Record<string, unknown>): PaymentAllocationRecord {
  const obligationKind = requireString(row["obligation_kind"], "obligation_kind");
  if (
    obligationKind !== "trader_bill" &&
    obligationKind !== "farmer_sale_line" &&
    obligationKind !== "opening_balance"
  ) {
    throw new RepositoryError(`Unexpected obligation kind: ${obligationKind}`);
  }
  const status = requireString(row["status"], "payment_allocations.status");
  if (status !== "active" && status !== "reversed") {
    throw new RepositoryError(`Unexpected allocation status: ${status}`);
  }
  return {
    id: requireString(row["id"], "payment_allocations.id"),
    stallId: requireString(row["stall_id"], "payment_allocations.stall_id"),
    paymentId: requireString(row["payment_id"], "payment_id"),
    obligationKind,
    traderBillId: optionalString(row["trader_bill_id"], "trader_bill_id"),
    saleLineId: optionalString(row["sale_line_id"], "sale_line_id"),
    openingDraftId: optionalString(row["opening_draft_id"], "opening_draft_id"),
    farmerBillId: optionalString(row["farmer_bill_id"], "farmer_bill_id"),
    appliedAmountMinor: moneyMinorFromSqliteInteger(row["applied_amount_minor"]),
    status,
    reversesAllocationId: optionalString(row["reverses_allocation_id"], "reverses_allocation_id"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "created_at"),
    releasedAt: optionalAbsoluteTimestamp(row["released_at"], "released_at"),
  };
}

function mapPaymentRow(
  row: Record<string, unknown>,
  allocations: PaymentAllocationRecord[],
): PaymentRecord {
  const partyKind = requireString(row["party_kind"], "party_kind");
  if (partyKind !== "farmer" && partyKind !== "trader") {
    throw new RepositoryError(`Unexpected payment party kind: ${partyKind}`);
  }
  const direction = requireString(row["direction"], "direction");
  if (direction !== "receive" && direction !== "pay") {
    throw new RepositoryError(`Unexpected payment direction: ${direction}`);
  }
  const method = requireString(row["method"], "method");
  if (method !== "cash" && method !== "bank_transfer" && method !== "cheque") {
    throw new RepositoryError(`Unexpected payment method: ${method}`);
  }
  const status = requireString(row["status"], "status");
  if (status !== "posted" && status !== "reversed") {
    throw new RepositoryError(`Unexpected payment status: ${status}`);
  }
  return {
    id: requireString(row["id"], "payments.id"),
    stallId: requireString(row["stall_id"], "payments.stall_id"),
    partyKind,
    farmerId: optionalString(row["farmer_id"], "farmer_id"),
    traderId: optionalString(row["trader_id"], "trader_id"),
    direction,
    method,
    amountMinor: moneyMinorFromSqliteInteger(row["amount_minor"]),
    currency: "LKR",
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    referenceNumber: requireString(row["reference_number"], "reference_number"),
    status,
    paidAt: requireAbsoluteTimestamp(row["paid_at"], "paid_at"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    actorStaffId: requireString(row["actor_staff_id"], "actor_staff_id"),
    postingId: requireString(row["posting_id"], "posting_id"),
    reversesPaymentId: optionalString(row["reverses_payment_id"], "reverses_payment_id"),
    reversedByPaymentId: optionalString(row["reversed_by_payment_id"], "reversed_by_payment_id"),
    bankTransferReference: optionalString(
      row["bank_transfer_reference"],
      "bank_transfer_reference",
    ),
    bankTransferDate:
      row["bank_transfer_date"] === null || row["bank_transfer_date"] === undefined
        ? null
        : requireCalendarDate(row["bank_transfer_date"], "bank_transfer_date"),
    bankAccountLabel: optionalString(row["bank_account_label"], "bank_account_label"),
    chequeNumber: optionalString(row["cheque_number"], "cheque_number"),
    issuingBankLabel: optionalString(row["issuing_bank_label"], "issuing_bank_label"),
    chequeDate:
      row["cheque_date"] === null || row["cheque_date"] === undefined
        ? null
        : requireCalendarDate(row["cheque_date"], "cheque_date"),
    physicalHandoverDate:
      row["physical_handover_date"] === null || row["physical_handover_date"] === undefined
        ? null
        : requireCalendarDate(row["physical_handover_date"], "physical_handover_date"),
    note: optionalString(row["note"], "note"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "created_at"),
    allocations,
  };
}

export function insertPayment(executor: DbExecutor, input: InsertPaymentInput): PaymentRecord {
  try {
    executor.db
      .prepare(
        `INSERT INTO payments (
           id, stall_id, party_kind, farmer_id, trader_id, direction, method, amount_minor,
           currency, business_date, reference_number, status, paid_at, recorded_at, actor_staff_id,
           posting_id, reverses_payment_id, reversed_by_payment_id, bank_transfer_reference,
           bank_transfer_date, bank_account_label, cheque_number, issuing_bank_label, cheque_date,
           physical_handover_date, note, created_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?,
           'LKR', ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?
         )`,
      )
      .run(
        input.id,
        input.stallId,
        input.partyKind,
        input.farmerId,
        input.traderId,
        input.direction,
        input.method,
        moneyMinorToSqliteInteger(input.amountMinor),
        input.businessDate,
        input.referenceNumber,
        input.status,
        input.paidAt,
        input.recordedAt,
        input.actorStaffId,
        input.postingId,
        input.reversesPaymentId ?? null,
        input.reversedByPaymentId ?? null,
        input.bankTransferReference ?? null,
        input.bankTransferDate ?? null,
        input.bankAccountLabel ?? null,
        input.chequeNumber ?? null,
        input.issuingBankLabel ?? null,
        input.chequeDate ?? null,
        input.physicalHandoverDate ?? null,
        input.note ?? null,
        input.createdAt,
      );
  } catch (error) {
    throw new RepositoryError(
      error instanceof Error
        ? `Failed to insert payment: ${error.message}`
        : "Failed to insert payment.",
    );
  }
  const created = getPaymentById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load payment after insert.");
  }
  return created;
}

export function insertPaymentAllocation(
  executor: DbExecutor,
  input: InsertAllocationInput,
): PaymentAllocationRecord {
  const status = input.status ?? "active";
  try {
    executor.db
      .prepare(
        `INSERT INTO payment_allocations (
           id, stall_id, payment_id, obligation_kind, trader_bill_id, sale_line_id,
           opening_draft_id, farmer_bill_id, applied_amount_minor, status, reverses_allocation_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.stallId,
        input.paymentId,
        input.obligationKind,
        input.traderBillId ?? null,
        input.saleLineId ?? null,
        input.openingDraftId ?? null,
        input.farmerBillId ?? null,
        moneyMinorToSqliteInteger(input.appliedAmountMinor),
        status,
        input.reversesAllocationId ?? null,
        input.createdAt,
      );
  } catch (error) {
    throw new RepositoryError(
      error instanceof Error
        ? `Failed to insert payment allocation: ${error.message}`
        : "Failed to insert payment allocation.",
    );
  }
  const row = executor.db
    .prepare(`SELECT ${ALLOCATION_SELECT} FROM payment_allocations WHERE id = ? AND stall_id = ?`)
    .get(input.id, input.stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new RepositoryError("Failed to load payment allocation after insert.");
  }
  return mapAllocationRow(row);
}

export function getPaymentById(
  executor: DbExecutor,
  stallId: string,
  paymentId: string,
): PaymentRecord | null {
  const row = executor.db
    .prepare(`SELECT ${PAYMENT_SELECT} FROM payments WHERE id = ? AND stall_id = ?`)
    .get(paymentId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  const allocationRows = executor.db
    .prepare(
      `SELECT ${ALLOCATION_SELECT}
       FROM payment_allocations
       WHERE stall_id = ? AND payment_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(stallId, paymentId) as Array<Record<string, unknown>>;
  return mapPaymentRow(row, allocationRows.map(mapAllocationRow));
}

/**
 * Stall-scoped duplicate cheque metadata lookup for preview warnings.
 * Matching is by exact cheque number; issuing bank narrows the warning when provided.
 */
export function findPotentialChequeDuplicates(
  executor: DbExecutor,
  stallId: string,
  chequeNumber: string,
  issuingBankLabel?: string | null,
  excludePaymentId?: string | null,
): ChequeDuplicateMatch[] {
  const params: string[] = [stallId, chequeNumber];
  let where = `stall_id = ? AND method = 'cheque' AND cheque_number = ? AND reverses_payment_id IS NULL`;
  if (issuingBankLabel !== undefined && issuingBankLabel !== null && issuingBankLabel.length > 0) {
    where += " AND issuing_bank_label = ?";
    params.push(issuingBankLabel);
  }
  if (excludePaymentId !== undefined && excludePaymentId !== null && excludePaymentId.length > 0) {
    where += " AND id != ?";
    params.push(excludePaymentId);
  }
  const rows = executor.db
    .prepare(
      `SELECT id, reference_number, cheque_number, issuing_bank_label, status
       FROM payments
       WHERE ${where}
       ORDER BY recorded_at DESC, id DESC
       LIMIT 20`,
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const status = requireString(row["status"], "status");
    if (status !== "posted" && status !== "reversed") {
      throw new RepositoryError(`Unexpected payment status: ${status}`);
    }
    return {
      paymentId: requireString(row["id"], "payments.id"),
      referenceNumber: requireString(row["reference_number"], "reference_number"),
      chequeNumber: requireString(row["cheque_number"], "cheque_number"),
      issuingBankLabel: requireString(row["issuing_bank_label"], "issuing_bank_label"),
      status,
    };
  });
}

export function sumActiveAllocatedForPayment(
  executor: DbExecutor,
  stallId: string,
  paymentId: string,
): number {
  const row = executor.db
    .prepare(
      `SELECT COALESCE(SUM(applied_amount_minor), 0) AS total
       FROM payment_allocations
       WHERE stall_id = ? AND payment_id = ? AND status = 'active'`,
    )
    .get(stallId, paymentId) as { total: number | bigint };
  return moneyMinorFromSqliteInteger(row.total);
}

export function sumActiveAllocatedForObligation(
  executor: DbExecutor,
  stallId: string,
  obligationKind: ObligationKind,
  targetId: string,
): number {
  let column: string;
  switch (obligationKind) {
    case "trader_bill":
      column = "trader_bill_id";
      break;
    case "farmer_sale_line":
      column = "sale_line_id";
      break;
    case "opening_balance":
      column = "opening_draft_id";
      break;
    default: {
      const _exhaustive: never = obligationKind;
      throw new RepositoryError(`Unknown obligation kind: ${_exhaustive}`);
    }
  }
  const row = executor.db
    .prepare(
      `SELECT COALESCE(SUM(applied_amount_minor), 0) AS total
       FROM payment_allocations
       WHERE stall_id = ? AND obligation_kind = ? AND status = 'active' AND ${column} = ?`,
    )
    .get(stallId, obligationKind, targetId) as { total: number | bigint };
  return moneyMinorFromSqliteInteger(row.total);
}

function buildListPaymentsFilter(input: ListPaymentsInput): {
  where: string;
  params: Array<string | number>;
} {
  const params: Array<string | number> = [input.stallId];
  let where = "p.stall_id = ?";

  if (input.partyKind !== undefined) {
    where += " AND p.party_kind = ?";
    params.push(input.partyKind);
    if (input.partyId !== undefined) {
      if (input.partyKind === "trader") {
        where += " AND p.trader_id = ?";
      } else {
        where += " AND p.farmer_id = ?";
      }
      params.push(input.partyId);
    }
  } else if (input.partyId !== undefined) {
    where += " AND (p.trader_id = ? OR p.farmer_id = ?)";
    params.push(input.partyId, input.partyId);
  }

  if (input.direction !== undefined) {
    where += " AND p.direction = ?";
    params.push(input.direction);
  }
  if (input.method !== undefined) {
    where += " AND p.method = ?";
    params.push(input.method);
  }
  if (input.status !== undefined) {
    where += " AND p.status = ?";
    params.push(input.status);
  }
  if (input.businessDateFrom !== undefined) {
    where += " AND p.business_date >= ?";
    params.push(input.businessDateFrom);
  }
  if (input.businessDateTo !== undefined) {
    where += " AND p.business_date <= ?";
    params.push(input.businessDateTo);
  }

  return { where, params };
}

export function listPayments(executor: DbExecutor, input: ListPaymentsInput): ListPaymentsResult {
  const { where: baseWhere, params: baseParams } = buildListPaymentsFilter(input);

  const totalRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM payments p WHERE ${baseWhere}`)
    .get(...baseParams) as { count: number | bigint };
  const totalCount = typeof totalRow.count === "bigint" ? Number(totalRow.count) : totalRow.count;

  const params = [...baseParams];
  let where = baseWhere;
  if (input.cursor !== undefined) {
    const decoded = decodePaymentListCursor(input.cursor);
    where += " AND (p.recorded_at < ? OR (p.recorded_at = ? AND p.id < ?))";
    params.push(decoded.recordedAt, decoded.recordedAt, decoded.paymentId);
  }

  const rows = executor.db
    .prepare(
      `SELECT
         p.id, p.reference_number, p.party_kind, p.farmer_id, p.trader_id, p.direction, p.method,
         p.amount_minor, p.status, p.business_date, p.recorded_at, p.reverses_payment_id,
         p.cheque_number, p.issuing_bank_label, p.physical_handover_date,
         COALESCE(f.short_code, t.short_code) AS party_code,
         COALESCE(f.display_name, t.display_name) AS party_display_name,
         (
           SELECT COALESCE(SUM(pa.applied_amount_minor), 0)
           FROM payment_allocations pa
           WHERE pa.stall_id = p.stall_id AND pa.payment_id = p.id AND pa.status = 'active'
         ) AS allocated_total_minor
       FROM payments p
       LEFT JOIN farmers f ON f.id = p.farmer_id AND f.stall_id = p.stall_id
       LEFT JOIN traders t ON t.id = p.trader_id AND t.stall_id = p.stall_id
       WHERE ${where}
       ORDER BY p.recorded_at DESC, p.id DESC
       LIMIT ?`,
    )
    .all(...params, input.limit + 1) as Array<Record<string, unknown>>;

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

  const items: PaymentListItem[] = pageRows.map((row) => {
    const partyKind = requireString(row["party_kind"], "party_kind") as PaymentPartyKind;
    const amountMinor = moneyMinorFromSqliteInteger(row["amount_minor"]);
    const allocatedTotalMinor = moneyMinorFromSqliteInteger(row["allocated_total_minor"]);
    const status = requireString(row["status"], "status") as PaymentRecordStatus;
    const isReversalEntry =
      optionalString(row["reverses_payment_id"], "reverses_payment_id") !== null;
    // Reversed payments and reversal entries have no unapplied credit that can still be allocated.
    const unappliedAmountMinor =
      status === "posted" && !isReversalEntry
        ? paymentAvailableAmountMinor(amountMinor, allocatedTotalMinor)
        : 0;
    const partyId =
      partyKind === "trader"
        ? requireString(row["trader_id"], "trader_id")
        : requireString(row["farmer_id"], "farmer_id");
    return {
      paymentId: requireString(row["id"], "payments.id"),
      referenceNumber: requireString(row["reference_number"], "reference_number"),
      partyKind,
      partyId,
      partyCode: requireString(row["party_code"], "party_code"),
      partyDisplayName: requireString(row["party_display_name"], "party_display_name"),
      direction: requireString(row["direction"], "direction") as PaymentDirection,
      method: requireString(row["method"], "method") as PaymentMethod,
      amountMinor,
      status,
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
      allocatedTotalMinor,
      unappliedAmountMinor,
      chequeNumber: optionalString(row["cheque_number"], "cheque_number"),
      issuingBankLabel: optionalString(row["issuing_bank_label"], "issuing_bank_label"),
      physicalHandoverDate:
        row["physical_handover_date"] === null || row["physical_handover_date"] === undefined
          ? null
          : requireCalendarDate(row["physical_handover_date"], "physical_handover_date"),
    };
  });

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last !== undefined ? encodePaymentListCursor(last.recordedAt, last.paymentId) : null;

  return { items, nextCursor, totalCount };
}

export function markPaymentReversed(
  executor: DbExecutor,
  input: {
    stallId: string;
    originalPaymentId: string;
    reversalPaymentId: string;
  },
): void {
  const result = executor.db
    .prepare(
      `UPDATE payments
       SET status = 'reversed', reversed_by_payment_id = ?
       WHERE id = ? AND stall_id = ? AND status = 'posted' AND reversed_by_payment_id IS NULL`,
    )
    .run(input.reversalPaymentId, input.originalPaymentId, input.stallId);
  if (result.changes !== 1) {
    throw new RevisionConflictError(
      "Payment could not be marked reversed (already reversed or missing).",
    );
  }
}

export function reverseActiveAllocationsForPayment(
  executor: DbExecutor,
  stallId: string,
  paymentId: string,
  releasedAt?: string,
): number {
  const result =
    releasedAt === undefined
      ? executor.db
          .prepare(
            `UPDATE payment_allocations
             SET status = 'reversed'
             WHERE stall_id = ? AND payment_id = ? AND status = 'active'`,
          )
          .run(stallId, paymentId)
      : executor.db
          .prepare(
            `UPDATE payment_allocations
             SET status = 'reversed', released_at = ?
             WHERE stall_id = ? AND payment_id = ? AND status = 'active'`,
          )
          .run(releasedAt, stallId, paymentId);
  return typeof result.changes === "bigint" ? Number(result.changes) : result.changes;
}

export function listEligibleTraderBillObligations(
  executor: DbExecutor,
  stallId: string,
  traderId: string,
): EligibleObligationRow[] {
  const rows = executor.db
    .prepare(
      `SELECT tb.id, tb.bill_number, tb.business_date, tb.total_amount_minor
       FROM trader_bills tb
       WHERE tb.stall_id = ? AND tb.trader_id = ?
         AND tb.status = 'finalized' AND tb.correction_status = 'active'`,
    )
    .all(stallId, traderId) as Array<Record<string, unknown>>;

  const eligible: EligibleObligationRow[] = [];
  for (const row of rows) {
    const targetId = requireString(row["id"], "trader_bills.id");
    const effectiveAmountMinor = moneyMinorFromSqliteInteger(row["total_amount_minor"]);
    const activeAllocatedMinor = sumActiveAllocatedForObligation(
      executor,
      stallId,
      "trader_bill",
      targetId,
    );
    const remainingMinor = obligationRemainingAmountMinor(
      effectiveAmountMinor,
      activeAllocatedMinor,
    );
    if (remainingMinor <= 0) {
      continue;
    }
    const billNumber = requireString(row["bill_number"], "bill_number");
    eligible.push({
      obligationKind: "trader_bill",
      targetId,
      label: `Buyer bill ${billNumber}`,
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      effectiveAmountMinor,
      activeAllocatedMinor,
      remainingMinor,
      documentKind: "trader_bill",
      documentId: targetId,
      documentNumber: billNumber,
      farmerBillId: null,
    });
  }
  eligible.sort((a, b) => {
    if (a.businessDate === null || b.businessDate === null) {
      return a.targetId.localeCompare(b.targetId);
    }
    if (a.businessDate < b.businessDate) return -1;
    if (a.businessDate > b.businessDate) return 1;
    return a.targetId.localeCompare(b.targetId);
  });
  return eligible;
}

export function listEligibleFarmerSaleLineObligations(
  executor: DbExecutor,
  stallId: string,
  farmerId: string,
): EligibleObligationRow[] {
  const rows = executor.db
    .prepare(
      `SELECT
         sl.id AS sale_line_id,
         s.business_date,
         COALESCE(sl.farmer_receives_minor, 0) AS farmer_receives_minor,
         fb.id AS farmer_bill_id,
         fb.bill_number AS farmer_bill_number
       FROM sale_lines sl
       INNER JOIN sales s ON s.id = sl.sale_id AND s.stall_id = sl.stall_id
       LEFT JOIN farmer_bill_lines fbl ON fbl.sale_line_id = sl.id AND fbl.stall_id = sl.stall_id
       LEFT JOIN farmer_bills fb ON fb.id = fbl.farmer_bill_id AND fb.stall_id = fbl.stall_id
       WHERE sl.stall_id = ? AND sl.farmer_id = ?
         AND s.status = 'finalized' AND s.correction_status = 'active'
         AND COALESCE(sl.farmer_receives_minor, 0) > 0`,
    )
    .all(stallId, farmerId) as Array<Record<string, unknown>>;

  const eligible: EligibleObligationRow[] = [];
  for (const row of rows) {
    const targetId = requireString(row["sale_line_id"], "sale_line_id");
    const effectiveAmountMinor = moneyMinorFromSqliteInteger(row["farmer_receives_minor"]);
    const activeAllocatedMinor = sumActiveAllocatedForObligation(
      executor,
      stallId,
      "farmer_sale_line",
      targetId,
    );
    const remainingMinor = obligationRemainingAmountMinor(
      effectiveAmountMinor,
      activeAllocatedMinor,
    );
    if (remainingMinor <= 0) {
      continue;
    }
    const farmerBillId = optionalString(row["farmer_bill_id"], "farmer_bill_id");
    const farmerBillNumber = optionalString(row["farmer_bill_number"], "farmer_bill_number");
    eligible.push({
      obligationKind: "farmer_sale_line",
      targetId,
      label:
        farmerBillNumber !== null ? `Sale line on bill ${farmerBillNumber}` : "Unbilled sale line",
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      effectiveAmountMinor,
      activeAllocatedMinor,
      remainingMinor,
      documentKind: farmerBillId === null ? "sale_line" : "farmer_bill",
      documentId: farmerBillId ?? targetId,
      documentNumber: farmerBillNumber,
      farmerBillId,
    });
  }
  eligible.sort((a, b) => {
    if (a.businessDate === null || b.businessDate === null) {
      return a.targetId.localeCompare(b.targetId);
    }
    if (a.businessDate < b.businessDate) return -1;
    if (a.businessDate > b.businessDate) return 1;
    return a.targetId.localeCompare(b.targetId);
  });
  return eligible;
}

export function listEligibleOpeningObligations(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): EligibleObligationRow[] {
  const direction = settleableOpeningDirection(partyKind);
  const rows = executor.db
    .prepare(
      `SELECT id, amount_minor, cutoff_date, reference
       FROM opening_balance_drafts
       WHERE stall_id = ? AND party_kind = ? AND party_id = ?
         AND status = 'posted' AND direction = ? AND amount_minor > 0`,
    )
    .all(stallId, partyKind, partyId, direction) as Array<Record<string, unknown>>;

  const eligible: EligibleObligationRow[] = [];
  for (const row of rows) {
    const targetId = requireString(row["id"], "opening_balance_drafts.id");
    const effectiveAmountMinor = moneyMinorFromSqliteInteger(row["amount_minor"]);
    const activeAllocatedMinor = sumActiveAllocatedForObligation(
      executor,
      stallId,
      "opening_balance",
      targetId,
    );
    const remainingMinor = obligationRemainingAmountMinor(
      effectiveAmountMinor,
      activeAllocatedMinor,
    );
    if (remainingMinor <= 0) {
      continue;
    }
    const reference = optionalString(row["reference"], "reference");
    eligible.push({
      obligationKind: "opening_balance",
      targetId,
      label: reference !== null ? `Opening balance ${reference}` : "Opening balance",
      businessDate: requireCalendarDate(row["cutoff_date"], "cutoff_date"),
      effectiveAmountMinor,
      activeAllocatedMinor,
      remainingMinor,
      documentKind: "opening_balance",
      documentId: targetId,
      documentNumber: reference,
      farmerBillId: null,
    });
  }
  eligible.sort((a, b) => {
    if (a.businessDate === null || b.businessDate === null) {
      return a.targetId.localeCompare(b.targetId);
    }
    if (a.businessDate < b.businessDate) return -1;
    if (a.businessDate > b.businessDate) return 1;
    return a.targetId.localeCompare(b.targetId);
  });
  return eligible;
}

/**
 * Human-readable label for an obligation target regardless of whether it still has a remaining
 * amount. Used for reversal previews and history, where fully settled obligations must stay visible.
 */
export function describeObligationTarget(
  executor: DbExecutor,
  stallId: string,
  obligationKind: ObligationKind,
  targetId: string,
): string | null {
  switch (obligationKind) {
    case "trader_bill": {
      const row = executor.db
        .prepare(`SELECT bill_number FROM trader_bills WHERE id = ? AND stall_id = ?`)
        .get(targetId, stallId) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return `Buyer bill ${optionalString(row["bill_number"], "bill_number") ?? targetId}`;
    }
    case "farmer_sale_line": {
      const row = executor.db
        .prepare(
          `SELECT fb.bill_number AS farmer_bill_number
           FROM sale_lines sl
           LEFT JOIN farmer_bill_lines fbl ON fbl.sale_line_id = sl.id AND fbl.stall_id = sl.stall_id
           LEFT JOIN farmer_bills fb ON fb.id = fbl.farmer_bill_id AND fb.stall_id = fbl.stall_id
           WHERE sl.id = ? AND sl.stall_id = ?`,
        )
        .get(targetId, stallId) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      const farmerBillNumber = optionalString(row["farmer_bill_number"], "farmer_bill_number");
      return farmerBillNumber !== null
        ? `Sale line on bill ${farmerBillNumber}`
        : "Unbilled sale line";
    }
    case "opening_balance": {
      const row = executor.db
        .prepare(`SELECT reference FROM opening_balance_drafts WHERE id = ? AND stall_id = ?`)
        .get(targetId, stallId) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      const reference = optionalString(row["reference"], "reference");
      return reference !== null ? `Opening balance ${reference}` : "Opening balance";
    }
    default: {
      const _exhaustive: never = obligationKind;
      throw new RepositoryError(`Unknown obligation kind: ${_exhaustive}`);
    }
  }
}

export function computeTraderBillSettlement(
  executor: DbExecutor,
  stallId: string,
  traderBillId: string,
): BillSettlementSummary | null {
  const bill = getTraderBillById(executor, stallId, traderBillId);
  if (bill === null) {
    return null;
  }
  const activeAllocatedMinor = sumActiveAllocatedForObligation(
    executor,
    stallId,
    "trader_bill",
    traderBillId,
  );
  const remainder = buildObligationRemainder({
    obligationKind: "trader_bill",
    targetId: traderBillId,
    effectiveAmountMinor: bill.totalAmountMinor,
    activeAllocatedMinor,
  });
  return aggregateBillSettlement({
    originalTotalMinor: bill.totalAmountMinor,
    obligationRemainders: [remainder],
  });
}

export function computeFarmerBillSettlement(
  executor: DbExecutor,
  stallId: string,
  farmerBillId: string,
): BillSettlementSummary | null {
  const bill = getFarmerBillById(executor, stallId, farmerBillId);
  if (bill === null) {
    return null;
  }
  const remainders = bill.lines.map((line) => {
    const activeAllocatedMinor = sumActiveAllocatedForObligation(
      executor,
      stallId,
      "farmer_sale_line",
      line.saleLineId,
    );
    return buildObligationRemainder({
      obligationKind: "farmer_sale_line",
      targetId: line.saleLineId,
      effectiveAmountMinor: line.farmerReceivesMinor,
      activeAllocatedMinor,
    });
  });
  return aggregateBillSettlement({
    originalTotalMinor: bill.totalAmountMinor,
    obligationRemainders: remainders,
  });
}

export function updateTraderBillPaymentStatus(
  executor: DbExecutor,
  stallId: string,
  traderBillId: string,
  updatedAt: string,
): BillSettlementSummary | null {
  const settlement = computeTraderBillSettlement(executor, stallId, traderBillId);
  if (settlement === null) {
    return null;
  }
  const result = executor.db
    .prepare(
      `UPDATE trader_bills
       SET payment_status = ?, updated_at = ?
       WHERE id = ? AND stall_id = ? AND status = 'finalized'`,
    )
    .run(settlement.paymentStatus, updatedAt, traderBillId, stallId);
  if (result.changes !== 1) {
    throw new RepositoryError("Trader bill payment status could not be updated.");
  }
  return settlement;
}

export function updateFarmerBillPaymentStatus(
  executor: DbExecutor,
  stallId: string,
  farmerBillId: string,
  updatedAt: string,
): BillSettlementSummary | null {
  const settlement = computeFarmerBillSettlement(executor, stallId, farmerBillId);
  if (settlement === null) {
    return null;
  }
  const result = executor.db
    .prepare(
      `UPDATE farmer_bills
       SET payment_status = ?, updated_at = ?
       WHERE id = ? AND stall_id = ? AND status = 'finalized'`,
    )
    .run(settlement.paymentStatus, updatedAt, farmerBillId, stallId);
  if (result.changes !== 1) {
    throw new RepositoryError("Farmer bill payment status could not be updated.");
  }
  return settlement;
}
