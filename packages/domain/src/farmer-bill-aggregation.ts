import { DomainError, sumMoneyMinor, type MoneyMinor, type WeightHundredths } from "./money.js";
import { SALE_DRAFT_MAX_LINES } from "./sale-calculation.js";

/** Maximum source lines on one farmer bill (aligns with sale draft bound). */
export const FARMER_BILL_MAX_LINES = SALE_DRAFT_MAX_LINES;

/** Stored finalized sale-line snapshots used for farmer-bill aggregation. */
export type FarmerBillSourceLineSnapshot = {
  saleLineId: string;
  farmerId: string;
  currency: "LKR";
  packageCount: number;
  netWeightHundredths: WeightHundredths;
  saleAmountMinor: MoneyMinor;
  commissionAmountMinor: MoneyMinor;
  farmerReceivesMinor: MoneyMinor;
};

export type FarmerBillAggregation = {
  lineCount: number;
  totalPackageCount: number;
  totalNetWeightHundredths: WeightHundredths;
  totalSaleAmountMinor: MoneyMinor;
  totalCommissionMinor: MoneyMinor;
  totalFarmerReceivesMinor: MoneyMinor;
  currency: "LKR";
  /** Canonical sorted unique source-line ids used for fingerprinting. */
  sourceLineIds: readonly string[];
};

/**
 * Aggregate exact stored sale-line snapshots for a farmer bill.
 * Does not recompute commission from current policy.
 */
export function aggregateFarmerBillSourceLines(
  lines: readonly FarmerBillSourceLineSnapshot[],
): FarmerBillAggregation {
  if (lines.length === 0) {
    throw new DomainError("EMPTY_SELECTION", "Farmer bill requires at least one source line");
  }
  if (lines.length > FARMER_BILL_MAX_LINES) {
    throw new DomainError(
      "TOO_MANY_LINES",
      `At most ${FARMER_BILL_MAX_LINES} source lines are allowed on one farmer bill`,
    );
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (typeof line.saleLineId !== "string" || line.saleLineId.trim().length === 0) {
      throw new DomainError("INVALID_SOURCE_LINE", "Source line id is required");
    }
    if (seen.has(line.saleLineId)) {
      throw new DomainError("DUPLICATE_SOURCE_LINE", "Source line ids must be unique");
    }
    seen.add(line.saleLineId);

    if (typeof line.farmerId !== "string" || line.farmerId.trim().length === 0) {
      throw new DomainError("INVALID_FARMER", "Farmer reference is required");
    }
    if (line.currency !== "LKR") {
      throw new DomainError("CURRENCY_MISMATCH", "Farmer bill lines must use LKR");
    }
    assertNonNegativeSafeInteger(line.packageCount, "INVALID_PACKAGE_COUNT", "Package count");
    assertNonNegativeSafeInteger(
      line.netWeightHundredths,
      "INVALID_WEIGHT",
      "Net weight hundredths",
    );
    assertNonNegativeSafeInteger(line.saleAmountMinor, "INVALID_AMOUNT", "Sale amount");
    assertNonNegativeSafeInteger(line.commissionAmountMinor, "INVALID_AMOUNT", "Commission amount");
    assertNonNegativeSafeInteger(
      line.farmerReceivesMinor,
      "INVALID_AMOUNT",
      "Farmer entitlement amount",
    );
  }

  const farmerId = lines[0]!.farmerId;
  for (const line of lines) {
    if (line.farmerId !== farmerId) {
      throw new DomainError(
        "MIXED_FARMERS",
        "All selected source lines must belong to the same farmer",
      );
    }
  }

  const sourceLineIds = [...seen].sort((a, b) => a.localeCompare(b));

  return {
    lineCount: lines.length,
    totalPackageCount: lines.reduce((sum, line) => sum + line.packageCount, 0),
    totalNetWeightHundredths: lines.reduce(
      (sum, line) => sum + line.netWeightHundredths,
      0,
    ) as WeightHundredths,
    totalSaleAmountMinor: sumMoneyMinor(lines.map((line) => line.saleAmountMinor)),
    totalCommissionMinor: sumMoneyMinor(lines.map((line) => line.commissionAmountMinor)),
    totalFarmerReceivesMinor: sumMoneyMinor(lines.map((line) => line.farmerReceivesMinor)),
    currency: "LKR",
    sourceLineIds,
  };
}

/**
 * Canonical fingerprint material for farmer-bill selection review.
 * Callers hash this string (e.g. SHA-256) for transport.
 */
export function buildFarmerBillSelectionFingerprintMaterial(input: {
  farmerId: string;
  businessDate: string;
  aggregation: FarmerBillAggregation;
}): string {
  return [
    input.farmerId,
    input.businessDate,
    input.aggregation.currency,
    String(input.aggregation.lineCount),
    String(input.aggregation.totalPackageCount),
    String(input.aggregation.totalNetWeightHundredths),
    String(input.aggregation.totalSaleAmountMinor),
    String(input.aggregation.totalCommissionMinor),
    String(input.aggregation.totalFarmerReceivesMinor),
    ...input.aggregation.sourceLineIds,
  ].join("\n");
}

function assertNonNegativeSafeInteger(
  value: number,
  code: string,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(code, `${label} must be a non-negative safe integer`);
  }
}
