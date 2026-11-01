import { describe, expect, it } from "vitest";

import { calculateSaleLine } from "./sale-line.js";
import { totalSaleLines } from "./totals.js";

describe("calculateSaleLine", () => {
  it("matches the confirmed 100 kg @ Rs. 250/kg example", () => {
    const result = calculateSaleLine({
      grossWeightHundredths: 10_000,
      sellingPricePerKgMinor: 25_000,
    });

    expect(result.netWeightHundredths).toBe(10_000);
    expect(result.traderPaysMinor).toBe(2_500_000);
    expect(result.commissionMinor).toBe(150_000);
    expect(result.farmerReceivesBeforeDeductionsMinor).toBe(2_350_000);
  });

  it("uses net weight after packaging", () => {
    const result = calculateSaleLine({
      grossWeightHundredths: 3_050,
      packagingWeightHundredths: 50,
      sellingPricePerKgMinor: 25_000,
    });
    expect(result.netWeightHundredths).toBe(3_000);
    expect(result.saleAmountMinor).toBe(750_000);
  });
});

describe("totalSaleLines", () => {
  it("rounds each bag then sums", () => {
    const totals = totalSaleLines([
      { grossWeightHundredths: 1_000, sellingPricePerKgMinor: 25_000 },
      { grossWeightHundredths: 2_500, sellingPricePerKgMinor: 25_000 },
    ]);

    expect(totals.lines).toHaveLength(2);
    expect(totals.totalSaleAmountMinor).toBe(250_000 + 625_000);
    expect(totals.totalCommissionMinor).toBe(15_000 + 37_500);
    expect(totals.totalTraderPaysMinor).toBe(totals.totalSaleAmountMinor);
  });
});
