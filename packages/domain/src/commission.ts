import {
  DomainError,
  roundMoneyTimesWeight,
  type MoneyMinor,
  type WeightHundredths,
} from "./money.js";

/** Commission rate in money minor units per kilogram. */
export type CommissionRatePerKgMinor = MoneyMinor;

/** Approved rate basis for v1 stall default bands. */
export const COMMISSION_RATE_BASIS_PER_KG_MINOR = "per_kg_minor" as const;
export type CommissionRateBasis = typeof COMMISSION_RATE_BASIS_PER_KG_MINOR;

/** Rounding rule applied at the per-line (bag) stage. */
export const COMMISSION_ROUNDING_RULE_ID = "half_up_money_times_weight_v1" as const;

/** Calculation algorithm version for historical reproducibility. */
export const COMMISSION_ALGORITHM_VERSION = "stall_default_bands_v1" as const;

export type CommissionBand = {
  id: string;
  /** Inclusive lower bound in selling-price paisa per kg. */
  minPricePerKgMinor: MoneyMinor;
  /** Inclusive upper bound, or null for an open-ended final band. */
  maxPricePerKgMinor: MoneyMinor | null;
  ratePerKgMinor: CommissionRatePerKgMinor;
};

export type CommissionPolicy = {
  policyId: string;
  versionId: string;
  rateBasis: CommissionRateBasis;
  roundingRuleId: typeof COMMISSION_ROUNDING_RULE_ID;
  algorithmVersion: typeof COMMISSION_ALGORITHM_VERSION;
  bands: readonly CommissionBand[];
};

export type CommissionCalculationResult = {
  policyId: string;
  versionId: string;
  bandId: string;
  selectionPricePerKgMinor: MoneyMinor;
  selectionUnit: "price_per_kg_minor";
  chargeableWeightHundredths: WeightHundredths;
  chargeableUnit: "weight_hundredths";
  appliedRatePerKgMinor: CommissionRatePerKgMinor;
  rateBasis: CommissionRateBasis;
  roundingRuleId: typeof COMMISSION_ROUNDING_RULE_ID;
  algorithmVersion: typeof COMMISSION_ALGORITHM_VERSION;
  commissionMinor: MoneyMinor;
  currency: "LKR_PAISA";
};

/**
 * TEST/REFERENCE ONLY — ADR 0003/0005 default bands.
 * Do not seed into production SQLite as live business settings.
 */
export const ADR_REFERENCE_COMMISSION_BANDS: readonly CommissionBand[] = [
  {
    id: "adr-ref-below-200",
    minPricePerKgMinor: 0,
    maxPricePerKgMinor: 19_999,
    ratePerKgMinor: 500,
  },
  {
    id: "adr-ref-200-400",
    minPricePerKgMinor: 20_000,
    maxPricePerKgMinor: 40_000,
    ratePerKgMinor: 1_500,
  },
  {
    id: "adr-ref-above-400",
    minPricePerKgMinor: 40_001,
    maxPricePerKgMinor: null,
    ratePerKgMinor: 5_000,
  },
];

/** TEST/REFERENCE ONLY policy wrapping ADR default bands. */
export const ADR_REFERENCE_COMMISSION_POLICY: CommissionPolicy = {
  policyId: "adr-reference-policy",
  versionId: "adr-reference-v1",
  rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
  roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
  algorithmVersion: COMMISSION_ALGORITHM_VERSION,
  bands: ADR_REFERENCE_COMMISSION_BANDS,
};

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("INVALID_INTEGER", `${label} must be a non-negative safe integer`);
  }
}

function assertPositiveRate(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError("INVALID_RATE", `${label} must be a positive safe integer`);
  }
}

function bandContainsPrice(band: CommissionBand, price: MoneyMinor): boolean {
  if (price < band.minPricePerKgMinor) {
    return false;
  }
  if (band.maxPricePerKgMinor === null) {
    return true;
  }
  return price <= band.maxPricePerKgMinor;
}

/**
 * Validate a complete stall commission policy before activation or calculation.
 * Returns a frozen copy sorted by min price.
 */
export function validateCommissionPolicy(policy: CommissionPolicy): CommissionPolicy {
  if (policy.rateBasis !== COMMISSION_RATE_BASIS_PER_KG_MINOR) {
    throw new DomainError("INVALID_POLICY", "Only per_kg_minor rate basis is supported");
  }
  if (policy.roundingRuleId !== COMMISSION_ROUNDING_RULE_ID) {
    throw new DomainError("INVALID_POLICY", "Unsupported rounding rule identifier");
  }
  if (policy.algorithmVersion !== COMMISSION_ALGORITHM_VERSION) {
    throw new DomainError("INVALID_POLICY", "Unsupported commission algorithm version");
  }
  if (typeof policy.policyId !== "string" || policy.policyId.length === 0) {
    throw new DomainError("INVALID_POLICY", "Policy identifier is required");
  }
  if (typeof policy.versionId !== "string" || policy.versionId.length === 0) {
    throw new DomainError("INVALID_POLICY", "Version identifier is required");
  }
  if (!Array.isArray(policy.bands) || policy.bands.length === 0) {
    throw new DomainError("INVALID_POLICY", "Policy must include at least one band");
  }

  const seenIds = new Set<string>();
  const normalized: CommissionBand[] = [];

  for (const band of policy.bands) {
    if (typeof band.id !== "string" || band.id.length === 0) {
      throw new DomainError("INVALID_POLICY", "Band identifier is required");
    }
    if (seenIds.has(band.id)) {
      throw new DomainError("INVALID_POLICY", `Duplicate band identifier: ${band.id}`);
    }
    seenIds.add(band.id);

    assertSafeNonNegativeInteger(band.minPricePerKgMinor, "Band min price per kg");
    assertPositiveRate(band.ratePerKgMinor, "Band rate per kg");

    if (band.maxPricePerKgMinor !== null) {
      assertSafeNonNegativeInteger(band.maxPricePerKgMinor, "Band max price per kg");
      if (band.maxPricePerKgMinor < band.minPricePerKgMinor) {
        throw new DomainError("INVALID_POLICY", `Band ${band.id} max price is below its min price`);
      }
    }

    normalized.push({
      id: band.id,
      minPricePerKgMinor: band.minPricePerKgMinor,
      maxPricePerKgMinor: band.maxPricePerKgMinor,
      ratePerKgMinor: band.ratePerKgMinor,
    });
  }

  normalized.sort((a, b) => a.minPricePerKgMinor - b.minPricePerKgMinor);

  if (normalized[0]!.minPricePerKgMinor !== 0) {
    throw new DomainError("INVALID_POLICY", "First band must start at price 0");
  }

  const openEnded = normalized.filter((band) => band.maxPricePerKgMinor === null);
  if (openEnded.length !== 1) {
    throw new DomainError("INVALID_POLICY", "Policy must have exactly one open-ended final band");
  }
  if (normalized[normalized.length - 1]!.maxPricePerKgMinor !== null) {
    throw new DomainError("INVALID_POLICY", "Final band must be open-ended");
  }

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index]!;
    const next = normalized[index + 1]!;
    if (current.maxPricePerKgMinor === null) {
      throw new DomainError("INVALID_POLICY", "Only the final band may be open-ended");
    }
    if (next.minPricePerKgMinor !== current.maxPricePerKgMinor + 1) {
      throw new DomainError(
        "INVALID_POLICY",
        `Gap or overlap between bands ${current.id} and ${next.id}`,
      );
    }
  }

  return {
    policyId: policy.policyId,
    versionId: policy.versionId,
    rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
    roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
    algorithmVersion: COMMISSION_ALGORITHM_VERSION,
    bands: Object.freeze(normalized.map((band) => Object.freeze({ ...band }))),
  };
}

/** Select exactly one band for a selling price per kg. */
export function selectCommissionBand(
  policy: CommissionPolicy,
  sellingPricePerKgMinor: MoneyMinor,
): CommissionBand {
  const validated = validateCommissionPolicy(policy);
  assertSafeNonNegativeInteger(sellingPricePerKgMinor, "Selling price per kg");

  const matches = validated.bands.filter((band) => bandContainsPrice(band, sellingPricePerKgMinor));
  if (matches.length === 0) {
    throw new DomainError("NO_MATCHING_BAND", "No commission band matches the selling price");
  }
  if (matches.length > 1) {
    throw new DomainError(
      "MULTIPLE_MATCHING_BANDS",
      "Multiple commission bands match the selling price",
    );
  }
  return matches[0]!;
}

/** Deterministic commission calculation against an immutable validated policy. */
export function calculateCommission(
  policy: CommissionPolicy,
  input: {
    sellingPricePerKgMinor: MoneyMinor;
    netWeightHundredths: WeightHundredths;
  },
): CommissionCalculationResult {
  const validated = validateCommissionPolicy(policy);
  assertSafeNonNegativeInteger(input.sellingPricePerKgMinor, "Selling price per kg");
  assertSafeNonNegativeInteger(input.netWeightHundredths, "Net weight");

  const band = selectCommissionBand(validated, input.sellingPricePerKgMinor);
  const commissionMinor = roundMoneyTimesWeight(band.ratePerKgMinor, input.netWeightHundredths);

  return {
    policyId: validated.policyId,
    versionId: validated.versionId,
    bandId: band.id,
    selectionPricePerKgMinor: input.sellingPricePerKgMinor,
    selectionUnit: "price_per_kg_minor",
    chargeableWeightHundredths: input.netWeightHundredths,
    chargeableUnit: "weight_hundredths",
    appliedRatePerKgMinor: band.ratePerKgMinor,
    rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
    roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
    algorithmVersion: COMMISSION_ALGORITHM_VERSION,
    commissionMinor,
    currency: "LKR_PAISA",
  };
}

/**
 * Commission per kg from selling price per kg (minor units).
 * Uses the ADR reference bands (test/reference convenience only).
 * Below 200: 5; 200–400 inclusive: 15; above 400: 50.
 */
export function commissionRatePerKgMinor(
  sellingPricePerKgMinor: MoneyMinor,
): CommissionRatePerKgMinor {
  if (!Number.isSafeInteger(sellingPricePerKgMinor) || sellingPricePerKgMinor < 0) {
    throw new DomainError(
      "INVALID_PRICE",
      "Selling price per kg must be a non-negative safe integer",
    );
  }
  return selectCommissionBand(ADR_REFERENCE_COMMISSION_POLICY, sellingPricePerKgMinor)
    .ratePerKgMinor;
}

/** Commission for a bag using ADR reference bands: ratePerKg × netWeight, half-up. */
export function commissionForNetWeight(
  sellingPricePerKgMinor: MoneyMinor,
  netWeightHundredths: WeightHundredths,
): MoneyMinor {
  if (!Number.isSafeInteger(netWeightHundredths) || netWeightHundredths < 0) {
    throw new DomainError("INVALID_WEIGHT", "Net weight must be a non-negative safe integer");
  }
  return calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
    sellingPricePerKgMinor,
    netWeightHundredths,
  }).commissionMinor;
}
