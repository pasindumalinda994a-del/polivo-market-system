import { describe, expect, it } from "vitest";

import { summarizePublicPrices } from "./public-prices.js";

describe("summarizePublicPrices", () => {
  it("computes low, high, and average from finalized non-cancelled sales", () => {
    const summary = summarizePublicPrices([
      {
        sellingPricePerKgMinor: 20_000,
        netWeightHundredths: 10_000,
        saleAmountMinor: 2_000_000,
        cancelled: false,
      },
      {
        sellingPricePerKgMinor: 40_000,
        netWeightHundredths: 5_000,
        saleAmountMinor: 2_000_000,
        cancelled: false,
      },
      {
        sellingPricePerKgMinor: 10_000,
        netWeightHundredths: 1_000,
        saleAmountMinor: 100_000,
        cancelled: true,
      },
    ]);

    expect(summary).not.toBeNull();
    expect(summary!.lowPerKgMinor).toBe(20_000);
    expect(summary!.highPerKgMinor).toBe(40_000);
    // total value 4,000,000 / 150 kg = 26,666.666... → 26667 paisa/kg half-up
    expect(summary!.averagePerKgMinor).toBe(26_667);
    expect(summary!.totalSaleValueMinor).toBe(4_000_000);
    expect(summary!.totalNetWeightHundredths).toBe(15_000);
  });

  it("returns null when there are no eligible sales", () => {
    expect(
      summarizePublicPrices([
        { sellingPricePerKgMinor: 1, netWeightHundredths: 1, saleAmountMinor: 1, cancelled: true },
      ]),
    ).toBeNull();
  });
});
