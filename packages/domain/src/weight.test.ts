import { describe, expect, it } from "vitest";

import { DomainError } from "./money.js";
import { netWeightHundredths } from "./weight.js";

describe("netWeightHundredths", () => {
  it("subtracts packaging from gross (30.50 - 0.50 = 30.00)", () => {
    expect(netWeightHundredths(3_050, 50)).toBe(3_000);
  });

  it("defaults packaging to zero", () => {
    expect(netWeightHundredths(3_050)).toBe(3_050);
  });

  it("rejects packaging greater than gross", () => {
    expect(() => netWeightHundredths(100, 101)).toThrow(DomainError);
  });
});
