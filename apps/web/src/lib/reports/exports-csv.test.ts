import { describe, expect, it } from "vitest";

import { buildReportCsv } from "@polivo/domain";

describe("buildReportCsv via web export path", () => {
  it("neutralizes spreadsheet formula injection in cells", () => {
    const csv = buildReportCsv({
      reportType: "sales_summary",
      title: "Sales",
      stallId: "stall-1",
      dateBasisLabel: "Business date",
      fromBusinessDate: "2026-11-01",
      toBusinessDate: "2026-11-02",
      asOfBusinessDate: null,
      recordingCutoffAt: "2026-11-02T00:00:00.000Z",
      currency: "LKR",
      weightUnit: "kg",
      definitionVersion: "1",
      columns: [{ key: "label", header: "label" }],
      rows: [{ label: "=1+1" }],
    });
    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/^=1\+1/m);
  });
});