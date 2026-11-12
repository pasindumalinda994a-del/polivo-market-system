import { describe, expect, it } from "vitest";

/** Mirrors ReferenceCombobox request-id discard semantics. */
function shouldApplySearchResult(currentRequestId: number, responseRequestId: number): boolean {
  return currentRequestId === responseRequestId;
}

describe("search request id discard", () => {
  it("ignores stale responses after a newer request starts", () => {
    let current = 0;
    current += 1;
    const first = current;
    current += 1;
    const second = current;
    expect(shouldApplySearchResult(current, first)).toBe(false);
    expect(shouldApplySearchResult(current, second)).toBe(true);
  });
});
