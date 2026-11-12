import { DomainError, type MoneyMinor } from "./money.js";
import {
  balanceDirectionLabel,
  balanceDisplayAmountMinor,
  type BalanceDirectionLabel,
  type LedgerPartyKind,
} from "./ledger.js";

/** Opaque statement view-model version consumed by later print/export phases. */
export const ACCOUNT_STATEMENT_VIEW_MODEL_VERSION = "1" as const;

/** Reporting snapshot TTL in milliseconds (30 minutes). */
export const STATEMENT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

export type StatementSnapshotWatermarks = {
  maxPostingSequence: number;
  maxAllocationCreatedAt: string;
  maxAllocationId: string;
  maxPaymentRecordedAt: string;
  maxPaymentId: string;
};

export type StatementSnapshotPayload = {
  v: 1;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  currency: "LKR";
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  purpose: "statement" | "outstanding" | "unapplied" | "summary" | "settlement";
  capturedAt: string;
  expiresAt: string;
  watermarks: StatementSnapshotWatermarks;
  /** Optional filter fingerprint bound into the token. */
  filterFingerprint: string | null;
};

export type StatementPeriodTotals = {
  openingBalanceMinor: MoneyMinor;
  periodIncreaseMinor: MoneyMinor;
  periodDecreaseMinor: MoneyMinor;
  periodNetMinor: MoneyMinor;
  closingBalanceMinor: MoneyMinor;
  openingDirectionLabel: BalanceDirectionLabel;
  closingDirectionLabel: BalanceDirectionLabel;
};

export type StatementReconciliationInput = {
  partyKind: LedgerPartyKind;
  accountBalanceMinor: MoneyMinor;
  remainingObligationsMinor: MoneyMinor;
  unappliedSettlementMinor: MoneyMinor;
};

export type StatementReconciliationResult = {
  reconciliationNetMinor: MoneyMinor;
  expectedAccountBalanceMinor: MoneyMinor;
  reconciliationOk: boolean;
  diagnostic: string | null;
};

export type AllocationHistoricalActivity = {
  createdAt: string;
  releasedAt: string | null;
  /** Linked reversal payment recorded_at when released_at is null (legacy). */
  legacyReleaseRecordedAt: string | null;
};

/**
 * Closing = opening + signed period movements.
 */
export function computeStatementPeriodTotals(
  partyKind: LedgerPartyKind,
  openingBalanceMinor: MoneyMinor,
  periodAmounts: readonly MoneyMinor[],
): StatementPeriodTotals {
  assertSafeMoney(openingBalanceMinor, "openingBalanceMinor");
  let increase = 0;
  let decrease = 0;
  let periodNet = 0;
  for (const amount of periodAmounts) {
    assertSafeMoney(amount, "period amount");
    periodNet += amount;
    if (amount > 0) {
      increase += amount;
    } else if (amount < 0) {
      decrease += -amount;
    }
  }
  assertSafeMoney(periodNet, "periodNet");
  assertSafeMoney(increase, "periodIncrease");
  assertSafeMoney(decrease, "periodDecrease");
  const closingBalanceMinor = openingBalanceMinor + periodNet;
  assertSafeMoney(closingBalanceMinor, "closingBalanceMinor");
  return {
    openingBalanceMinor,
    periodIncreaseMinor: increase,
    periodDecreaseMinor: decrease,
    periodNetMinor: periodNet,
    closingBalanceMinor,
    openingDirectionLabel: balanceDirectionLabel(partyKind, openingBalanceMinor),
    closingDirectionLabel: balanceDirectionLabel(partyKind, closingBalanceMinor),
  };
}

/**
 * Running balance continuity: preceding + cumulative signed amounts.
 * Does not restart at zero per page.
 */
export function computeRunningBalances(
  precedingBalanceMinor: MoneyMinor,
  rowAmounts: readonly MoneyMinor[],
): MoneyMinor[] {
  assertSafeMoney(precedingBalanceMinor, "precedingBalanceMinor");
  const running: MoneyMinor[] = [];
  let current = precedingBalanceMinor;
  for (const amount of rowAmounts) {
    assertSafeMoney(amount, "row amount");
    current += amount;
    assertSafeMoney(current, "runningBalance");
    running.push(current);
  }
  return running;
}

/** Split a signed movement into increase/decrease display columns. */
export function splitIncreaseDecrease(amountMinor: MoneyMinor): {
  increaseMinor: MoneyMinor;
  decreaseMinor: MoneyMinor;
} {
  assertSafeMoney(amountMinor, "amountMinor");
  if (amountMinor > 0) {
    return { increaseMinor: amountMinor, decreaseMinor: 0 };
  }
  if (amountMinor < 0) {
    return { increaseMinor: 0, decreaseMinor: -amountMinor };
  }
  return { increaseMinor: 0, decreaseMinor: 0 };
}

/**
 * For simple one-direction accounts under natural signs:
 * expected net account balance ≈ remaining obligations − unapplied settlements.
 *
 * Farmer: positive balance = stall owes farmer = remaining entitlements − unapplied payouts.
 * Trader: positive balance = buyer owes stall = remaining bills − unapplied receipts.
 */
export function reconcileOutstandingWithBalance(
  input: StatementReconciliationInput,
): StatementReconciliationResult {
  assertSafeMoney(input.accountBalanceMinor, "accountBalanceMinor");
  assertNonNegative(input.remainingObligationsMinor, "remainingObligationsMinor");
  assertNonNegative(input.unappliedSettlementMinor, "unappliedSettlementMinor");

  const expectedAccountBalanceMinor =
    input.remainingObligationsMinor - input.unappliedSettlementMinor;
  assertSafeMoney(expectedAccountBalanceMinor, "expectedAccountBalanceMinor");

  const reconciliationOk = expectedAccountBalanceMinor === input.accountBalanceMinor;
  return {
    reconciliationNetMinor: expectedAccountBalanceMinor,
    expectedAccountBalanceMinor,
    reconciliationOk,
    diagnostic: reconciliationOk
      ? null
      : `Account balance ${input.accountBalanceMinor} does not equal remaining obligations ${input.remainingObligationsMinor} minus unapplied ${input.unappliedSettlementMinor} (expected ${expectedAccountBalanceMinor}).`,
  };
}

export function settlementStatusForRemaining(
  effectiveAmountMinor: MoneyMinor,
  remainingMinor: MoneyMinor,
): "unpaid" | "partial" | "paid" {
  assertNonNegative(effectiveAmountMinor, "effectiveAmountMinor");
  assertNonNegative(remainingMinor, "remainingMinor");
  if (remainingMinor === 0) {
    return "paid";
  }
  if (remainingMinor === effectiveAmountMinor) {
    return "unpaid";
  }
  return "partial";
}

/**
 * Whether an allocation was active at a recording cutoff instant.
 * Prefer released_at; fall back to linked reversal payment recorded_at for legacy rows.
 * Returns { active, usedLegacyReleaseProxy }.
 */
export function allocationActiveAtCutoff(
  allocation: AllocationHistoricalActivity,
  cutoffIso: string,
): { active: boolean; usedLegacyReleaseProxy: boolean } {
  if (Date.parse(allocation.createdAt) > Date.parse(cutoffIso)) {
    return { active: false, usedLegacyReleaseProxy: false };
  }
  if (allocation.releasedAt !== null) {
    return {
      active: Date.parse(allocation.releasedAt) > Date.parse(cutoffIso),
      usedLegacyReleaseProxy: false,
    };
  }
  if (allocation.legacyReleaseRecordedAt !== null) {
    return {
      active: Date.parse(allocation.legacyReleaseRecordedAt) > Date.parse(cutoffIso),
      usedLegacyReleaseProxy: true,
    };
  }
  // Still active (never released) or unknown release — treat as active when created by cutoff.
  return { active: true, usedLegacyReleaseProxy: false };
}

export function buildSnapshotExpiry(
  capturedAtIso: string,
  ttlMs = STATEMENT_SNAPSHOT_TTL_MS,
): string {
  const capturedMs = Date.parse(capturedAtIso);
  if (Number.isNaN(capturedMs)) {
    throw new DomainError("INVALID_TIMESTAMP", "capturedAt must be an absolute timestamp");
  }
  return new Date(capturedMs + ttlMs).toISOString();
}

export function isSnapshotExpired(expiresAtIso: string, nowIso: string): boolean {
  return Date.parse(nowIso) > Date.parse(expiresAtIso);
}

/**
 * Encode snapshot payload as opaque base64url JSON (no signature; service validates binding).
 */
export function encodeStatementSnapshotToken(payload: StatementSnapshotPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeStatementSnapshotToken(token: string): StatementSnapshotPayload {
  let json: string;
  try {
    json = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot token is not valid base64url");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot token JSON is invalid");
  }
  return assertSnapshotPayload(parsed);
}

export type SnapshotBinding = {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  currency: "LKR";
  purpose: StatementSnapshotPayload["purpose"];
  fromBusinessDate?: string | null;
  toBusinessDate?: string | null;
  asOfBusinessDate?: string | null;
  filterFingerprint?: string | null;
};

export function assertSnapshotMatchesBinding(
  payload: StatementSnapshotPayload,
  binding: SnapshotBinding,
  nowIso: string,
): void {
  if (payload.v !== 1) {
    throw new DomainError("INVALID_SNAPSHOT", "Unsupported snapshot version");
  }
  if (isSnapshotExpired(payload.expiresAt, nowIso)) {
    throw new DomainError("SNAPSHOT_EXPIRED", "Reporting snapshot expired; refresh required");
  }
  if (
    payload.stallId !== binding.stallId ||
    payload.partyKind !== binding.partyKind ||
    payload.partyId !== binding.partyId ||
    payload.currency !== binding.currency ||
    payload.purpose !== binding.purpose
  ) {
    throw new DomainError("SNAPSHOT_MISMATCH", "Snapshot does not match this account query");
  }
  const from = binding.fromBusinessDate ?? null;
  const to = binding.toBusinessDate ?? null;
  const asOf = binding.asOfBusinessDate ?? null;
  const filter = binding.filterFingerprint ?? null;
  if (
    payload.fromBusinessDate !== from ||
    payload.toBusinessDate !== to ||
    payload.asOfBusinessDate !== asOf ||
    payload.filterFingerprint !== filter
  ) {
    throw new DomainError("SNAPSHOT_MISMATCH", "Snapshot does not match date range or filters");
  }
}

export function encodeStatementPageCursor(input: {
  snapshotToken: string;
  afterBusinessDate: string;
  afterPostingSequence: number;
  afterEntryId: string;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeStatementPageCursor(cursor: string): {
  snapshotToken: string;
  afterBusinessDate: string;
  afterPostingSequence: number;
  afterEntryId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new DomainError("INVALID_CURSOR", "Pagination cursor is invalid");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { snapshotToken?: unknown }).snapshotToken !== "string" ||
    typeof (parsed as { afterBusinessDate?: unknown }).afterBusinessDate !== "string" ||
    typeof (parsed as { afterPostingSequence?: unknown }).afterPostingSequence !== "number" ||
    typeof (parsed as { afterEntryId?: unknown }).afterEntryId !== "string"
  ) {
    throw new DomainError("INVALID_CURSOR", "Pagination cursor shape is invalid");
  }
  const value = parsed as {
    snapshotToken: string;
    afterBusinessDate: string;
    afterPostingSequence: number;
    afterEntryId: string;
  };
  if (
    !Number.isSafeInteger(value.afterPostingSequence) ||
    value.afterPostingSequence < 0 ||
    value.afterEntryId.length === 0
  ) {
    throw new DomainError("INVALID_CURSOR", "Pagination cursor values are invalid");
  }
  return value;
}

export function buildBalancePresentation(
  partyKind: LedgerPartyKind,
  balanceMinor: MoneyMinor,
): {
  balanceMinor: MoneyMinor;
  displayAmountMinor: MoneyMinor;
  directionLabel: BalanceDirectionLabel;
} {
  return {
    balanceMinor,
    displayAmountMinor: balanceDisplayAmountMinor(balanceMinor),
    directionLabel: balanceDirectionLabel(partyKind, balanceMinor),
  };
}

function assertSafeMoney(value: number, label: string): asserts value is MoneyMinor {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError("INVALID_MONEY", `${label} must be a safe integer`);
  }
}

function assertNonNegative(value: number, label: string): void {
  assertSafeMoney(value, label);
  if (value < 0) {
    throw new DomainError("INVALID_MONEY", `${label} must be non-negative`);
  }
}

function assertSnapshotPayload(value: unknown): StatementSnapshotPayload {
  if (typeof value !== "object" || value === null) {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot payload must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.v !== 1) {
    throw new DomainError("INVALID_SNAPSHOT", "Unsupported snapshot version");
  }
  if (
    typeof v.stallId !== "string" ||
    (v.partyKind !== "farmer" && v.partyKind !== "trader") ||
    typeof v.partyId !== "string" ||
    v.currency !== "LKR" ||
    typeof v.capturedAt !== "string" ||
    typeof v.expiresAt !== "string" ||
    typeof v.watermarks !== "object" ||
    v.watermarks === null
  ) {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot payload fields are invalid");
  }
  const purpose = v.purpose;
  if (
    purpose !== "statement" &&
    purpose !== "outstanding" &&
    purpose !== "unapplied" &&
    purpose !== "summary" &&
    purpose !== "settlement"
  ) {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot purpose is invalid");
  }
  const wm = v.watermarks as Record<string, unknown>;
  if (
    typeof wm.maxPostingSequence !== "number" ||
    !Number.isSafeInteger(wm.maxPostingSequence) ||
    wm.maxPostingSequence < 0 ||
    typeof wm.maxAllocationCreatedAt !== "string" ||
    typeof wm.maxAllocationId !== "string" ||
    typeof wm.maxPaymentRecordedAt !== "string" ||
    typeof wm.maxPaymentId !== "string"
  ) {
    throw new DomainError("INVALID_SNAPSHOT", "Snapshot watermarks are invalid");
  }
  return {
    v: 1,
    stallId: v.stallId,
    partyKind: v.partyKind,
    partyId: v.partyId,
    currency: "LKR",
    fromBusinessDate: (v.fromBusinessDate as string | null) ?? null,
    toBusinessDate: (v.toBusinessDate as string | null) ?? null,
    asOfBusinessDate: (v.asOfBusinessDate as string | null) ?? null,
    purpose,
    capturedAt: v.capturedAt,
    expiresAt: v.expiresAt,
    watermarks: {
      maxPostingSequence: wm.maxPostingSequence,
      maxAllocationCreatedAt: wm.maxAllocationCreatedAt,
      maxAllocationId: wm.maxAllocationId,
      maxPaymentRecordedAt: wm.maxPaymentRecordedAt,
      maxPaymentId: wm.maxPaymentId,
    },
    filterFingerprint: (v.filterFingerprint as string | null) ?? null,
  };
}
