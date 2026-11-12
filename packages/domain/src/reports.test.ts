import { describe, expect, it } from "vitest";

import {
  assertDateRangeWithinLimit,
  assertFiltersAllowed,
  buildReportCsv,
  buildVegetablePriceDay,
  createReportSnapshotPayload,
  decodeReportSnapshotToken,
  encodeReportSnapshotToken,
  fingerprintReportFilters,
  neutralizeCsvFormulaCell,
  serializeCsvCell,
} from "./reports.js";
import { DomainError } from "./money.js";

describe("report filters and snapshots", () => {
  it("rejects unsupported filters", () => {
    expect(() =>
      assertFiltersAllowed("sales_summary", { paymentMethod: "cash" }),
    ).toThrow(DomainError);
  });

  it("fingerprints filters stably", () => {
    const a = fingerprintReportFilters({ fromBusinessDate: "2026-01-01", toBusinessDate: "2026-01-02" });
    const b = fingerprintReportFilters({ toBusinessDate: "2026-01-02", fromBusinessDate: "2026-01-01" });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it("round-trips snapshot tokens", () => {
    const payload = createReportSnapshotPayload({
      stallId: "stall-1",
      reportType: "sales_summary",
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-31",
      asOfBusinessDate: null,
      filterFingerprint: "abc",
      watermarks: {
        maxPostingSequence: 3,
        maxAllocationCreatedAt: "2026-01-01T00:00:00.000Z",
        maxAllocationId: "a1",
        maxPaymentRecordedAt: "2026-01-01T00:00:00.000Z",
        maxPaymentId: "p1",
      },
      capturedAt: "2026-01-15T12:00:00.000Z",
    });
    const token = encodeReportSnapshotToken(payload);
    expect(decodeReportSnapshotToken(token)).toEqual(payload);
  });

  it("enforces date range limit", () => {
    expect(() => assertDateRangeWithinLimit("2025-01-01", "2026-12-31", 366)).toThrow(
      DomainError,
    );
  });
});

describe("vegetable price carry-forward", () => {
  it("establishes min/max/avg from first sales and carries forward", () => {
    const day1 = buildVegetablePriceDay({
      vegetableId: "veg-1",
      businessDate: "2026-01-01",
      sales: [
        {
          sellingPricePerKgMinor: 10000,
          netWeightHundredths: 10000,
          saleAmountMinor: 1000000,
          cancelled: false,
        },
        {
          sellingPricePerKgMinor: 12000,
          netWeightHundredths: 5000,
          saleAmountMinor: 600000,
          cancelled: false,
        },
      ],
      prior: null,
    });
    expect(day1.minPerKgMinor).toBe(10000);
    expect(day1.maxPerKgMinor).toBe(12000);
    expect(day1.avgPerKgMinor).not.toBeNull();
    expect(day1.carriedForward).toBe(false);

    const day2 = buildVegetablePriceDay({
      vegetableId: "veg-1",
      businessDate: "2026-01-02",
      sales: [],
      prior: day1,
    });
    expect(day2.carriedForward).toBe(true);
    expect(day2.eligibleLineCount).toBe(0);
    expect(day2.soldWeightHundredths).toBe(0);
    expect(day2.observationDate).toBe("2026-01-01");
    expect(day2.minPerKgMinor).toBe(10000);

    const day3 = buildVegetablePriceDay({
      vegetableId: "veg-1",
      businessDate: "2026-01-03",
      sales: [],
      prior: null,
    });
    expect(day3.priceUnavailable).toBe(true);
    expect(day3.minPerKgMinor).toBeNull();
  });
});

describe("csv export safety", () => {
  it("neutralizes formula injection without rewriting typed negatives as text formulas", () => {
    expect(neutralizeCsvFormulaCell("=cmd")).toBe("'=cmd");
    expect(neutralizeCsvFormulaCell("+123")).toBe("'+123");
    expect(neutralizeCsvFormulaCell("@sum")).toBe("'@sum");
    expect(serializeCsvCell(-500)).toBe("-500");
    expect(serializeCsvCell("hello, \"world\"")).toBe('"hello, ""world"""');
  });

  it("includes Sinhala and metadata in CSV", () => {
    const csv = buildReportCsv({
      reportType: "sales_summary",
      title: "Sales summary",
      stallId: "stall-1",
      dateBasisLabel: "Activity",
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-02",
      asOfBusinessDate: null,
      recordingCutoffAt: "2026-01-02T10:00:00.000Z",
      currency: "LKR",
      weightUnit: "kg",
      definitionVersion: "1",
      columns: [
        { key: "label", header: "label" },
        { key: "amount", header: "amount" },
      ],
      rows: [{ label: "කැරට්", amount: 12345 }],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("කැරට්");
    expect(csv).toContain("polivo_report_manifest_v1");
    expect(csv).toContain("recording_cutoff_at=");
  });
});
