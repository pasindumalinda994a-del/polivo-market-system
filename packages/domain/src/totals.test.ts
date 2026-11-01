import { describe, expect, it } from "vitest";

import { applyFarmerMoneyDeductions } from "./totals.js";

describe("applyFarmerMoneyDeductions", () => {
  it("reduces farmer settlement by transport and packaging charges", () => {
    const result = applyFarmerMoneyDeductions(2_350_000, [
      { description: "Transport", amountMinor: 20_000 },
      { description: "Packaging charge", amountMinor: 5_000 },
    ]);

    expect(result.totalDeductionsMinor).toBe(25_000);
    expect(result.farmerReceivesMinor).toBe(2_325_000);
  });
});
