import { describe, expect, it } from "vitest";

import { DomainError } from "./money.js";
import {
  FARMER_BILL_MAX_LINES,
  aggregateFarmerBillSourceLines,
  buildFarmerBillSelectionFingerprintMaterial,
  type FarmerBillSourceLineSnapshot,
} from "./farmer-bill-aggregation.js";

function line(
  overrides: Partial<FarmerBillSourceLineSnapshot> &
    Pick<FarmerBillSourceLineSnapshot, "saleLineId">,
): FarmerBillSourceLineSnapshot {
  return {
    farmerId: "farmer-1",
    currency: "LKR",
    packageCount: 2,
    netWeightHundredths: 1000,
    saleAmountMinor: 10_000,
    commissionAmountMinor: 500,
    farmerReceivesMinor: 9_500,
    ...overrides,
  };
}

describe("aggregateFarmerBillSourceLines", () => {
  it("sums exact stored snapshots across multiple lines", () => {
    const result = aggregateFarmerBillSourceLines([
      line({
        saleLineId: "line-b",
        packageCount: 1,
        netWeightHundredths: 500,
        saleAmountMinor: 4_000,
        commissionAmountMinor: 200,
        farmerReceivesMinor: 3_800,
      }),
      line({
        saleLineId: "line-a",
        packageCount: 3,
        netWeightHundredths: 1500,
        saleAmountMinor: 12_000,
        commissionAmountMinor: 600,
        farmerReceivesMinor: 11_400,
      }),
    ]);

    expect(result.lineCount).toBe(2);
    expect(result.totalPackageCount).toBe(4);
    expect(result.totalNetWeightHundredths).toBe(2000);
    expect(result.totalSaleAmountMinor).toBe(16_000);
    expect(result.totalCommissionMinor).toBe(800);
    expect(result.totalFarmerReceivesMinor).toBe(15_200);
    expect(result.sourceLineIds).toEqual(["line-a", "line-b"]);
  });

  it("preserves different commission amounts without recomputation", () => {
    const result = aggregateFarmerBillSourceLines([
      line({
        saleLineId: "line-1",
        saleAmountMinor: 10_000,
        commissionAmountMinor: 400,
        farmerReceivesMinor: 9_600,
      }),
      line({
        saleLineId: "line-2",
        saleAmountMinor: 10_000,
        commissionAmountMinor: 750,
        farmerReceivesMinor: 9_250,
      }),
    ]);

    expect(result.totalCommissionMinor).toBe(1_150);
    expect(result.totalFarmerReceivesMinor).toBe(18_850);
  });

  it("rejects duplicate source line ids", () => {
    expect(() =>
      aggregateFarmerBillSourceLines([
        line({ saleLineId: "line-1" }),
        line({ saleLineId: "line-1" }),
      ]),
    ).toThrow(DomainError);
  });

  it("rejects mixed farmers", () => {
    expect(() =>
      aggregateFarmerBillSourceLines([
        line({ saleLineId: "line-1", farmerId: "farmer-1" }),
        line({ saleLineId: "line-2", farmerId: "farmer-2" }),
      ]),
    ).toThrow(/same farmer/);
  });

  it("rejects empty and oversized selections", () => {
    expect(() => aggregateFarmerBillSourceLines([])).toThrow(/at least one/);
    const oversized = Array.from({ length: FARMER_BILL_MAX_LINES + 1 }, (_, index) =>
      line({ saleLineId: `line-${index}` }),
    );
    expect(() => aggregateFarmerBillSourceLines(oversized)).toThrow(/At most/);
  });
});

describe("buildFarmerBillSelectionFingerprintMaterial", () => {
  it("is stable for the same sorted selection", () => {
    const aggregation = aggregateFarmerBillSourceLines([
      line({ saleLineId: "line-b" }),
      line({ saleLineId: "line-a" }),
    ]);
    const material = buildFarmerBillSelectionFingerprintMaterial({
      farmerId: "farmer-1",
      businessDate: "2026-11-10",
      aggregation,
    });
    expect(material).toContain("line-a");
    expect(material.indexOf("line-a")).toBeLessThan(material.indexOf("line-b"));
    expect(material).toContain("19000");
  });
});
