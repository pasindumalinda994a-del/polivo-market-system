import { describe, expect, it } from "vitest";

import { assertSafeReportIpcPayload } from "./reports.js";

describe("report IPC safety", () => {
  it("rejects privileged fields from renderer payloads", () => {
    expect(() => assertSafeReportIpcPayload({ html: "<b>x</b>" })).toThrow(/html/);
    expect(() => assertSafeReportIpcPayload({ url: "https://evil" })).toThrow(/url/);
    expect(() => assertSafeReportIpcPayload({ path: "C:\\\\temp" })).toThrow(/path/);
    expect(() => assertSafeReportIpcPayload({ filePath: "/tmp/x" })).toThrow(/filePath/);
    expect(() => assertSafeReportIpcPayload({ shellCommand: "rm" })).toThrow(/shellCommand/);
  });

  it("allows typed export job references", () => {
    expect(() =>
      assertSafeReportIpcPayload({
        exportJobId: "job-1",
        defaultFileName: "polivo-sales-summary-2026-01-01.csv",
      }),
    ).not.toThrow();
  });
});
