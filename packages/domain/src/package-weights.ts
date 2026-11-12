import { DomainError, type WeightHundredths } from "./money.js";
import { netWeightHundredths } from "./weight.js";

/** Technical bound matching contracts PACKAGE_WEIGHT_ENTRY_MAX_ROWS. */
export const PACKAGE_WEIGHT_ENTRY_MAX_ROWS = 200;

const WEIGHT_SCALE = 100n;

export type PackageWeightDraftRow = {
  rowKey: string;
  /** Transient UI text. Empty or partially typed decimals are incomplete drafts. */
  weightText: string;
  packageTypeId?: string;
};

export type PackageWeightValidatedRow = {
  rowKey: string;
  packageTypeId?: string;
  grossWeightHundredths: WeightHundredths;
};

export type PackageWeightSummaryStatus = "complete" | "incomplete" | "invalid";

export type PackageWeightSummary = {
  status: PackageWeightSummaryStatus;
  packageCount: number;
  grossWeightHundredths: WeightHundredths;
  packagingWeightHundredths: WeightHundredths;
  netWeightHundredths: WeightHundredths;
  unit: "kg";
  rows: PackageWeightValidatedRow[];
  errors: string[];
};

/**
 * Convert a non-negative kg decimal with at most two places to hundredths.
 * Rejects negatives, excess precision, and incomplete drafts (callers must not pass those).
 */
export function weightHundredthsFromMajorDecimalString(value: string): WeightHundredths {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new DomainError(
      "INVALID_WEIGHT_STRING",
      "Weight string must be a non-negative decimal with at most two fractional digits",
    );
  }

  const whole = BigInt(match[1]!);
  const fractionRaw = match[2] ?? "";
  const fraction = BigInt(fractionRaw.padEnd(2, "0") || "0");
  const hundredths = whole * WEIGHT_SCALE + fraction;

  if (hundredths > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError("OVERFLOW", "Weight exceeds safe integer range");
  }

  return Number(hundredths);
}

/** Format hundredths-kg as a fixed two-decimal major string (for example 2550 → "25.50"). */
export function weightHundredthsToMajorDecimalString(hundredths: WeightHundredths): string {
  if (!Number.isSafeInteger(hundredths) || hundredths < 0) {
    throw new DomainError("INVALID_WEIGHT", "Weight must be a non-negative safe integer");
  }
  const whole = Math.trunc(hundredths / 100);
  const fraction = hundredths % 100;
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

function isIncompleteWeightDraft(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return true;
  }
  // Trailing decimal point or single trailing digit after point still incomplete for typing UX,
  // but "12." and "12.3" are rejected as invalid precision/format when completed.
  // Empty and whitespace-only are incomplete; partial " ." style is invalid.
  return false;
}

function tryParseCompletedWeight(
  text: string,
): { ok: true; value: WeightHundredths } | { ok: false; incomplete: boolean; message: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, incomplete: true, message: "Weight is required" };
  }
  if (trimmed === "." || trimmed.endsWith(".")) {
    return { ok: false, incomplete: true, message: "Weight is incomplete" };
  }
  if (/^\d+\.\d{3,}$/.test(trimmed)) {
    return {
      ok: false,
      incomplete: false,
      message: "Weight allows at most two decimal places",
    };
  }
  if (trimmed.startsWith("-")) {
    return { ok: false, incomplete: false, message: "Weight cannot be negative" };
  }
  try {
    return { ok: true, value: weightHundredthsFromMajorDecimalString(trimmed) };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, incomplete: false, message: error.message };
    }
    throw error;
  }
}

function trimTrailingEmptyDrafts(rows: readonly PackageWeightDraftRow[]): PackageWeightDraftRow[] {
  let end = rows.length;
  while (end > 0 && rows[end - 1]!.weightText.trim().length === 0) {
    end -= 1;
  }
  return rows.slice(0, end);
}

/**
 * Summarize individually weighed package rows.
 * Package count is the number of completed rows; totals are the sum of those row grosses
 * (never multiplied by the count again). Packaging defaults to zero when omitted.
 * Trailing empty draft rows are ignored so Enter-to-add does not block completion.
 */
export function summarizePackageWeightEntry(input: {
  rows: readonly PackageWeightDraftRow[];
  packagingWeightText?: string;
}): PackageWeightSummary {
  const errors: string[] = [];
  let incomplete = false;
  let invalid = false;
  const effectiveRows = trimTrailingEmptyDrafts(input.rows);

  if (input.rows.length > PACKAGE_WEIGHT_ENTRY_MAX_ROWS) {
    return {
      status: "invalid",
      packageCount: 0,
      grossWeightHundredths: 0,
      packagingWeightHundredths: 0,
      netWeightHundredths: 0,
      unit: "kg",
      rows: [],
      errors: [`At most ${PACKAGE_WEIGHT_ENTRY_MAX_ROWS} package rows are allowed`],
    };
  }

  if (effectiveRows.length === 0) {
    return {
      status: "incomplete",
      packageCount: 0,
      grossWeightHundredths: 0,
      packagingWeightHundredths: 0,
      netWeightHundredths: 0,
      unit: "kg",
      rows: [],
      errors: [],
    };
  }

  const seenKeys = new Set<string>();
  const validatedRows: PackageWeightValidatedRow[] = [];
  let grossTotal = 0n;

  for (const row of effectiveRows) {
    const key = row.rowKey.trim();
    if (key.length === 0) {
      invalid = true;
      errors.push("Package row key is required");
      continue;
    }
    if (seenKeys.has(key)) {
      invalid = true;
      errors.push(`Duplicate package row key: ${key}`);
      continue;
    }
    seenKeys.add(key);

    if (isIncompleteWeightDraft(row.weightText)) {
      incomplete = true;
      continue;
    }

    const parsed = tryParseCompletedWeight(row.weightText);
    if (!parsed.ok) {
      if (parsed.incomplete) {
        incomplete = true;
      } else {
        invalid = true;
        errors.push(`Row ${key}: ${parsed.message}`);
      }
      continue;
    }

    grossTotal += BigInt(parsed.value);
    if (grossTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
      invalid = true;
      errors.push("Total gross weight exceeds safe integer range");
      grossTotal = BigInt(Number.MAX_SAFE_INTEGER);
      break;
    }

    validatedRows.push({
      rowKey: key,
      packageTypeId: row.packageTypeId,
      grossWeightHundredths: parsed.value,
    });
  }

  let packagingHundredths: WeightHundredths = 0;
  if (input.packagingWeightText !== undefined) {
    const packagingParsed = tryParseCompletedWeight(input.packagingWeightText);
    if (!packagingParsed.ok) {
      if (packagingParsed.incomplete) {
        incomplete = true;
      } else {
        invalid = true;
        errors.push(`Packaging: ${packagingParsed.message}`);
      }
    } else {
      packagingHundredths = packagingParsed.value;
    }
  }

  const grossWeightHundredths = Number(grossTotal);
  let net: WeightHundredths = 0;
  if (!invalid && !incomplete) {
    try {
      net = netWeightHundredths(grossWeightHundredths, packagingHundredths);
    } catch (error) {
      invalid = true;
      if (error instanceof DomainError) {
        errors.push(error.message);
      } else {
        throw error;
      }
    }
  }

  const status: PackageWeightSummaryStatus = invalid
    ? "invalid"
    : incomplete || validatedRows.length < effectiveRows.length
      ? "incomplete"
      : "complete";

  return {
    status,
    packageCount: status === "complete" ? validatedRows.length : validatedRows.length,
    grossWeightHundredths,
    packagingWeightHundredths: packagingHundredths,
    netWeightHundredths: status === "complete" ? net : 0,
    unit: "kg",
    rows: status === "complete" ? validatedRows : [],
    errors,
  };
}

/**
 * Summarize already-validated transport rows (service-side revalidation path).
 */
export function summarizeValidatedPackageWeights(input: {
  rows: readonly PackageWeightValidatedRow[];
  packagingWeightHundredths?: WeightHundredths;
}): PackageWeightSummary {
  const draftRows: PackageWeightDraftRow[] = input.rows.map((row) => ({
    rowKey: row.rowKey,
    packageTypeId: row.packageTypeId,
    weightText: weightHundredthsToMajorDecimalString(row.grossWeightHundredths),
  }));
  return summarizePackageWeightEntry({
    rows: draftRows,
    packagingWeightText:
      input.packagingWeightHundredths === undefined
        ? undefined
        : weightHundredthsToMajorDecimalString(input.packagingWeightHundredths),
  });
}
