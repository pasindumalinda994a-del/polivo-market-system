/** Integer minor units (paisa). Rs. 1.00 → 100. */
export type MoneyMinor = number;

/** Integer hundredths of a kilogram. 25.50 kg → 2550. */
export type WeightHundredths = number;

const MINOR_PER_MAJOR = 100n;
const WEIGHT_SCALE = 100n;

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError("INVALID_INTEGER", `${label} must be a safe integer`);
  }
}

/**
 * Round a rational amount expressed as (numerator / denominator) to nearest
 * integer minor unit using half-up (away from zero when exactly .5).
 */
export function roundHalfUpRatio(numerator: bigint, denominator: bigint): MoneyMinor {
  if (denominator === 0n) {
    throw new DomainError("DIVISION_BY_ZERO", "Denominator must not be zero");
  }

  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  // Half-up: round up when remainder * 2 >= denominator
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;

  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError("OVERFLOW", "Rounded amount exceeds safe integer range");
  }

  return Number(signed);
}

/**
 * Round a product of money-minor-per-kg and weight-hundredths into money minor units.
 * amount = pricePerKgMinor * weightHundredths / 100, half-up to integer paisa.
 */
export function roundMoneyTimesWeight(
  pricePerKgMinor: MoneyMinor,
  weightHundredths: WeightHundredths,
): MoneyMinor {
  assertSafeInteger(pricePerKgMinor, "pricePerKgMinor");
  assertSafeInteger(weightHundredths, "weightHundredths");
  return roundHalfUpRatio(BigInt(pricePerKgMinor) * BigInt(weightHundredths), WEIGHT_SCALE);
}

/** Convert a major-unit decimal with at most two places (for example "250.00") to minor units. */
export function moneyMinorFromMajorDecimalString(value: string): MoneyMinor {
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new DomainError(
      "INVALID_MONEY_STRING",
      "Money string must be a decimal with at most two fractional digits",
    );
  }

  const whole = BigInt(match[1]!);
  const fractionRaw = match[2] ?? "";
  const fraction = BigInt(fractionRaw.padEnd(2, "0") || "0");
  const negative = whole < 0n || value.startsWith("-");
  const absWhole = whole < 0n ? -whole : whole;
  const minor = absWhole * MINOR_PER_MAJOR + fraction;
  const signed = negative && minor !== 0n ? -minor : minor;

  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError("OVERFLOW", "Money amount exceeds safe integer range");
  }

  return Number(signed);
}

export function sumMoneyMinor(amounts: readonly MoneyMinor[]): MoneyMinor {
  let total = 0n;
  for (const amount of amounts) {
    assertSafeInteger(amount, "amount");
    total += BigInt(amount);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError("OVERFLOW", "Sum exceeds safe integer range");
  }
  return Number(total);
}
