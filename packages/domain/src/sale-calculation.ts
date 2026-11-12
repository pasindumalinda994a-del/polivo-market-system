import {
  calculateCommission,
  type CommissionCalculationResult,
  type CommissionPolicy,
} from "./commission.js";
import {
  DomainError,
  roundMoneyTimesWeight,
  sumMoneyMinor,
  type MoneyMinor,
  type WeightHundredths,
} from "./money.js";
import {
  summarizeValidatedPackageWeights,
  type PackageWeightValidatedRow,
} from "./package-weights.js";
import { netWeightHundredths } from "./weight.js";

/** Technical bound for sale lines on one draft (not a market-capacity claim). */
export const SALE_DRAFT_MAX_LINES = 100;

/** Technical bound for optional line notes. */
export const SALE_LINE_NOTES_MAX_LENGTH = 500;

export type SaleLineWeightInput = {
  rows: readonly PackageWeightValidatedRow[];
  packagingWeightHundredths?: WeightHundredths;
};

export type PolicySaleLineInput = {
  /** Stable client/server line identity for drafts. */
  lineId?: string;
  farmerId: string;
  vegetableId: string;
  packageTypeId: string;
  unitPricePerKgMinor: MoneyMinor;
  weights: SaleLineWeightInput;
  notes?: string | null;
};

export type PolicySaleLineResult = {
  lineId?: string;
  farmerId: string;
  vegetableId: string;
  packageTypeId: string;
  unitPricePerKgMinor: MoneyMinor;
  notes: string | null;
  packageCount: number;
  grossWeightHundredths: WeightHundredths;
  packagingWeightHundredths: WeightHundredths;
  netWeightHundredths: WeightHundredths;
  weightRows: readonly PackageWeightValidatedRow[];
  saleAmountMinor: MoneyMinor;
  commission: CommissionCalculationResult;
  traderPaysMinor: MoneyMinor;
  farmerReceivesBeforeDeductionsMinor: MoneyMinor;
};

export type PolicySaleBillResult = {
  lines: PolicySaleLineResult[];
  totalSaleAmountMinor: MoneyMinor;
  totalCommissionMinor: MoneyMinor;
  totalTraderPaysMinor: MoneyMinor;
  totalFarmerReceivesBeforeDeductionsMinor: MoneyMinor;
  /** Farmer id → entitlement sum across lines. */
  farmerEntitlements: ReadonlyMap<string, MoneyMinor>;
  policyId: string;
  versionId: string;
};

export type SaleCalculationIssue = {
  code: string;
  message: string;
  lineIndex?: number;
};

/**
 * Calculate one sale line against an immutable commission policy.
 * Uses summed individual bag weights minus packaging (never bag-count × sum).
 */
export function calculateSaleLineWithPolicy(
  policy: CommissionPolicy,
  input: PolicySaleLineInput,
): PolicySaleLineResult {
  assertLineIdentity(input);
  assertSafeNonNegativePrice(input.unitPricePerKgMinor);

  const notes = normalizeNotes(input.notes);
  const summary = summarizeValidatedPackageWeights({
    rows: input.weights.rows,
    packagingWeightHundredths: input.weights.packagingWeightHundredths,
  });

  if (summary.status === "incomplete") {
    throw new DomainError("INCOMPLETE_WEIGHTS", "Sale line weights are incomplete");
  }
  if (summary.status === "invalid" || summary.errors.length > 0) {
    throw new DomainError("INVALID_WEIGHTS", summary.errors[0] ?? "Sale line weights are invalid");
  }
  if (summary.packageCount < 1) {
    throw new DomainError("INVALID_WEIGHTS", "Sale line requires at least one package weight");
  }

  const net = netWeightHundredths(summary.grossWeightHundredths, summary.packagingWeightHundredths);
  const saleAmountMinor = roundMoneyTimesWeight(input.unitPricePerKgMinor, net);
  const commission = calculateCommission(policy, {
    sellingPricePerKgMinor: input.unitPricePerKgMinor,
    netWeightHundredths: net,
  });
  const farmerReceivesBeforeDeductionsMinor = saleAmountMinor - commission.commissionMinor;

  return {
    lineId: input.lineId,
    farmerId: input.farmerId,
    vegetableId: input.vegetableId,
    packageTypeId: input.packageTypeId,
    unitPricePerKgMinor: input.unitPricePerKgMinor,
    notes,
    packageCount: summary.packageCount,
    grossWeightHundredths: summary.grossWeightHundredths,
    packagingWeightHundredths: summary.packagingWeightHundredths,
    netWeightHundredths: net,
    weightRows: summary.rows,
    saleAmountMinor,
    commission,
    traderPaysMinor: saleAmountMinor,
    farmerReceivesBeforeDeductionsMinor,
  };
}

/**
 * Aggregate policy-aware sale lines into bill totals with farmer attribution.
 */
export function calculateSaleBillWithPolicy(
  policy: CommissionPolicy,
  lines: readonly PolicySaleLineInput[],
): PolicySaleBillResult {
  if (lines.length === 0) {
    throw new DomainError("INCOMPLETE_DRAFT", "Sale requires at least one line");
  }
  if (lines.length > SALE_DRAFT_MAX_LINES) {
    throw new DomainError(
      "TOO_MANY_LINES",
      `At most ${SALE_DRAFT_MAX_LINES} sale lines are allowed`,
    );
  }

  const calculated = lines.map((line) => calculateSaleLineWithPolicy(policy, line));
  const farmerEntitlements = new Map<string, MoneyMinor>();

  for (const line of calculated) {
    const previous = farmerEntitlements.get(line.farmerId) ?? 0;
    farmerEntitlements.set(line.farmerId, previous + line.farmerReceivesBeforeDeductionsMinor);
  }

  return {
    lines: calculated,
    totalSaleAmountMinor: sumMoneyMinor(calculated.map((line) => line.saleAmountMinor)),
    totalCommissionMinor: sumMoneyMinor(calculated.map((line) => line.commission.commissionMinor)),
    totalTraderPaysMinor: sumMoneyMinor(calculated.map((line) => line.traderPaysMinor)),
    totalFarmerReceivesBeforeDeductionsMinor: sumMoneyMinor(
      calculated.map((line) => line.farmerReceivesBeforeDeductionsMinor),
    ),
    farmerEntitlements,
    policyId: policy.policyId,
    versionId: policy.versionId,
  };
}

/**
 * Collect validation issues without throwing (preview / readiness path).
 * Missing policy must surface as an issue — never a silent zero commission.
 */
export function validateSaleBillForFinalization(
  policy: CommissionPolicy | null,
  lines: readonly PolicySaleLineInput[],
): { ready: boolean; issues: SaleCalculationIssue[] } {
  const issues: SaleCalculationIssue[] = [];

  if (policy === null) {
    issues.push({
      code: "MISSING_COMMISSION_POLICY",
      message: "No active commission policy is available for calculation",
    });
  }

  if (lines.length === 0) {
    issues.push({
      code: "INCOMPLETE_DRAFT",
      message: "Sale requires at least one line",
    });
  } else if (lines.length > SALE_DRAFT_MAX_LINES) {
    issues.push({
      code: "TOO_MANY_LINES",
      message: `At most ${SALE_DRAFT_MAX_LINES} sale lines are allowed`,
    });
  }

  if (policy !== null) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      try {
        calculateSaleLineWithPolicy(policy, line);
      } catch (error) {
        if (error instanceof DomainError) {
          issues.push({
            code: error.code,
            message: error.message,
            lineIndex: index,
          });
        } else {
          throw error;
        }
      }
    }
  }

  return { ready: issues.length === 0, issues };
}

/**
 * Canonical fingerprint material for stale-calculation detection.
 * Callers hash this string (e.g. SHA-256) for transport.
 */
export function buildSaleCalculationFingerprintMaterial(input: {
  draftRevision: number;
  policyId: string;
  versionId: string;
  traderId: string;
  businessDate: string;
  lines: readonly PolicySaleLineResult[];
}): string {
  const lineParts = input.lines.map((line) =>
    [
      line.lineId ?? "",
      line.farmerId,
      line.vegetableId,
      line.packageTypeId,
      String(line.unitPricePerKgMinor),
      String(line.packagingWeightHundredths),
      String(line.netWeightHundredths),
      String(line.saleAmountMinor),
      line.commission.bandId,
      String(line.commission.appliedRatePerKgMinor),
      String(line.commission.commissionMinor),
      line.weightRows.map((row) => `${row.rowKey}:${row.grossWeightHundredths}`).join(","),
      line.notes ?? "",
    ].join("|"),
  );

  return [
    String(input.draftRevision),
    input.policyId,
    input.versionId,
    input.traderId,
    input.businessDate,
    ...lineParts,
  ].join("\n");
}

function assertLineIdentity(input: PolicySaleLineInput): void {
  if (typeof input.farmerId !== "string" || input.farmerId.trim().length === 0) {
    throw new DomainError("INVALID_FARMER", "Farmer reference is required");
  }
  if (typeof input.vegetableId !== "string" || input.vegetableId.trim().length === 0) {
    throw new DomainError("INVALID_VEGETABLE", "Vegetable reference is required");
  }
  if (typeof input.packageTypeId !== "string" || input.packageTypeId.trim().length === 0) {
    throw new DomainError("INVALID_PACKAGE_TYPE", "Package type reference is required");
  }
}

function assertSafeNonNegativePrice(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      "INVALID_PRICE",
      "Selling price per kg must be a non-negative safe integer",
    );
  }
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) {
    return null;
  }
  const trimmed = notes.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > SALE_LINE_NOTES_MAX_LENGTH) {
    throw new DomainError(
      "NOTES_TOO_LONG",
      `Line notes must be at most ${SALE_LINE_NOTES_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}
