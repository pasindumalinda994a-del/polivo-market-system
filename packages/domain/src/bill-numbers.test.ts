import { describe, expect, it } from "vitest";

import {
  formatBillNumber,
  isFarmerBillNumber,
  isTraderBillNumber,
  parseBillNumber,
} from "./bill-numbers.js";

describe("bill numbers", () => {
  it("formats confirmed example sequences", () => {
    expect(formatBillNumber("farmer", 111_111)).toBe("F-111111");
    expect(formatBillNumber("trader", 444_444)).toBe("T-444444");
  });

  it("parses and validates prefixes", () => {
    expect(isFarmerBillNumber("F-111112")).toBe(true);
    expect(isTraderBillNumber("T-444445")).toBe(true);
    expect(parseBillNumber("F-111111")).toEqual({ type: "farmer", sequence: 111_111 });
    expect(parseBillNumber("T-444444")).toEqual({ type: "trader", sequence: 444_444 });
  });
});
