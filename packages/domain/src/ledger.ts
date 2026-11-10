import { DomainError, sumMoneyMinor, type MoneyMinor } from "./money.js";

/** Party role for a subledger account. Buyers persist as traders. */
export type LedgerPartyKind = "farmer" | "trader";

export const LEDGER_CURRENCY_LKR = "LKR" as const;
export type LedgerCurrency = typeof LEDGER_CURRENCY_LKR;

export type FinancialAccountIdentity = {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  currency: LedgerCurrency;
};

/**
 * Distinguishes legitimate financial events so retries cannot double-post.
 * Do not rely solely on HTTP idempotency keys for business uniqueness.
 */
export type PostingSourceIdentity = {
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  /** Defaults to 1 when omitted. */
  eventSequence?: number;
};

export type LedgerEntryInput = {
  partyKind: LedgerPartyKind;
  partyId: string;
  amountMinor: MoneyMinor;
  currency: LedgerCurrency;
  description?: string;
};

export type OpeningBalanceDirection =
  | "stall_owes_farmer"
  | "farmer_owes_stall"
  | "buyer_owes_stall"
  | "stall_owes_buyer";

export type BalanceDirectionLabel =
  | "Stall owes farmer"
  | "Farmer owes stall"
  | "Buyer owes stall"
  | "Stall owes buyer"
  | "Settled";

export type OpeningDraftValidationInput = {
  partyKind: LedgerPartyKind;
  direction: OpeningBalanceDirection;
  amountMinor: MoneyMinor;
  cutoffDate: string;
  currency: LedgerCurrency;
  reference?: string;
  explanation?: string;
};

export type ValidatedOpeningDraft = {
  partyKind: LedgerPartyKind;
  direction: OpeningBalanceDirection;
  amountMinor: MoneyMinor;
  /** Signed movement under the natural-sign convention; null when amount is zero. */
  signedAmountMinor: MoneyMinor | null;
  cutoffDate: string;
  currency: LedgerCurrency;
  reference: string | null;
  explanation: string | null;
  isZeroOpening: boolean;
};

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError("INVALID_INTEGER", `${label} must be a safe integer`);
  }
}

export function assertLedgerCurrency(currency: string): asserts currency is LedgerCurrency {
  if (currency !== LEDGER_CURRENCY_LKR) {
    throw new DomainError("UNSUPPORTED_CURRENCY", `Only ${LEDGER_CURRENCY_LKR} is supported`);
  }
}

export function assertValidMoneyMinor(amount: MoneyMinor, label = "amount"): void {
  assertSafeInteger(amount, label);
}

export function assertNonNegativeMoneyMinor(amount: MoneyMinor, label = "amount"): void {
  assertValidMoneyMinor(amount, label);
  if (amount < 0) {
    throw new DomainError("NEGATIVE_AMOUNT", `${label} must be non-negative`);
  }
}

/** Directions allowed for a party kind. */
export function directionsForPartyKind(
  partyKind: LedgerPartyKind,
): readonly OpeningBalanceDirection[] {
  return partyKind === "farmer"
    ? (["stall_owes_farmer", "farmer_owes_stall"] as const)
    : (["buyer_owes_stall", "stall_owes_buyer"] as const);
}

export function isDirectionAllowedForParty(
  partyKind: LedgerPartyKind,
  direction: OpeningBalanceDirection,
): boolean {
  return (directionsForPartyKind(partyKind) as readonly string[]).includes(direction);
}

/**
 * Convert an opening direction + non-negative amount into a signed natural-sign movement.
 * Zero amounts yield null (no financial movement).
 */
export function signedAmountForOpeningDirection(
  partyKind: LedgerPartyKind,
  direction: OpeningBalanceDirection,
  amountMinor: MoneyMinor,
): MoneyMinor | null {
  assertNonNegativeMoneyMinor(amountMinor, "opening amount");
  if (!isDirectionAllowedForParty(partyKind, direction)) {
    throw new DomainError(
      "INVALID_OPENING_DIRECTION",
      `Direction ${direction} is not valid for ${partyKind}`,
    );
  }
  if (amountMinor === 0) {
    return null;
  }

  switch (direction) {
    case "stall_owes_farmer":
      return amountMinor;
    case "farmer_owes_stall":
      return -amountMinor;
    case "buyer_owes_stall":
      return amountMinor;
    case "stall_owes_buyer":
      return -amountMinor;
    default: {
      const _exhaustive: never = direction;
      throw new DomainError("INVALID_OPENING_DIRECTION", `Unknown direction ${_exhaustive}`);
    }
  }
}

/** Derive UI/API direction label from stored natural-sign balance. */
export function balanceDirectionLabel(
  partyKind: LedgerPartyKind,
  balanceMinor: MoneyMinor,
): BalanceDirectionLabel {
  assertValidMoneyMinor(balanceMinor, "balance");
  if (balanceMinor === 0) {
    return "Settled";
  }
  if (partyKind === "farmer") {
    return balanceMinor > 0 ? "Stall owes farmer" : "Farmer owes stall";
  }
  return balanceMinor > 0 ? "Buyer owes stall" : "Stall owes buyer";
}

/** Absolute display amount for a signed balance (always non-negative). */
export function balanceDisplayAmountMinor(balanceMinor: MoneyMinor): MoneyMinor {
  assertValidMoneyMinor(balanceMinor, "balance");
  return balanceMinor < 0 ? -balanceMinor : balanceMinor;
}

export function sumLedgerAmounts(amounts: readonly MoneyMinor[]): MoneyMinor {
  return sumMoneyMinor(amounts);
}

export function exactReversalAmount(originalAmountMinor: MoneyMinor): MoneyMinor {
  assertValidMoneyMinor(originalAmountMinor, "original amount");
  if (originalAmountMinor === 0) {
    throw new DomainError("INVALID_REVERSAL", "Cannot reverse a zero-amount entry");
  }
  const reversed = -originalAmountMinor;
  assertValidMoneyMinor(reversed, "reversal amount");
  return reversed;
}

export function validateOpeningDraft(input: OpeningDraftValidationInput): ValidatedOpeningDraft {
  assertLedgerCurrency(input.currency);
  assertNonNegativeMoneyMinor(input.amountMinor, "opening amount");
  if (!CALENDAR_DATE.test(input.cutoffDate)) {
    throw new DomainError("INVALID_CUTOFF_DATE", "Opening cutoff must be YYYY-MM-DD");
  }
  if (!isDirectionAllowedForParty(input.partyKind, input.direction)) {
    throw new DomainError(
      "INVALID_OPENING_DIRECTION",
      `Direction ${input.direction} is not valid for ${input.partyKind}`,
    );
  }

  const reference = normalizeOptionalText(input.reference, "reference", 128);
  const explanation = normalizeOptionalText(input.explanation, "explanation", 500);
  const signedAmountMinor = signedAmountForOpeningDirection(
    input.partyKind,
    input.direction,
    input.amountMinor,
  );

  return {
    partyKind: input.partyKind,
    direction: input.direction,
    amountMinor: input.amountMinor,
    signedAmountMinor,
    cutoffDate: input.cutoffDate,
    currency: input.currency,
    reference,
    explanation,
    isZeroOpening: signedAmountMinor === null,
  };
}

function normalizeOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new DomainError("TEXT_TOO_LONG", `${label} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function resolveEventSequence(source: PostingSourceIdentity): number {
  const sequence = source.eventSequence ?? 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new DomainError("INVALID_EVENT_SEQUENCE", "eventSequence must be a positive safe integer");
  }
  return sequence;
}

/** Opening business source types used by Phase 21. */
export const OPENING_SOURCE_TYPE = "opening_balance" as const;
export const OPENING_EVENT_POST = "opening_posted" as const;
export const OPENING_EVENT_REVERSE = "opening_reversed" as const;
export const OPENING_EVENT_REPLACE = "opening_replaced" as const;
