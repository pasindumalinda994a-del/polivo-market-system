import { describe, expect, it } from "vitest";

import { ADR_REFERENCE_COMMISSION_POLICY } from "./commission.js";
import {
  buildSaleCalculationFingerprintMaterial,
  calculateSaleBillWithPolicy,
  calculateSaleLineWithPolicy,
  validateSaleBillForFinalization,
} from "./sale-calculation.js";
import { DomainError } from "./money.js";

describe("calculateSaleLineWithPolicy", () => {
  it("matches the confirmed 100 kg @ Rs. 250/kg example with unequal bags summed once", () => {
    const result = calculateSaleLineWithPolicy(ADR_REFERENCE_COMMISSION_POLICY, {
      farmerId: "farmer-1",
      vegetableId: "veg-1",
      packageTypeId: "pkg-1",
      unitPricePerKgMinor: 25_000,
      weights: {
        rows: [
          { rowKey: "a", grossWeightHundredths: 4_000 },
          { rowKey: "b", grossWeightHundredths: 6_000 },
        ],
      },
    });

    expect(result.netWeightHundredths).toBe(10_000);
    expect(result.packageCount).toBe(2);
    expect(result.traderPaysMinor).toBe(2_500_000);
    expect(result.commission.commissionMinor).toBe(150_000);
    expect(result.commission.bandId).toBe("adr-ref-200-400");
    expect(result.farmerReceivesBeforeDeductionsMinor).toBe(2_350_000);
  });

  it("applies packaging deduction before money and commission", () => {
    const result = calculateSaleLineWithPolicy(ADR_REFERENCE_COMMISSION_POLICY, {
      farmerId: "farmer-1",
      vegetableId: "veg-1",
      packageTypeId: "pkg-1",
      unitPricePerKgMinor: 25_000,
      weights: {
        rows: [{ rowKey: "a", grossWeightHundredths: 3_050 }],
        packagingWeightHundredths: 50,
      },
    });
    expect(result.netWeightHundredths).toBe(3_000);
    expect(result.saleAmountMinor).toBe(750_000);
  });

  it("rejects incomplete weights", () => {
    expect(() =>
      calculateSaleLineWithPolicy(ADR_REFERENCE_COMMISSION_POLICY, {
        farmerId: "farmer-1",
        vegetableId: "veg-1",
        packageTypeId: "pkg-1",
        unitPricePerKgMinor: 25_000,
        weights: { rows: [] },
      }),
    ).toThrow(DomainError);
  });
});

describe("calculateSaleBillWithPolicy", () => {
  it("supports multiple farmers and vegetables on one bill", () => {
    const bill = calculateSaleBillWithPolicy(ADR_REFERENCE_COMMISSION_POLICY, [
      {
        lineId: "l1",
        farmerId: "farmer-a",
        vegetableId: "veg-carrot",
        packageTypeId: "pkg-1",
        unitPricePerKgMinor: 25_000,
        weights: { rows: [{ rowKey: "1", grossWeightHundredths: 10_000 }] },
      },
      {
        lineId: "l2",
        farmerId: "farmer-b",
        vegetableId: "veg-beans",
        packageTypeId: "pkg-1",
        unitPricePerKgMinor: 15_000,
        weights: { rows: [{ rowKey: "1", grossWeightHundredths: 2_000 }] },
      },
    ]);

    expect(bill.totalTraderPaysMinor).toBe(2_500_000 + 300_000);
    expect(bill.totalCommissionMinor).toBe(150_000 + 10_000);
    expect(bill.farmerEntitlements.get("farmer-a")).toBe(2_350_000);
    expect(bill.farmerEntitlements.get("farmer-b")).toBe(290_000);
    expect(bill.versionId).toBe(ADR_REFERENCE_COMMISSION_POLICY.versionId);
  });

  it("blocks missing policy in readiness validation", () => {
    const result = validateSaleBillForFinalization(null, [
      {
        farmerId: "farmer-1",
        vegetableId: "veg-1",
        packageTypeId: "pkg-1",
        unitPricePerKgMinor: 25_000,
        weights: { rows: [{ rowKey: "1", grossWeightHundredths: 100 }] },
      },
    ]);
    expect(result.ready).toBe(false);
    expect(result.issues.some((issue) => issue.code === "MISSING_COMMISSION_POLICY")).toBe(true);
  });
});

describe("buildSaleCalculationFingerprintMaterial", () => {
  it("changes when commission version changes", () => {
    const line = calculateSaleLineWithPolicy(ADR_REFERENCE_COMMISSION_POLICY, {
      lineId: "l1",
      farmerId: "farmer-1",
      vegetableId: "veg-1",
      packageTypeId: "pkg-1",
      unitPricePerKgMinor: 25_000,
      weights: { rows: [{ rowKey: "1", grossWeightHundredths: 100 }] },
    });
    const base = {
      draftRevision: 1,
      policyId: "p1",
      versionId: "v1",
      traderId: "t1",
      businessDate: "2026-11-10",
      lines: [line],
    };
    const a = buildSaleCalculationFingerprintMaterial(base);
    const b = buildSaleCalculationFingerprintMaterial({ ...base, versionId: "v2" });
    expect(a).not.toBe(b);
  });
});
