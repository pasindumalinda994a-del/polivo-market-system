import { describe, expect, it } from "vitest";

import {
  ADR_REFERENCE_COMMISSION_POLICY,
  calculateCommission,
  commissionForNetWeight,
  commissionRatePerKgMinor,
  selectCommissionBand,
  validateCommissionPolicy,
  type CommissionBand,
  type CommissionPolicy,
} from "./commission.js";
import { DomainError } from "./money.js";

/** Synthetic TEST-ONLY bands — not production seeds. */
function syntheticPolicy(bands: CommissionBand[]): CommissionPolicy {
  return {
    policyId: "test-policy",
    versionId: "test-version",
    rateBasis: "per_kg_minor",
    roundingRuleId: "half_up_money_times_weight_v1",
    algorithmVersion: "stall_default_bands_v1",
    bands,
  };
}

describe("commissionRatePerKgMinor (ADR reference)", () => {
  it("uses Rs. 5 below Rs. 200/kg", () => {
    expect(commissionRatePerKgMinor(19_999)).toBe(500);
  });

  it("uses Rs. 15 at exactly Rs. 200/kg and Rs. 400/kg", () => {
    expect(commissionRatePerKgMinor(20_000)).toBe(1_500);
    expect(commissionRatePerKgMinor(25_000)).toBe(1_500);
    expect(commissionRatePerKgMinor(40_000)).toBe(1_500);
  });

  it("uses Rs. 50 above Rs. 400/kg", () => {
    expect(commissionRatePerKgMinor(40_001)).toBe(5_000);
  });
});

describe("commissionForNetWeight (ADR reference)", () => {
  it("matches the 100 kg at Rs. 250/kg example", () => {
    expect(commissionForNetWeight(25_000, 10_000)).toBe(150_000);
  });
});

describe("validateCommissionPolicy", () => {
  it("accepts the ADR reference policy", () => {
    const validated = validateCommissionPolicy(ADR_REFERENCE_COMMISSION_POLICY);
    expect(validated.bands).toHaveLength(3);
    expect(validated.bands[0]!.minPricePerKgMinor).toBe(0);
    expect(validated.bands[2]!.maxPricePerKgMinor).toBeNull();
  });

  it("rejects empty bands", () => {
    expect(() => validateCommissionPolicy(syntheticPolicy([]))).toThrow(DomainError);
    expect(() => validateCommissionPolicy(syntheticPolicy([]))).toThrow(/at least one band/i);
  });

  it("rejects duplicate band ids", () => {
    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 0, maxPricePerKgMinor: 100, ratePerKgMinor: 100 },
          { id: "a", minPricePerKgMinor: 101, maxPricePerKgMinor: null, ratePerKgMinor: 200 },
        ]),
      ),
    ).toThrow(/Duplicate band/i);
  });

  it("rejects zero and negative rates", () => {
    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 0, maxPricePerKgMinor: null, ratePerKgMinor: 0 },
        ]),
      ),
    ).toThrow(/positive/i);
  });

  it("rejects gaps and overlaps", () => {
    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 0, maxPricePerKgMinor: 100, ratePerKgMinor: 100 },
          { id: "b", minPricePerKgMinor: 102, maxPricePerKgMinor: null, ratePerKgMinor: 200 },
        ]),
      ),
    ).toThrow(/Gap or overlap/i);

    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 0, maxPricePerKgMinor: 100, ratePerKgMinor: 100 },
          { id: "b", minPricePerKgMinor: 100, maxPricePerKgMinor: null, ratePerKgMinor: 200 },
        ]),
      ),
    ).toThrow(/Gap or overlap/i);
  });

  it("rejects policies that do not start at zero", () => {
    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 1, maxPricePerKgMinor: null, ratePerKgMinor: 100 },
        ]),
      ),
    ).toThrow(/start at price 0/i);
  });

  it("rejects missing open-ended final band", () => {
    expect(() =>
      validateCommissionPolicy(
        syntheticPolicy([
          { id: "a", minPricePerKgMinor: 0, maxPricePerKgMinor: 100, ratePerKgMinor: 100 },
        ]),
      ),
    ).toThrow(/open-ended/i);
  });
});

describe("selectCommissionBand boundaries", () => {
  const policy = ADR_REFERENCE_COMMISSION_POLICY;

  it("selects around the Rs. 200 threshold", () => {
    expect(selectCommissionBand(policy, 19_999).ratePerKgMinor).toBe(500);
    expect(selectCommissionBand(policy, 20_000).ratePerKgMinor).toBe(1_500);
    expect(selectCommissionBand(policy, 20_001).ratePerKgMinor).toBe(1_500);
  });

  it("selects around the Rs. 400 threshold", () => {
    expect(selectCommissionBand(policy, 39_999).ratePerKgMinor).toBe(1_500);
    expect(selectCommissionBand(policy, 40_000).ratePerKgMinor).toBe(1_500);
    expect(selectCommissionBand(policy, 40_001).ratePerKgMinor).toBe(5_000);
  });
});

describe("calculateCommission", () => {
  it("returns a structured reproducible result", () => {
    const result = calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
      sellingPricePerKgMinor: 25_000,
      netWeightHundredths: 10_000,
    });
    expect(result.commissionMinor).toBe(150_000);
    expect(result.bandId).toBe("adr-ref-200-400");
    expect(result.appliedRatePerKgMinor).toBe(1_500);
    expect(result.roundingRuleId).toBe("half_up_money_times_weight_v1");
    expect(result.currency).toBe("LKR_PAISA");
  });

  it("is deterministic across repeated calls", () => {
    const a = calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
      sellingPricePerKgMinor: 40_001,
      netWeightHundredths: 2_550,
    });
    const b = calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
      sellingPricePerKgMinor: 40_001,
      netWeightHundredths: 2_550,
    });
    expect(a).toEqual(b);
    // Independently: 50.00 * 25.50 = 1275.00 → 127_500 paisa
    expect(a.commissionMinor).toBe(127_500);
  });

  it("rejects negative price and weight", () => {
    expect(() =>
      calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
        sellingPricePerKgMinor: -1,
        netWeightHundredths: 100,
      }),
    ).toThrow(DomainError);
    expect(() =>
      calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
        sellingPricePerKgMinor: 100,
        netWeightHundredths: -1,
      }),
    ).toThrow(DomainError);
  });

  it("applies half-up around rounding boundaries", () => {
    // rate 500 paisa/kg * 1 hundredth kg = 5 / 100 → 0.05 → rounds to 0 or 1?
    // 500 * 1 / 100 = 5 exactly → 5
    expect(
      calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
        sellingPricePerKgMinor: 100,
        netWeightHundredths: 1,
      }).commissionMinor,
    ).toBe(5);

    // 1500 * 1 / 100 = 15
    expect(
      calculateCommission(ADR_REFERENCE_COMMISSION_POLICY, {
        sellingPricePerKgMinor: 20_000,
        netWeightHundredths: 1,
      }).commissionMinor,
    ).toBe(15);
  });
});
