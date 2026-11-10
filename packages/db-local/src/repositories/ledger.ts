import {
  mapLedgerEntryRow,
  mapLedgerPostingRow,
  mapOpeningBalanceDraftRow,
  mapPartyAccountRow,
  type LedgerEntryRecord,
  type LedgerPartyKind,
  type LedgerPostingRecord,
  type OpeningBalanceDirection,
  type OpeningBalanceDraftRecord,
  type PartyAccountOpeningStatus,
  type PartyAccountRecord,
} from "../mapping/records.js";
import { moneyMinorToSqliteInteger } from "../numeric.js";
import { classifySqliteError } from "../sqlite-errors.js";
import { RepositoryError, RevisionConflictError, type DbExecutor } from "./types.js";

const ACCOUNT_SELECT = `id, stall_id, party_kind, party_id, currency, opening_status,
  opening_cutoff_date, opening_completed_at, opening_completed_by_staff_id,
  opening_draft_id, opening_posting_id, created_at, updated_at`;

const POSTING_SELECT = `id, stall_id, source_type, source_id, financial_event_type, event_sequence,
  business_date, recorded_at, actor_staff_id, description, currency`;

const ENTRY_SELECT = `id, stall_id, posting_id, party_kind, party_id, amount_minor, currency,
  posting_sequence, reverses_entry_id`;

const DRAFT_SELECT = `id, stall_id, party_kind, party_id, direction, amount_minor, signed_amount_minor,
  cutoff_date, currency, reference, explanation, status, revision, created_at, updated_at,
  created_by_staff_id, posted_posting_id`;

export class DuplicateFinancialEventError extends RepositoryError {
  constructor(message = "A posting for this financial event already exists.") {
    super(message);
    this.name = "DuplicateFinancialEventError";
  }
}

export class LedgerImmutabilityError extends RepositoryError {
  constructor(message = "Posted ledger records are immutable.") {
    super(message);
    this.name = "LedgerImmutabilityError";
  }
}

export function getPartyAccount(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): PartyAccountRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${ACCOUNT_SELECT}
       FROM party_accounts
       WHERE stall_id = ? AND party_kind = ? AND party_id = ?`,
    )
    .get(stallId, partyKind, partyId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPartyAccountRow(row);
}

export function getPartyAccountById(
  executor: DbExecutor,
  stallId: string,
  accountId: string,
): PartyAccountRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${ACCOUNT_SELECT}
       FROM party_accounts
       WHERE id = ? AND stall_id = ?`,
    )
    .get(accountId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPartyAccountRow(row);
}

export type EnsurePartyAccountInput = {
  id: string;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  createdAt: string;
  updatedAt: string;
};

export function ensurePartyAccount(
  executor: DbExecutor,
  input: EnsurePartyAccountInput,
): PartyAccountRecord {
  const existing = getPartyAccount(executor, input.stallId, input.partyKind, input.partyId);
  if (existing !== null) {
    return existing;
  }
  try {
    executor.db
      .prepare(
        `INSERT INTO party_accounts (
           id, stall_id, party_kind, party_id, currency, opening_status,
           opening_cutoff_date, opening_completed_at, opening_completed_by_staff_id,
           opening_draft_id, opening_posting_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'LKR', 'not_opened', NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        input.id,
        input.stallId,
        input.partyKind,
        input.partyId,
        input.createdAt,
        input.updatedAt,
      );
  } catch (error) {
    const classified = classifySqliteError(error);
    if (classified.kind === "unique_constraint") {
      const raced = getPartyAccount(executor, input.stallId, input.partyKind, input.partyId);
      if (raced !== null) {
        return raced;
      }
    }
    throw error;
  }
  const created = getPartyAccount(executor, input.stallId, input.partyKind, input.partyId);
  if (created === null) {
    throw new RepositoryError("Party account insert did not persist.");
  }
  return created;
}

export type MarkOpeningCompleteInput = {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  openingStatus: Extract<PartyAccountOpeningStatus, "opened" | "opened_zero">;
  cutoffDate: string;
  completedAt: string;
  completedByStaffId: string | null;
  draftId: string;
  postingId: string | null;
  updatedAt: string;
};

export function markPartyAccountOpeningComplete(
  executor: DbExecutor,
  input: MarkOpeningCompleteInput,
): PartyAccountRecord {
  const result = executor.db
    .prepare(
      `UPDATE party_accounts
       SET opening_status = ?,
           opening_cutoff_date = ?,
           opening_completed_at = ?,
           opening_completed_by_staff_id = ?,
           opening_draft_id = ?,
           opening_posting_id = ?,
           updated_at = ?
       WHERE stall_id = ? AND party_kind = ? AND party_id = ?
         AND opening_status = 'not_opened'`,
    )
    .run(
      input.openingStatus,
      input.cutoffDate,
      input.completedAt,
      input.completedByStaffId,
      input.draftId,
      input.postingId,
      input.updatedAt,
      input.stallId,
      input.partyKind,
      input.partyId,
    );
  if (result.changes !== 1) {
    throw new RevisionConflictError("Opening was already completed for this account.");
  }
  const updated = getPartyAccount(executor, input.stallId, input.partyKind, input.partyId);
  if (updated === null) {
    throw new RepositoryError("Party account missing after opening completion.");
  }
  return updated;
}

export function getOpeningDraftById(
  executor: DbExecutor,
  stallId: string,
  draftId: string,
): OpeningBalanceDraftRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${DRAFT_SELECT}
       FROM opening_balance_drafts
       WHERE id = ? AND stall_id = ?`,
    )
    .get(draftId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapOpeningBalanceDraftRow(row);
}

export function getActiveOpeningDraft(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): OpeningBalanceDraftRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${DRAFT_SELECT}
       FROM opening_balance_drafts
       WHERE stall_id = ? AND party_kind = ? AND party_id = ? AND status = 'draft'`,
    )
    .get(stallId, partyKind, partyId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapOpeningBalanceDraftRow(row);
}

export type InsertOpeningDraftInput = {
  id: string;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  direction: OpeningBalanceDirection;
  amountMinor: number;
  signedAmountMinor: number | null;
  cutoffDate: string;
  reference: string | null;
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
  createdByStaffId: string | null;
};

export function insertOpeningDraft(
  executor: DbExecutor,
  input: InsertOpeningDraftInput,
): OpeningBalanceDraftRecord {
  try {
    executor.db
      .prepare(
        `INSERT INTO opening_balance_drafts (
           id, stall_id, party_kind, party_id, direction, amount_minor, signed_amount_minor,
           cutoff_date, currency, reference, explanation, status, revision,
           created_at, updated_at, created_by_staff_id, posted_posting_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'LKR', ?, ?, 'draft', 1, ?, ?, ?, NULL)`,
      )
      .run(
        input.id,
        input.stallId,
        input.partyKind,
        input.partyId,
        input.direction,
        moneyMinorToSqliteInteger(input.amountMinor),
        input.signedAmountMinor === null
          ? null
          : moneyMinorToSqliteInteger(input.signedAmountMinor),
        input.cutoffDate,
        input.reference,
        input.explanation,
        input.createdAt,
        input.updatedAt,
        input.createdByStaffId,
      );
  } catch (error) {
    const classified = classifySqliteError(error);
    if (classified.kind === "unique_constraint") {
      throw new RevisionConflictError("An active opening draft already exists for this account.");
    }
    throw error;
  }
  const created = getOpeningDraftById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Opening draft insert did not persist.");
  }
  return created;
}

export type UpdateOpeningDraftInput = {
  stallId: string;
  draftId: string;
  expectedRevision: number;
  direction: OpeningBalanceDirection;
  amountMinor: number;
  signedAmountMinor: number | null;
  cutoffDate: string;
  reference: string | null;
  explanation: string | null;
  updatedAt: string;
};

export function updateOpeningDraftWithExpectedRevision(
  executor: DbExecutor,
  input: UpdateOpeningDraftInput,
): OpeningBalanceDraftRecord {
  const result = executor.db
    .prepare(
      `UPDATE opening_balance_drafts
       SET direction = ?,
           amount_minor = ?,
           signed_amount_minor = ?,
           cutoff_date = ?,
           reference = ?,
           explanation = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND status = 'draft' AND revision = ?`,
    )
    .run(
      input.direction,
      moneyMinorToSqliteInteger(input.amountMinor),
      input.signedAmountMinor === null ? null : moneyMinorToSqliteInteger(input.signedAmountMinor),
      input.cutoffDate,
      input.reference,
      input.explanation,
      input.updatedAt,
      input.draftId,
      input.stallId,
      input.expectedRevision,
    );
  if (result.changes !== 1) {
    throw new RevisionConflictError("Opening draft revision conflict or draft is not editable.");
  }
  const updated = getOpeningDraftById(executor, input.stallId, input.draftId);
  if (updated === null) {
    throw new RepositoryError("Opening draft missing after update.");
  }
  return updated;
}

export function markOpeningDraftPosted(
  executor: DbExecutor,
  input: {
    stallId: string;
    draftId: string;
    expectedRevision: number;
    postingId: string | null;
    updatedAt: string;
  },
): OpeningBalanceDraftRecord {
  const result = executor.db
    .prepare(
      `UPDATE opening_balance_drafts
       SET status = 'posted',
           posted_posting_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND status = 'draft' AND revision = ?`,
    )
    .run(
      input.postingId,
      input.updatedAt,
      input.draftId,
      input.stallId,
      input.expectedRevision,
    );
  if (result.changes !== 1) {
    throw new RevisionConflictError("Opening draft could not be posted (stale revision or status).");
  }
  const updated = getOpeningDraftById(executor, input.stallId, input.draftId);
  if (updated === null) {
    throw new RepositoryError("Opening draft missing after post.");
  }
  return updated;
}

export type PostLedgerEntryInput = {
  entryId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  amountMinor: number;
  reversesEntryId?: string | null;
};

export type PostLedgerEntriesInput = {
  postingId: string;
  stallId: string;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  eventSequence: number;
  businessDate: string;
  recordedAt: string;
  actorStaffId: string | null;
  description: string | null;
  currency: "LKR";
  entries: readonly PostLedgerEntryInput[];
};

export type PostLedgerEntriesResult = {
  posting: LedgerPostingRecord;
  entries: LedgerEntryRecord[];
};

function nextPostingSequence(executor: DbExecutor, stallId: string): number {
  const row = executor.db
    .prepare(
      `SELECT COALESCE(MAX(posting_sequence), 0) AS max_seq
       FROM ledger_entries
       WHERE stall_id = ?`,
    )
    .get(stallId) as { max_seq: number | bigint };
  const max =
    typeof row.max_seq === "bigint" ? Number(row.max_seq) : Number(row.max_seq ?? 0);
  return max + 1;
}

/**
 * Persist an immutable posting + entry lines inside an open transaction.
 * Callers must not commit ledger effects outside the source business operation.
 */
export function postLedgerEntries(
  executor: DbExecutor,
  input: PostLedgerEntriesInput,
): PostLedgerEntriesResult {
  if (input.currency !== "LKR") {
    throw new RepositoryError("Only LKR is supported for ledger postings.");
  }
  if (input.entries.length === 0) {
    throw new RepositoryError("A posting must include at least one entry.");
  }
  for (const entry of input.entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor === 0) {
      throw new RepositoryError("Ledger entry amounts must be non-zero safe integers.");
    }
  }

  try {
    executor.db
      .prepare(
        `INSERT INTO ledger_postings (
           id, stall_id, source_type, source_id, financial_event_type, event_sequence,
           business_date, recorded_at, actor_staff_id, description, currency
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.postingId,
        input.stallId,
        input.sourceType,
        input.sourceId,
        input.financialEventType,
        input.eventSequence,
        input.businessDate,
        input.recordedAt,
        input.actorStaffId,
        input.description,
        input.currency,
      );
  } catch (error) {
    const classified = classifySqliteError(error);
    if (classified.kind === "unique_constraint") {
      throw new DuplicateFinancialEventError();
    }
    throw error;
  }

  let sequence = nextPostingSequence(executor, input.stallId);
  const createdEntries: LedgerEntryRecord[] = [];
  for (const entry of input.entries) {
    try {
      executor.db
        .prepare(
          `INSERT INTO ledger_entries (
             id, stall_id, posting_id, party_kind, party_id, amount_minor, currency,
             posting_sequence, reverses_entry_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.entryId,
          input.stallId,
          input.postingId,
          entry.partyKind,
          entry.partyId,
          moneyMinorToSqliteInteger(entry.amountMinor),
          input.currency,
          sequence,
          entry.reversesEntryId ?? null,
        );
    } catch (error) {
      const classified = classifySqliteError(error);
      if (classified.kind === "unique_constraint") {
        throw new DuplicateFinancialEventError("Reversal or sequence uniqueness violated.");
      }
      throw error;
    }
    const persisted = getLedgerEntryById(executor, input.stallId, entry.entryId);
    if (persisted === null) {
      throw new RepositoryError("Ledger entry insert did not persist.");
    }
    createdEntries.push(persisted);
    sequence += 1;
  }

  const posting = getLedgerPostingById(executor, input.stallId, input.postingId);
  if (posting === null) {
    throw new RepositoryError("Ledger posting insert did not persist.");
  }
  return { posting, entries: createdEntries };
}

export function getLedgerPostingById(
  executor: DbExecutor,
  stallId: string,
  postingId: string,
): LedgerPostingRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${POSTING_SELECT}
       FROM ledger_postings
       WHERE id = ? AND stall_id = ?`,
    )
    .get(postingId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapLedgerPostingRow(row);
}

export function getLedgerEntryById(
  executor: DbExecutor,
  stallId: string,
  entryId: string,
): LedgerEntryRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${ENTRY_SELECT}
       FROM ledger_entries
       WHERE id = ? AND stall_id = ?`,
    )
    .get(entryId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapLedgerEntryRow(row);
}

export function listLedgerEntriesForPosting(
  executor: DbExecutor,
  stallId: string,
  postingId: string,
): LedgerEntryRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT ${ENTRY_SELECT}
       FROM ledger_entries
       WHERE stall_id = ? AND posting_id = ?
       ORDER BY posting_sequence ASC`,
    )
    .all(stallId, postingId) as Record<string, unknown>[];
  return rows.map((row) => mapLedgerEntryRow(row));
}

export function findPostingBySource(
  executor: DbExecutor,
  stallId: string,
  sourceType: string,
  sourceId: string,
  financialEventType: string,
  eventSequence: number,
): LedgerPostingRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${POSTING_SELECT}
       FROM ledger_postings
       WHERE stall_id = ?
         AND source_type = ?
         AND source_id = ?
         AND financial_event_type = ?
         AND event_sequence = ?`,
    )
    .get(stallId, sourceType, sourceId, financialEventType, eventSequence) as
    | Record<string, unknown>
    | undefined;
  if (row === undefined) {
    return null;
  }
  return mapLedgerPostingRow(row);
}

export function findReversalEntryFor(
  executor: DbExecutor,
  stallId: string,
  originalEntryId: string,
): LedgerEntryRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${ENTRY_SELECT}
       FROM ledger_entries
       WHERE stall_id = ? AND reverses_entry_id = ?`,
    )
    .get(stallId, originalEntryId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapLedgerEntryRow(row);
}

export function sumAccountBalanceMinor(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  asOfBusinessDate?: string,
): number {
  const row =
    asOfBusinessDate === undefined
      ? (executor.db
          .prepare(
            `SELECT COALESCE(SUM(e.amount_minor), 0) AS balance_minor
             FROM ledger_entries e
             WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?`,
          )
          .get(stallId, partyKind, partyId) as { balance_minor: number | bigint })
      : (executor.db
          .prepare(
            `SELECT COALESCE(SUM(e.amount_minor), 0) AS balance_minor
             FROM ledger_entries e
             INNER JOIN ledger_postings p
               ON p.id = e.posting_id AND p.stall_id = e.stall_id
             WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
               AND p.business_date <= ?`,
          )
          .get(stallId, partyKind, partyId, asOfBusinessDate) as {
          balance_minor: number | bigint;
        });
  const value =
    typeof row.balance_minor === "bigint" ? Number(row.balance_minor) : Number(row.balance_minor);
  if (!Number.isSafeInteger(value)) {
    throw new RepositoryError("Account balance exceeds safe integer range.");
  }
  return value;
}

export type AccountMovementRow = LedgerEntryRecord & {
  businessDate: string;
  recordedAt: string;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  description: string | null;
  reversedByEntryId: string | null;
};

export type ListAccountMovementsInput = {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  limit: number;
  /** Exclusive lower bound on posting_sequence for forward pages. */
  afterSequence?: number;
  asOfBusinessDate?: string;
};

export type ListAccountMovementsResult = {
  precedingBalanceMinor: number;
  items: AccountMovementRow[];
  nextCursorSequence: number | null;
};

export function listAccountMovements(
  executor: DbExecutor,
  input: ListAccountMovementsInput,
): ListAccountMovementsResult {
  const afterSequence = input.afterSequence ?? 0;
  const asOf = input.asOfBusinessDate;

  const precedingRow =
    asOf === undefined
      ? (executor.db
          .prepare(
            `SELECT COALESCE(SUM(amount_minor), 0) AS balance_minor
             FROM ledger_entries
             WHERE stall_id = ? AND party_kind = ? AND party_id = ?
               AND posting_sequence <= ?`,
          )
          .get(input.stallId, input.partyKind, input.partyId, afterSequence) as {
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
          .get(input.stallId, input.partyKind, input.partyId, afterSequence, asOf) as {
          balance_minor: number | bigint;
        });

  const precedingBalanceMinor =
    typeof precedingRow.balance_minor === "bigint"
      ? Number(precedingRow.balance_minor)
      : Number(precedingRow.balance_minor);

  const rows =
    asOf === undefined
      ? (executor.db
          .prepare(
            `SELECT e.id, e.stall_id, e.posting_id, e.party_kind, e.party_id, e.amount_minor,
                    e.currency, e.posting_sequence, e.reverses_entry_id,
                    p.business_date, p.recorded_at, p.source_type, p.source_id,
                    p.financial_event_type, p.description,
                    rev.id AS reversed_by_entry_id
             FROM ledger_entries e
             INNER JOIN ledger_postings p
               ON p.id = e.posting_id AND p.stall_id = e.stall_id
             LEFT JOIN ledger_entries rev
               ON rev.reverses_entry_id = e.id AND rev.stall_id = e.stall_id
             WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
               AND e.posting_sequence > ?
             ORDER BY e.posting_sequence ASC
             LIMIT ?`,
          )
          .all(
            input.stallId,
            input.partyKind,
            input.partyId,
            afterSequence,
            input.limit + 1,
          ) as Record<string, unknown>[])
      : (executor.db
          .prepare(
            `SELECT e.id, e.stall_id, e.posting_id, e.party_kind, e.party_id, e.amount_minor,
                    e.currency, e.posting_sequence, e.reverses_entry_id,
                    p.business_date, p.recorded_at, p.source_type, p.source_id,
                    p.financial_event_type, p.description,
                    rev.id AS reversed_by_entry_id
             FROM ledger_entries e
             INNER JOIN ledger_postings p
               ON p.id = e.posting_id AND p.stall_id = e.stall_id
             LEFT JOIN ledger_entries rev
               ON rev.reverses_entry_id = e.id AND rev.stall_id = e.stall_id
             WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
               AND e.posting_sequence > ?
               AND p.business_date <= ?
             ORDER BY e.posting_sequence ASC
             LIMIT ?`,
          )
          .all(
            input.stallId,
            input.partyKind,
            input.partyId,
            afterSequence,
            asOf,
            input.limit + 1,
          ) as Record<string, unknown>[]);

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const items: AccountMovementRow[] = pageRows.map((row) => {
    const entry = mapLedgerEntryRow(row);
    return {
      ...entry,
      businessDate: String(row["business_date"]),
      recordedAt: String(row["recorded_at"]),
      sourceType: String(row["source_type"]),
      sourceId: String(row["source_id"]),
      financialEventType: String(row["financial_event_type"]),
      description:
        row["description"] === null || row["description"] === undefined
          ? null
          : String(row["description"]),
      reversedByEntryId:
        row["reversed_by_entry_id"] === null || row["reversed_by_entry_id"] === undefined
          ? null
          : String(row["reversed_by_entry_id"]),
    };
  });

  return {
    precedingBalanceMinor,
    items,
    nextCursorSequence: hasMore ? (items[items.length - 1]?.postingSequence ?? null) : null,
  };
}

/** True when any non-opening posted ledger source exists for the account. */
export function accountHasOperationalLedgerPostings(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): boolean {
  const row = executor.db
    .prepare(
      `SELECT 1 AS present
       FROM ledger_entries e
       INNER JOIN ledger_postings p
         ON p.id = e.posting_id AND p.stall_id = e.stall_id
       WHERE e.stall_id = ? AND e.party_kind = ? AND e.party_id = ?
         AND p.source_type != 'opening_balance'
       LIMIT 1`,
    )
    .get(stallId, partyKind, partyId) as { present: number } | undefined;
  return row !== undefined;
}

/** Cutover safety: finalized bills or payments already reference the party. */
export function accountHasHistoricalOperationalActivity(
  executor: DbExecutor,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): boolean {
  if (partyKind === "farmer") {
    const bill = executor.db
      .prepare(
        `SELECT 1 AS present FROM farmer_bills
         WHERE stall_id = ? AND farmer_id = ? AND status = 'finalized'
         LIMIT 1`,
      )
      .get(stallId, partyId) as { present: number } | undefined;
    if (bill !== undefined) {
      return true;
    }
    const payment = executor.db
      .prepare(
        `SELECT 1 AS present FROM payments
         WHERE stall_id = ? AND party_kind = 'farmer' AND farmer_id = ?
         LIMIT 1`,
      )
      .get(stallId, partyId) as { present: number } | undefined;
    return payment !== undefined;
  }

  const bill = executor.db
    .prepare(
      `SELECT 1 AS present FROM trader_bills
       WHERE stall_id = ? AND trader_id = ? AND status = 'finalized'
       LIMIT 1`,
    )
    .get(stallId, partyId) as { present: number } | undefined;
  if (bill !== undefined) {
    return true;
  }
  const payment = executor.db
    .prepare(
      `SELECT 1 AS present FROM payments
       WHERE stall_id = ? AND party_kind = 'trader' AND trader_id = ?
       LIMIT 1`,
    )
    .get(stallId, partyId) as { present: number } | undefined;
  return payment !== undefined;
}

export function assertLedgerImmutable(
  executor: DbExecutor,
  stallId: string,
  postingId: string,
): void {
  try {
    executor.db
      .prepare(`UPDATE ledger_postings SET description = description WHERE id = ? AND stall_id = ?`)
      .run(postingId, stallId);
    throw new LedgerImmutabilityError("Expected immutability trigger to block posting updates.");
  } catch (error) {
    if (error instanceof LedgerImmutabilityError) {
      throw error;
    }
    // Trigger abort is success for this assertion helper when used in tests.
  }
}
