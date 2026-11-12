import { describe, expect, it } from "vitest";

/**
 * Statement UI must ignore responses after the party/date generation advances
 * (logout, party switch, or filter apply). This mirrors AccountStatementPanel's
 * requestGen guard without mounting Electron.
 */
function shouldApplyStatementResponse(activeGeneration: number, responseGeneration: number): boolean {
  return activeGeneration === responseGeneration;
}

describe("account statement stale response guard", () => {
  it("applies only matching generation responses", () => {
    expect(shouldApplyStatementResponse(3, 3)).toBe(true);
    expect(shouldApplyStatementResponse(4, 3)).toBe(false);
  });

  it("treats party or date switches as a new generation", () => {
    let generation = 1;
    generation += 1; // party switch
    expect(shouldApplyStatementResponse(generation, 1)).toBe(false);
    generation += 1; // apply filters
    expect(shouldApplyStatementResponse(generation, generation)).toBe(true);
  });
});
