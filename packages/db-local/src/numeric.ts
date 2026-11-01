/**
 * Exact numeric persistence adapters for phase 08 representations.
 * Money: integer paisa. Weight: integer hundredths of a kilogram.
 * Authoritative values must never be stored as SQLite REAL.
 */

export class NumericPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumericPersistenceError";
  }
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

function assertIntegerLike(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new NumericPersistenceError(`${label} must be an integer (got ${String(value)}).`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new NumericPersistenceError(
        `${label} ${String(value)} is outside the JavaScript safe integer range. Use BigInt adapters for out-of-range values.`,
      );
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new NumericPersistenceError(`${label} must be an integer value (got ${typeof value}).`);
}

/** Validate and return money as a safe number for SQLite INTEGER binding when in range. */
export function moneyMinorToSqliteInteger(value: number | bigint): number | bigint {
  const asBig = assertIntegerLike(value, "Money minor units");
  if (asBig >= MIN_SAFE && asBig <= MAX_SAFE) {
    return Number(asBig);
  }
  return asBig;
}

export function moneyMinorFromSqliteInteger(value: unknown): number {
  const asBig = assertIntegerLike(value, "Money minor units from SQLite");
  if (asBig < MIN_SAFE || asBig > MAX_SAFE) {
    throw new NumericPersistenceError(
      `Money value ${asBig.toString()} is outside Number.MAX_SAFE_INTEGER. Domain MoneyMinor currently uses safe integers; widen domain/contracts before persisting larger values.`,
    );
  }
  return Number(asBig);
}

export function weightHundredthsToSqliteInteger(value: number | bigint): number | bigint {
  const asBig = assertIntegerLike(value, "Weight hundredths");
  if (asBig < 0n) {
    throw new NumericPersistenceError("Weight hundredths must be non-negative.");
  }
  if (asBig >= MIN_SAFE && asBig <= MAX_SAFE) {
    return Number(asBig);
  }
  return asBig;
}

export function weightHundredthsFromSqliteInteger(value: unknown): number {
  const asBig = assertIntegerLike(value, "Weight hundredths from SQLite");
  if (asBig < 0n) {
    throw new NumericPersistenceError("Weight hundredths must be non-negative.");
  }
  if (asBig < MIN_SAFE || asBig > MAX_SAFE) {
    throw new NumericPersistenceError(
      `Weight value ${asBig.toString()} is outside Number.MAX_SAFE_INTEGER.`,
    );
  }
  return Number(asBig);
}

/**
 * Later reports must aggregate INTEGER columns with exact integer arithmetic
 * (domain helpers or SQL SUM into INTEGER / careful BigInt), never via REAL coercion.
 */
export const NUMERIC_AGGREGATION_NOTE =
  "Aggregate money and weight as INTEGER (or BigInt). Do not CAST to REAL for authoritative totals.";
