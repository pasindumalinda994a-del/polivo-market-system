import { describe, expect, it } from "vitest";

import {
  activateCommissionPolicyRequestSchema,
  activeCommissionPolicyResponseSchema,
  commissionPreviewRequestSchema,
  commissionPreviewResponseSchema,
} from "./commission-policy.js";

describe("commission-policy contracts", () => {
  it("accepts a valid activate request", () => {
    const parsed = activateCommissionPolicyRequestSchema.parse({
      expectedRevision: 1,
      bands: [
        {
          minPricePerKgMinor: 0,
          maxPricePerKgMinor: 19_999,
          ratePerKgMinor: 500,
        },
        {
          id: "draft-band-2",
          minPricePerKgMinor: 20_000,
          maxPricePerKgMinor: null,
          ratePerKgMinor: 1_500,
        },
      ],
    });
    expect(parsed.bands).toHaveLength(2);
    expect(parsed.bands[0]?.id).toBeUndefined();
  });

  it("rejects zero rates", () => {
    const result = activateCommissionPolicyRequestSchema.safeParse({
      expectedRevision: 1,
      bands: [
        {
          id: "band-1",
          minPricePerKgMinor: 0,
          maxPricePerKgMinor: null,
          ratePerKgMinor: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts unconfigured and configured active responses", () => {
    expect(
      activeCommissionPolicyResponseSchema.parse({
        status: "unconfigured",
        stallId: "stall-1",
        revision: 1,
        updatedAt: "2026-11-09T08:00:00.000Z",
        activeVersion: null,
        rateBasis: "per_kg_minor",
        roundingRuleId: "half_up_money_times_weight_v1",
        algorithmVersion: "stall_default_bands_v1",
      }).status,
    ).toBe("unconfigured");
  });

  it("accepts preview request and response shapes", () => {
    expect(
      commissionPreviewRequestSchema.parse({
        sellingPricePerKgMinor: 25_000,
        netWeightHundredths: 10_000,
      }).sellingPricePerKgMinor,
    ).toBe(25_000);

    expect(
      commissionPreviewResponseSchema.parse({
        policyId: "stall-1",
        versionId: "set-1",
        versionNumber: 1,
        bandId: "band-mid",
        selectionPricePerKgMinor: 25_000,
        chargeableWeightHundredths: 10_000,
        appliedRatePerKgMinor: 1_500,
        rateBasis: "per_kg_minor",
        roundingRuleId: "half_up_money_times_weight_v1",
        algorithmVersion: "stall_default_bands_v1",
        commissionMinor: 150_000,
        explanation: "Rs 15.00/kg × 100.00 kg (half-up) = Rs 1,500.00",
        isActiveVersion: true,
      }).commissionMinor,
    ).toBe(150_000);
  });
});
