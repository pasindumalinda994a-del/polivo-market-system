import { describe, expect, it } from "vitest";

import {
  createReportExportRequestSchema,
  reportCatalogResponseSchema,
  reportQuerySchema,
  reportResponseSchema,
} from "./reports.js";

describe("report contracts", () => {
  it("requires date range for activity reports", () => {
    const parsed = reportQuerySchema.safeParse({
      reportType: "sales_summary",
      filters: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("requires as-of and party for outstanding", () => {
    const missingParty = reportQuerySchema.safeParse({
      reportType: "outstanding",
      filters: { asOfBusinessDate: "2026-01-15" },
    });
    expect(missingParty.success).toBe(false);

    const ok = reportQuerySchema.safeParse({
      reportType: "outstanding",
      filters: { asOfBusinessDate: "2026-01-15", farmerId: "farmer-1" },
    });
    expect(ok.success).toBe(true);
  });

  it("parses export create request", () => {
    const parsed = createReportExportRequestSchema.parse({
      reportType: "payments",
      format: "csv",
      filters: {
        fromBusinessDate: "2026-01-01",
        toBusinessDate: "2026-01-31",
      },
      snapshotToken: "token",
    });
    expect(parsed.format).toBe("csv");
  });

  it("parses catalog envelope", () => {
    const catalog = reportCatalogResponseSchema.parse({
      definitionVersion: "1",
      items: [
        {
          reportType: "sales_summary",
          title: "Sales summary",
          description: "Gross sales",
          dateModel: "activity_range",
          supportedFilters: ["fromBusinessDate", "toBusinessDate"],
          supportedGroupings: ["none"],
          available: true,
          unavailableReason: null,
        },
      ],
    });
    expect(catalog.items).toHaveLength(1);
  });

  it("parses report response with recording cutoff", () => {
    const response = reportResponseSchema.parse({
      reportType: "sales_summary",
      definitionVersion: "1",
      scope: {
        stallId: "stall-1",
        currency: "LKR",
        weightUnit: "kg",
        businessTimezone: "UTC",
        dateModel: "activity_range",
        dateBasisLabel: "Activity",
      },
      normalizedFilters: {
        fromBusinessDate: "2026-01-01",
        toBusinessDate: "2026-01-02",
      },
      snapshot: {
        snapshotToken: "tok",
        capturedAt: "2026-01-02T00:00:00.000Z",
        expiresAt: "2026-01-02T00:30:00.000Z",
        maxPostingSequence: 1,
        dateBasis: "business_effective",
        businessTimezone: "UTC",
        recordingCutoffAt: "2026-01-02T00:00:00.000Z",
      },
      summary: { gross_sale_minor: 100 },
      rows: [],
      nextCursor: null,
      rowCountEstimate: 0,
      limitations: [],
      emptyReason: "no_activity",
    });
    expect(response.emptyReason).toBe("no_activity");
  });
});
