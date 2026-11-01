import { describe, expect, it } from "vitest";

import { commissionForNetWeight, commissionRatePerKgMinor } from "./commission.js";

describe("commissionRatePerKgMinor", () => {
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

describe("commissionForNetWeight", () => {
  it("matches the 100 kg at Rs. 250/kg example", () => {
    expect(commissionForNetWeight(25_000, 10_000)).toBe(150_000);
  });
});
