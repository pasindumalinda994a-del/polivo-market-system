import { describe, expect, it } from "vitest";

import {
  moneyMinorFromSqliteInteger,
  moneyMinorToSqliteInteger,
  NumericPersistenceError,
  weightHundredthsFromSqliteInteger,
  weightHundredthsToSqliteInteger,
} from "./numeric.js";

describe("numeric adapters", () => {
  it("accepts safe integer money and weight values", () => {
    expect(moneyMinorToSqliteInteger(100)).toBe(100);
    expect(moneyMinorFromSqliteInteger(100)).toBe(100);
    expect(weightHundredthsToSqliteInteger(2550)).toBe(2550);
    expect(weightHundredthsFromSqliteInteger(2550)).toBe(2550);
  });

  it("rejects non-integers and negative weights", () => {
    expect(() => moneyMinorToSqliteInteger(1.5)).toThrow(NumericPersistenceError);
    expect(() => weightHundredthsToSqliteInteger(-1)).toThrow(/non-negative/);
  });

  it("rejects unsafe number coercion", () => {
    expect(() => moneyMinorToSqliteInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });
});
