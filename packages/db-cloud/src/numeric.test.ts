import { describe, expect, it } from "vitest";

import {
  CloudNumericError,
  moneyMinorFromPg,
  moneyMinorRoundTripFromSqlite,
  moneyMinorToPgString,
  weightHundredthsFromPg,
  weightHundredthsRoundTripFromSqlite,
  weightHundredthsToPgString,
} from "./numeric.js";

describe("cloud exact numeric mapping", () => {
  it("round-trips SQLite money integers through PG string transport", () => {
    expect(moneyMinorToPgString(12_550)).toBe("12550");
    expect(moneyMinorFromPg("12550")).toBe(12_550);
    expect(moneyMinorRoundTripFromSqlite(12_550)).toBe(12_550);
    expect(moneyMinorRoundTripFromSqlite(-500n)).toBe(-500);
  });

  it("round-trips SQLite weight hundredths through PG string transport", () => {
    expect(weightHundredthsToPgString(2_550)).toBe("2550");
    expect(weightHundredthsFromPg("2550")).toBe(2_550);
    expect(weightHundredthsRoundTripFromSqlite(2_550)).toBe(2_550);
  });

  it("rejects floating-point and invalid strings", () => {
    expect(() => moneyMinorToPgString(1.5 as unknown as number)).toThrow(CloudNumericError);
    expect(() => moneyMinorFromPg("12.5")).toThrow(CloudNumericError);
    expect(() => moneyMinorFromPg("1e2")).toThrow(CloudNumericError);
    expect(() => weightHundredthsToPgString(-1)).toThrow(CloudNumericError);
  });

  it("rejects values outside Number.MAX_SAFE_INTEGER when decoding to number", () => {
    const tooLarge = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    expect(() => moneyMinorFromPg(tooLarge)).toThrow(CloudNumericError);
  });
});
