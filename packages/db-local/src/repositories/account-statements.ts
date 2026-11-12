import { moneyMinorFromSqliteInteger } from "../numeric.js";
import {
  optionalAbsoluteTimestamp,
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireString,
} from "../mapping/errors.js";
import type { LedgerPartyKind } from "../mapping/records.js";
import { RepositoryError, type DbExecutor } from "./types.js";

export type ReportingWatermarks = {
  maxPostingSequence: number;
  maxAllocationCreatedAt: string;
  maxAllocationId: string;
  maxPaymentRecordedAt: string;
  maxPaymentId: string;
};

export type StatementMovementRow = {
  entryId: string;
  postingId: string;
  businessDate: string;
  recordedAt: string;
  postingSequence: number;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  description: string | null;
  amountMinor: number;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
};

export type ListStatementMovementsInput = {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  maxPostingSequence: number;
  limit: number;
  afterBusinessDate?: string;
  afterPostingSequence?: number;
  afterEntryId?: string;
  /** Optional display filter — totals must still use unfiltered period sums. */
  movementSearch?: string;
  sourceTypeFilter?: string;
};

export type ListStatementMovementsResult = {
  precedingBalanceMinor: number;
  items: StatementMovementRow[];
  hasMore: boolean;
};

export type HistoricalAllocationRow = {
  id: string;
  paymentId: string;
  obligationKind: "trader_bill" | "farmer_sale_line" | "opening_balance";
  targetId: string;
  appliedAmountMinor: number;
  status: "active" | "reversed";
  createdAt: string;
  releasedAt: string | null;
  legacyReleaseRecordedAt: string | null;
  paymentBusinessDate: string;
  paymentRecordedAt: string;
  paymentStatus: "posted" | "reversed";
  reversesPaymentId: string | null;
};

export type UnappliedPaymentRow = {
  paymentId: string;
  referenceNumber: string;
  businessDate: string;
  amountMinor: number;
  allocatedActiveMinor: number;
  unappliedAmountMinor: number;
  method: "cash" | "bank_transfer" | "cheque";
  physicalHandoverDate: string | null;
  chequeNumber: string | null;
  recordedAt: string;
};

const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Capture reporting watermarks in a short read. Call inside a transaction when
 * pairing with statement/outstanding queries for consistent single-response reads.
 */
export function captureReportingWatermarks(
  executor: DbExecutor,
  stallId: string,
): ReportingWatermarks {
  const sequenceRow = executor.db
    .prepare(
      `SELECT COALESCE(MAX(posting_sequence), 0) AS max_seq
       FROM ledger_entries
       WHERE stall_id = ?`,
    )
    .get(stallId) as { max_seq: number | bigint };

  const allocRow = executor.db
    .prepare(
      `SELECT created_at, id
       FROM payment_allocations
       WHERE stall_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(stallId) as { created_at: string; id: string } | undefined;

  const paymentRow = executor.db
    .prepare(
      `SELECT recorded_at, id
       FROM payments
       WHERE stall_id = ?
       ORDER BY recorded_at DESC, id DESC
       LIMIT 1`,
    )
    .get(stallId) as { recorded_at: string; id: string } | undefined;

  return {
    maxPostingSequence:
      typeof sequenceRow.max_seq === "bigint"
        ? Number(sequenceRow.max_seq)
        : Number(sequenceRow.max_seq),
    maxAllocationCreatedAt: allocRow?.created_at ?? EPOCH,
    maxAllocationId: allocRow?.id ?? "",
    maxPaymentRecordedAt: paymentRow?.recorded_at ?? EPOCH,
    maxPaymentId: paymentRow?.id ?? "",
  };
}

/** Sum of signed ledger amounts with business_date < fromDate and sequence ≤ watermark. */
export function sumStatementOpeningBalanceMinor(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  fromBusinessDate: string,
  maxPostingSequence: number,
): number {
  const row = executor.db
    .prepare(
      `SELECT COALESCE(SUM(e.amount_minor), 0) AS balance_minor
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND e.posting_sequence <= ?
         AND p.business_date < ?`,
    )
    .get(stallId, partyKind, partyId, maxPostingSequence, fromBusinessDate) as {
    balance_minor: number | bigint;
  };
  return typeof row.balance_minor === "bigint" ? Number(row.balance_minor) : Number(row.balance_minor);
}

/** All period movement amounts (unfiltered) for totals — bounded by watermark. */
export function listStatementPeriodAmounts(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  fromBusinessDate: string,
  toBusinessDate: string,
  maxPostingSequence: number,
): number[] {
  const rows = executor.db
    .prepare(
      `SELECT e.amount_minor
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND e.posting_sequence <= ?
         AND p.business_date >= ? AND p.business_date <= ?
       ORDER BY p.business_date ASC, e.posting_sequence ASC, e.id ASC`,
    )
    .all(stallId, partyKind, partyId, maxPostingSequence, fromBusinessDate, toBusinessDate) as Array<{
    amount_minor: number | bigint;
  }>;
  return rows.map((row) => moneyMinorFromSqliteInteger(row.amount_minor));
}

export function countStatementPeriodMovements(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  fromBusinessDate: string,
  toBusinessDate: string,
  maxPostingSequence: number,
): number {
  const row = executor.db
    .prepare(
      `SELECT COUNT(*) AS movement_count
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND e.posting_sequence <= ?
         AND p.business_date >= ? AND p.business_date <= ?`,
    )
    .get(stallId, partyKind, partyId, maxPostingSequence, fromBusinessDate, toBusinessDate) as {
    movement_count: number | bigint;
  };
  return typeof row.movement_count === "bigint"
    ? Number(row.movement_count)
    : Number(row.movement_count);
}

/**
 * Balance immediately before the current page = opening + sum of period rows
 * strictly before the page cursor (by business_date, posting_sequence, entry id).
 */
export function sumBalanceBeforeStatementPage(
  executor: DbExecutor,
  input: {
    stallId: string;
    partyKind: LedgerPartyKind;
    partyId: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    maxPostingSequence: number;
    openingBalanceMinor: number;
    afterBusinessDate?: string;
    afterPostingSequence?: number;
    afterEntryId?: string;
  },
): number {
  if (
    input.afterBusinessDate === undefined ||
    input.afterPostingSequence === undefined ||
    input.afterEntryId === undefined
  ) {
    return input.openingBalanceMinor;
  }

  const row = executor.db
    .prepare(
      `SELECT COALESCE(SUM(e.amount_minor), 0) AS balance_minor
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND e.posting_sequence <= ?
         AND p.business_date >= ? AND p.business_date <= ?
         AND (
           p.business_date < ?
           OR (p.business_date = ? AND e.posting_sequence < ?)
           OR (p.business_date = ? AND e.posting_sequence = ? AND e.id <= ?)
         )`,
    )
    .get(
      input.stallId,
      input.partyKind,
      input.partyId,
      input.maxPostingSequence,
      input.fromBusinessDate,
      input.toBusinessDate,
      input.afterBusinessDate,
      input.afterBusinessDate,
      input.afterPostingSequence,
      input.afterBusinessDate,
      input.afterPostingSequence,
      input.afterEntryId,
    ) as { balance_minor: number | bigint };

  const beforePage =
    typeof row.balance_minor === "bigint" ? Number(row.balance_minor) : Number(row.balance_minor);
  return input.openingBalanceMinor + beforePage;
}

export function listStatementMovementsPage(
  executor: DbExecutor,
  input: ListStatementMovementsInput,
): ListStatementMovementsResult {
  const params: Array<string | number> = [
    input.stallId,
    input.partyKind,
    input.partyId,
    input.maxPostingSequence,
    input.fromBusinessDate,
    input.toBusinessDate,
  ];

  let cursorClause = "";
  if (
    input.afterBusinessDate !== undefined &&
    input.afterPostingSequence !== undefined &&
    input.afterEntryId !== undefined
  ) {
    cursorClause = `AND (
      p.business_date > ?
      OR (p.business_date = ? AND e.posting_sequence > ?)
      OR (p.business_date = ? AND e.posting_sequence = ? AND e.id > ?)
    )`;
    params.push(
      input.afterBusinessDate,
      input.afterBusinessDate,
      input.afterPostingSequence,
      input.afterBusinessDate,
      input.afterPostingSequence,
      input.afterEntryId,
    );
  }

  let filterClause = "";
  if (input.sourceTypeFilter !== undefined && input.sourceTypeFilter.length > 0) {
    filterClause += " AND p.source_type = ?";
    params.push(input.sourceTypeFilter);
  }
  if (input.movementSearch !== undefined && input.movementSearch.length > 0) {
    filterClause +=
      " AND (IFNULL(p.description, '') LIKE ? OR p.source_id LIKE ? OR p.source_type LIKE ?)";
    const like = `%${input.movementSearch.replaceAll("%", "").replaceAll("_", "")}%`;
    params.push(like, like, like);
  }

  const limit = input.limit + 1;
  params.push(limit);

  const rows = executor.db
    .prepare(
      `SELECT e.id, e.stall_id, e.posting_id, e.amount_minor, e.posting_sequence, e.reverses_entry_id,
              p.business_date, p.recorded_at, p.source_type, p.source_id, p.financial_event_type,
              p.description,
              rev.id AS reversed_by_entry_id
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       LEFT JOIN ledger_entries rev
         ON rev.reverses_entry_id = e.id AND rev.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND e.posting_sequence <= ?
         AND p.business_date >= ? AND p.business_date <= ?
         ${cursorClause}
         ${filterClause}
       ORDER BY p.business_date ASC, e.posting_sequence ASC, e.id ASC
       LIMIT ?`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const items = pageRows.map(mapStatementMovementRow);

  const opening = sumStatementOpeningBalanceMinor(
    executor,
    input.stallId,
    input.partyKind,
    input.partyId,
    input.fromBusinessDate,
    input.maxPostingSequence,
  );
  const precedingBalanceMinor = sumBalanceBeforeStatementPage(executor, {
    stallId: input.stallId,
    partyKind: input.partyKind,
    partyId: input.partyId,
    fromBusinessDate: input.fromBusinessDate,
    toBusinessDate: input.toBusinessDate,
    maxPostingSequence: input.maxPostingSequence,
    openingBalanceMinor: opening,
    afterBusinessDate: input.afterBusinessDate,
    afterPostingSequence: input.afterPostingSequence,
    afterEntryId: input.afterEntryId,
  });

  return { precedingBalanceMinor, items, hasMore };
}

/**
 * Account balance at watermark (all sequences ≤ max), optional business-date upper bound.
 */
export function sumAccountBalanceAtWatermark(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  maxPostingSequence: number,
  asOfBusinessDate?: string,
): number {
  const row =
    asOfBusinessDate === undefined
      ? (executor.db
          .prepare(
            `SELECT COALESCE(SUM(amount_minor), 0) AS balance_minor
             FROM ledger_entries
             WHERE stall_id = ? AND party_kind = ? AND party_id = ?
               AND posting_sequence <= ?`,
          )
          .get(stallId, partyKind, partyId, maxPostingSequence) as {
          balance_minor: number | bigint;
        })
      : (executor.db
          .prepare(
            `SELECT COALESCE(SUM(e.amount_minor), 0) AS balance_minor
             FROM ledger_entries e
             INNER JOIN ledger_postings p
               ON p.id = e.posting_id AND p.stall_id = e.stall_id
             WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
               AND e.posting_sequence <= ?
               AND p.business_date <= ?`,
          )
          .get(stallId, partyKind, partyId, maxPostingSequence, asOfBusinessDate) as {
          balance_minor: number | bigint;
        });
  return typeof row.balance_minor === "bigint" ? Number(row.balance_minor) : Number(row.balance_minor);
}

/**
 * Allocations known at the snapshot watermark, with legacy release proxy from
 * the linked reversal payment when released_at is null.
 */
export function listAllocationsForHistoricalOutstanding(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  watermarks: ReportingWatermarks,
): HistoricalAllocationRow[] {
  const partyColumn = partyKind === "farmer" ? "p.farmer_id" : "p.trader_id";
  const rows = executor.db
    .prepare(
      `SELECT a.id, a.payment_id, a.obligation_kind, a.trader_bill_id, a.sale_line_id,
              a.opening_draft_id, a.applied_amount_minor, a.status, a.created_at, a.released_at,
              p.business_date AS payment_business_date, p.recorded_at AS payment_recorded_at,
              p.status AS payment_status, p.reverses_payment_id,
              rev.recorded_at AS reversal_recorded_at
       FROM payment_allocations a
       INNER JOIN payments p
         ON p.id = a.payment_id AND p.stall_id = a.stall_id
       LEFT JOIN payments rev
         ON rev.id = p.reversed_by_payment_id AND rev.stall_id = p.stall_id
       WHERE a.stall_id = ?
         AND ${partyColumn} = ?
         AND (
           a.created_at < ?
           OR (a.created_at = ? AND a.id <= ?)
         )
       ORDER BY a.created_at ASC, a.id ASC`,
    )
    .all(
      stallId,
      partyId,
      watermarks.maxAllocationCreatedAt,
      watermarks.maxAllocationCreatedAt,
      watermarks.maxAllocationId === "" ? "\uFFFF" : watermarks.maxAllocationId,
    ) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const obligationKind = requireString(row["obligation_kind"], "obligation_kind");
    if (
      obligationKind !== "trader_bill" &&
      obligationKind !== "farmer_sale_line" &&
      obligationKind !== "opening_balance"
    ) {
      throw new RepositoryError(`Unexpected obligation kind: ${obligationKind}`);
    }
    const status = requireString(row["status"], "status");
    if (status !== "active" && status !== "reversed") {
      throw new RepositoryError(`Unexpected allocation status: ${status}`);
    }
    const paymentStatus = requireString(row["payment_status"], "payment_status");
    if (paymentStatus !== "posted" && paymentStatus !== "reversed") {
      throw new RepositoryError(`Unexpected payment status: ${paymentStatus}`);
    }
    const targetId =
      obligationKind === "trader_bill"
        ? requireString(row["trader_bill_id"], "trader_bill_id")
        : obligationKind === "farmer_sale_line"
          ? requireString(row["sale_line_id"], "sale_line_id")
          : requireString(row["opening_draft_id"], "opening_draft_id");
    const releasedAt = optionalAbsoluteTimestamp(row["released_at"], "released_at");
    const reversalRecordedAt = optionalAbsoluteTimestamp(
      row["reversal_recorded_at"],
      "reversal_recorded_at",
    );
    return {
      id: requireString(row["id"], "id"),
      paymentId: requireString(row["payment_id"], "payment_id"),
      obligationKind,
      targetId,
      appliedAmountMinor: moneyMinorFromSqliteInteger(row["applied_amount_minor"]),
      status,
      createdAt: requireAbsoluteTimestamp(row["created_at"], "created_at"),
      releasedAt,
      legacyReleaseRecordedAt: releasedAt === null ? reversalRecordedAt : null,
      paymentBusinessDate: requireCalendarDate(row["payment_business_date"], "payment_business_date"),
      paymentRecordedAt: requireAbsoluteTimestamp(row["payment_recorded_at"], "payment_recorded_at"),
      paymentStatus,
      reversesPaymentId: optionalString(row["reverses_payment_id"], "reverses_payment_id"),
    };
  });
}

export function listUnappliedPaymentsAtWatermark(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  watermarks: ReportingWatermarks,
  asOfBusinessDate?: string,
): UnappliedPaymentRow[] {
  const partyColumn = partyKind === "farmer" ? "farmer_id" : "trader_id";
  const params: Array<string | number> = [
    stallId,
    partyId,
    watermarks.maxPaymentRecordedAt,
    watermarks.maxPaymentRecordedAt,
    watermarks.maxPaymentId === "" ? "\uFFFF" : watermarks.maxPaymentId,
  ];
  let asOfClause = "";
  if (asOfBusinessDate !== undefined) {
    asOfClause = " AND business_date <= ?";
    params.push(asOfBusinessDate);
  }

  const rows = executor.db
    .prepare(
      `SELECT id, reference_number, business_date, amount_minor, method, physical_handover_date,
              cheque_number, recorded_at
       FROM payments
       WHERE stall_id = ?
         AND ${partyColumn} = ?
         AND status = 'posted'
         AND reverses_payment_id IS NULL
         AND reversed_by_payment_id IS NULL
         AND (
           recorded_at < ?
           OR (recorded_at = ? AND id <= ?)
         )
         ${asOfClause}
       ORDER BY business_date ASC, recorded_at ASC, id ASC`,
    )
    .all(...params) as Array<Record<string, unknown>>;

  const result: UnappliedPaymentRow[] = [];
  for (const row of rows) {
    const paymentId = requireString(row["id"], "id");
    const amountMinor = moneyMinorFromSqliteInteger(row["amount_minor"]);
    const allocatedRow = executor.db
      .prepare(
        `SELECT COALESCE(SUM(applied_amount_minor), 0) AS allocated_minor
         FROM payment_allocations
         WHERE stall_id = ? AND payment_id = ? AND status = 'active'
           AND (
             created_at < ?
             OR (created_at = ? AND id <= ?)
           )`,
      )
      .get(
        stallId,
        paymentId,
        watermarks.maxAllocationCreatedAt,
        watermarks.maxAllocationCreatedAt,
        watermarks.maxAllocationId === "" ? "\uFFFF" : watermarks.maxAllocationId,
      ) as { allocated_minor: number | bigint };
    const allocatedActiveMinor =
      typeof allocatedRow.allocated_minor === "bigint"
        ? Number(allocatedRow.allocated_minor)
        : Number(allocatedRow.allocated_minor);
    const unappliedAmountMinor = amountMinor - allocatedActiveMinor;
    if (unappliedAmountMinor <= 0) {
      continue;
    }
    const method = requireString(row["method"], "method");
    if (method !== "cash" && method !== "bank_transfer" && method !== "cheque") {
      throw new RepositoryError(`Unexpected payment method: ${method}`);
    }
    result.push({
      paymentId,
      referenceNumber: requireString(row["reference_number"], "reference_number"),
      businessDate: requireCalendarDate(row["business_date"], "business_date"),
      amountMinor,
      allocatedActiveMinor,
      unappliedAmountMinor,
      method,
      physicalHandoverDate: optionalString(row["physical_handover_date"], "physical_handover_date"),
      chequeNumber: optionalString(row["cheque_number"], "cheque_number"),
      recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    });
  }
  return result;
}

function mapStatementMovementRow(row: Record<string, unknown>): StatementMovementRow {
  return {
    entryId: requireString(row["id"], "ledger_entries.id"),
    postingId: requireString(row["posting_id"], "posting_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    postingSequence: Number(row["posting_sequence"]),
    sourceType: requireString(row["source_type"], "source_type"),
    sourceId: requireString(row["source_id"], "source_id"),
    financialEventType: requireString(row["financial_event_type"], "financial_event_type"),
    description: optionalString(row["description"], "description"),
    amountMinor: moneyMinorFromSqliteInteger(row["amount_minor"]),
    reversesEntryId: optionalString(row["reverses_entry_id"], "reverses_entry_id"),
    reversedByEntryId: optionalString(row["reversed_by_entry_id"], "reversed_by_entry_id"),
  };
}
