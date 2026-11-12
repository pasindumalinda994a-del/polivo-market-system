import { describe, expect, it } from "vitest";

import {
  createSaleDraftRequestSchema,
  finalizeSaleRequestSchema,
  saleDraftLineInputSchema,
  traderBillRecordSchema,
} from "./sales-billing.js";

describe("sales-billing contracts", () => {
  it("accepts a valid draft line with package weights", () => {
    const parsed = saleDraftLineInputSchema.parse({
      farmerId: "farmer-1",
      vegetableId: "veg-1",
      packageTypeId: "pkg-1",
      unitPricePerKgMinor: 25_000,
      weights: {
        rows: [{ rowKey: "a", grossWeightHundredths: 2550 }],
        packagingWeightHundredths: 0,
      },
    });
    expect(parsed.unitPricePerKgMinor).toBe(25_000);
  });

  it("rejects client-provided totals on create", () => {
    const result = createSaleDraftRequestSchema.safeParse({
      traderId: "trader-1",
      totalAmountMinor: 100,
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it("requires a SHA-256 fingerprint on finalize", () => {
    expect(
      finalizeSaleRequestSchema.safeParse({
        expectedRevision: 1,
        expectedCalculationFingerprint: "not-a-hash",
      }).success,
    ).toBe(false);

    expect(
      finalizeSaleRequestSchema.safeParse({
        expectedRevision: 1,
        expectedCalculationFingerprint: "a".repeat(64),
      }).success,
    ).toBe(true);
  });

  it("requires trader bill type and T- number shape", () => {
    const result = traderBillRecordSchema.safeParse({
      id: "bill-1",
      stallId: "stall-1",
      saleId: "sale-1",
      traderId: "trader-1",
      traderShortCode: "T1",
      traderDisplayName: "Buyer",
      billType: "trader",
      billNumber: "T-444444",
      businessDate: "2026-11-10",
      status: "finalized",
      totalAmountMinor: 100,
      paymentStatus: "unpaid",
      commissionPolicyId: "policy-1",
      commissionVersionId: "version-1",
      calculationFingerprint: "b".repeat(64),
      lines: [],
      totalCommissionMinor: 0,
      totalFarmerReceivesBeforeDeductionsMinor: 100,
      postingId: "posting-1",
      finalizedAt: "2026-11-10T10:00:00.000Z",
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-10T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
