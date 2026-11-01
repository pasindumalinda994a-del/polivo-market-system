import { describe, expect, it } from "vitest";

import { requireAbsoluteTimestamp, RowMappingError } from "./errors.js";

describe("requireAbsoluteTimestamp", () => {
  it("accepts ISO-8601 values with an explicit offset including Z", () => {
    expect(requireAbsoluteTimestamp("2026-11-01T00:00:00.000Z", "field")).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(requireAbsoluteTimestamp("2026-11-01T10:00:00+05:30", "field")).toBe(
      "2026-11-01T10:00:00+05:30",
    );
  });

  it("rejects values that contain z without an ending offset", () => {
    // Date.parse accepts this, but the offset must be at the end.
    expect(() => requireAbsoluteTimestamp("2026-11-01T00:00:00.000zulu", "field")).toThrow(
      RowMappingError,
    );
  });
});
