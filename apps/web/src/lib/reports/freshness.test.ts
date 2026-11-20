import { describe, expect, it } from "vitest";

import { mapReportingFreshness } from "./freshness";

describe("mapReportingFreshness", () => {
  it("labels empty tenants as no_data", () => {
    const result = mapReportingFreshness({
      lastHostContactAt: null,
      lastAppliedUploadGroupId: null,
      lastAppliedUploadAt: null,
      committedCloudCursor: 0,
      committedCloudCursorObservedAt: null,
      appliedMaxPostingSequence: 0,
      hasAnyAppliedData: false,
    });
    expect(result.label).toBe("no_data");
    expect(result.title.toLowerCase()).not.toContain("live");
  });

  it("uses through_cutoff when applied upload exists", () => {
    const now = Date.parse("2026-11-19T12:00:00.000Z");
    const result = mapReportingFreshness(
      {
        lastHostContactAt: "2026-11-19T11:00:00.000Z",
        lastAppliedUploadGroupId: "g-1",
        lastAppliedUploadAt: "2026-11-19T10:30:00.000Z",
        committedCloudCursor: 3,
        committedCloudCursorObservedAt: "2026-11-19T10:30:00.000Z",
        appliedMaxPostingSequence: 42,
        hasAnyAppliedData: true,
      },
      now,
    );
    expect(result.label).toBe("through_cutoff");
    expect(result.title).toContain("Cloud data through");
  });
});