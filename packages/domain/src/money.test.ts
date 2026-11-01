import { describe, expect, it } from "vitest";

import {
  DomainError,
  moneyMinorFromMajorDecimalString,
  roundHalfUpRatio,
  roundMoneyTimesWeight,
  sumMoneyMinor,
} from "./money.js";

describe("roundHalfUpRatio", () => {
  it("rounds up when the fractional part is exactly half or more", () => {
    expect(roundHalfUpRatio(350n, 100n)).toBe(4);
    expect(roundHalfUpRatio(351n, 100n)).toBe(4);
  });

  it("rounds down when the fractional part is below half", () => {
    expect(roundHalfUpRatio(349n, 100n)).toBe(3);
  });
});

describe("roundMoneyTimesWeight", () => {
  it("computes sale amount for 100 kg at Rs. 250/kg", () => {
    // 250.00 Rs → 25000 minor; 100.00 kg → 10000 hundredths
    expect(roundMoneyTimesWeight(25_000, 10_000)).toBe(2_500_000);
  });

  it("applies half-up on the third decimal of the money result", () => {
    // 3.50 Rs/kg * 0.01 kg = 0.035 → 4 paisa
    expect(roundMoneyTimesWeight(350, 1)).toBe(4);
    // 3.49 Rs/kg * 0.01 kg = 0.0349 → 3 paisa
    expect(roundMoneyTimesWeight(349, 1)).toBe(3);
  });
});

describe("moneyMinorFromMajorDecimalString", () => {
  it("parses two-decimal major amounts", () => {
    expect(moneyMinorFromMajorDecimalString("250.00")).toBe(25_000);
    expect(moneyMinorFromMajorDecimalString("5")).toBe(500);
    expect(moneyMinorFromMajorDecimalString("0.50")).toBe(50);
  });

  it("rejects more than two fractional digits", () => {
    expect(() => moneyMinorFromMajorDecimalString("1.234")).toThrow(DomainError);
  });
});

describe("sumMoneyMinor", () => {
  it("sums rounded line amounts without re-rounding", () => {
    expect(sumMoneyMinor([100, 200, 300])).toBe(600);
  });
});
