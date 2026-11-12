import { describe, expect, it } from "vitest";

import {
  summarizePackageWeightEntry,
  summarizeValidatedPackageWeights,
  weightHundredthsFromMajorDecimalString,
  weightHundredthsToMajorDecimalString,
} from "./package-weights.js";

describe("weightHundredthsFromMajorDecimalString", () => {
  it("parses approved two-decimal weights", () => {
    expect(weightHundredthsFromMajorDecimalString("32.00")).toBe(3200);
    expect(weightHundredthsFromMajorDecimalString("28.50")).toBe(2850);
    expect(weightHundredthsFromMajorDecimalString("19.25")).toBe(1925);
    expect(weightHundredthsFromMajorDecimalString("0")).toBe(0);
    expect(weightHundredthsFromMajorDecimalString("0.00")).toBe(0);
  });

  it("rejects negatives and excess precision", () => {
    expect(() => weightHundredthsFromMajorDecimalString("-1")).toThrow();
    expect(() => weightHundredthsFromMajorDecimalString("12.345")).toThrow();
  });

  it("round-trips through formatting", () => {
    expect(weightHundredthsToMajorDecimalString(7975)).toBe("79.75");
    expect(weightHundredthsFromMajorDecimalString(weightHundredthsToMajorDecimalString(1925))).toBe(
      1925,
    );
  });
});

describe("summarizePackageWeightEntry", () => {
  it("sums the synthetic unequal package fixture without multiplying by count", () => {
    const summary = summarizePackageWeightEntry({
      rows: [
        { rowKey: "1", weightText: "32.00" },
        { rowKey: "2", weightText: "28.50" },
        { rowKey: "3", weightText: "19.25" },
      ],
    });
    expect(summary.status).toBe("complete");
    expect(summary.packageCount).toBe(3);
    expect(summary.grossWeightHundredths).toBe(7975);
    expect(summary.netWeightHundredths).toBe(7975);
    expect(summary.unit).toBe("kg");
  });

  it("recalculates after edits and removals", () => {
    const edited = summarizePackageWeightEntry({
      rows: [
        { rowKey: "1", weightText: "32.00" },
        { rowKey: "2", weightText: "30.00" },
        { rowKey: "3", weightText: "19.25" },
      ],
    });
    expect(edited.grossWeightHundredths).toBe(8125);

    const removed = summarizePackageWeightEntry({
      rows: [
        { rowKey: "1", weightText: "32.00" },
        { rowKey: "2", weightText: "30.00" },
      ],
    });
    expect(removed.packageCount).toBe(2);
    expect(removed.grossWeightHundredths).toBe(6200);
  });

  it("treats empty and partial drafts as incomplete, not zero", () => {
    const empty = summarizePackageWeightEntry({
      rows: [{ rowKey: "1", weightText: "" }],
    });
    expect(empty.status).toBe("incomplete");
    expect(empty.rows).toEqual([]);

    const partial = summarizePackageWeightEntry({
      rows: [{ rowKey: "1", weightText: "12." }],
    });
    expect(partial.status).toBe("incomplete");
  });

  it("ignores trailing empty draft rows after Enter-to-add", () => {
    const summary = summarizePackageWeightEntry({
      rows: [
        { rowKey: "1", weightText: "32.00" },
        { rowKey: "2", weightText: "28.50" },
        { rowKey: "3", weightText: "" },
      ],
    });
    expect(summary.status).toBe("complete");
    expect(summary.packageCount).toBe(2);
    expect(summary.grossWeightHundredths).toBe(6050);
  });

  it("allows explicit zero and rejects negatives, excess precision, and duplicates", () => {
    expect(
      summarizePackageWeightEntry({ rows: [{ rowKey: "1", weightText: "0.00" }] }).status,
    ).toBe("complete");
    expect(summarizePackageWeightEntry({ rows: [{ rowKey: "1", weightText: "-1" }] }).status).toBe(
      "invalid",
    );
    expect(
      summarizePackageWeightEntry({ rows: [{ rowKey: "1", weightText: "1.234" }] }).status,
    ).toBe("invalid");
    expect(
      summarizePackageWeightEntry({
        rows: [
          { rowKey: "1", weightText: "1.00" },
          { rowKey: "1", weightText: "2.00" },
        ],
      }).status,
    ).toBe("invalid");
  });

  it("applies explicit packaging and rejects packaging above gross", () => {
    const ok = summarizePackageWeightEntry({
      rows: [{ rowKey: "1", weightText: "30.50" }],
      packagingWeightText: "0.50",
    });
    expect(ok.status).toBe("complete");
    expect(ok.netWeightHundredths).toBe(3000);

    const bad = summarizePackageWeightEntry({
      rows: [{ rowKey: "1", weightText: "1.00" }],
      packagingWeightText: "2.00",
    });
    expect(bad.status).toBe("invalid");
  });
});

describe("summarizeValidatedPackageWeights", () => {
  it("revalidates transport rows", () => {
    const summary = summarizeValidatedPackageWeights({
      rows: [
        { rowKey: "a", grossWeightHundredths: 3200 },
        { rowKey: "b", grossWeightHundredths: 2850 },
        { rowKey: "c", grossWeightHundredths: 1925 },
      ],
      packagingWeightHundredths: 0,
    });
    expect(summary.status).toBe("complete");
    expect(summary.grossWeightHundredths).toBe(7975);
  });
});
