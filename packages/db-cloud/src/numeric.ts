/**
 * Exact numeric mapping between SQLite INTEGER representations, PostgreSQL BIGINT,
 * and JSON string transport. Money = integer paisa; weight = integer hundredths-kg.
 * Do not use floating-point for authoritative values.
 */

export class CloudNumericError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNumericError";
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
      throw new CloudNumericError(`${label} must be an integer (got ${String(value)}).`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new CloudNumericError(
        `${label} ${String(value)} is outside the JavaScript safe integer range.`,
      );
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value)) {
      throw new CloudNumericError(`${label} string must be a whole integer (got ${value}).`);
    }
    return BigInt(value);
  }
  throw new CloudNumericError(`${label} must be an integer value (got ${typeof value}).`);
}

/** Encode money minor units for PostgreSQL BIGINT / JSON string transport. */
export function moneyMinorToPgString(value: number | bigint | string): string {
  return assertIntegerLike(value, "Money minor units").toString();
}

/** Decode money minor units from PostgreSQL BIGINT / driver string / number. */
export function moneyMinorFromPg(value: unknown): number {
  const asBig = assertIntegerLike(value, "Money minor units from Postgres");
  if (asBig < MIN_SAFE || asBig > MAX_SAFE) {
    throw new CloudNumericError(
      `Money value ${asBig.toString()} is outside Number.MAX_SAFE_INTEGER. Widen domain/contracts before accepting larger values.`,
    );
  }
  return Number(asBig);
}

/** Encode weight hundredths for PostgreSQL BIGINT / JSON string transport. */
export function weightHundredthsToPgString(value: number | bigint | string): string {
  const asBig = assertIntegerLike(value, "Weight hundredths");
  if (asBig < 0n) {
    throw new CloudNumericError("Weight hundredths must be non-negative.");
  }
  return asBig.toString();
}

/** Decode weight hundredths from PostgreSQL BIGINT / driver string / number. */
export function weightHundredthsFromPg(value: unknown): number {
  const asBig = assertIntegerLike(value, "Weight hundredths from Postgres");
  if (asBig < 0n) {
    throw new CloudNumericError("Weight hundredths must be non-negative.");
  }
  if (asBig < MIN_SAFE || asBig > MAX_SAFE) {
    throw new CloudNumericError(
      `Weight value ${asBig.toString()} is outside Number.MAX_SAFE_INTEGER.`,
    );
  }
  return Number(asBig);
}

/**
 * Round-trip helper: SQLite INTEGER (number|bigint) → PG string → domain number.
 * Rejects silent rounding or floating-point inputs.
 */
export function moneyMinorRoundTripFromSqlite(value: number | bigint): number {
  return moneyMinorFromPg(moneyMinorToPgString(value));
}

export function weightHundredthsRoundTripFromSqlite(value: number | bigint): number {
  return weightHundredthsFromPg(weightHundredthsToPgString(value));
}

export const CLOUD_NUMERIC_AGGREGATION_NOTE =
  "Aggregate money and weight as BIGINT (or string/BigInt in JS). Do not CAST to floating-point for authoritative totals.";
