import { describe, expect, it } from "vitest";

import {
  PACKAGE_WEIGHT_ENTRY_MAX_ROWS,
  packageWeightEntryInputSchema,
  validatedPackageWeightSummarySchema,
} from "./weight-entry.js";

describe("packageWeightEntryInputSchema", () => {
  it("accepts unique rows with optional packaging", () => {
    const parsed = packageWeightEntryInputSchema.parse({
      rows: [
        { rowKey: "r1", grossWeightHundredths: 3200 },
        { rowKey: "r2", packageTypeId: "pkg-1", grossWeightHundredths: 2850 },
      ],
      packagingWeightHundredths: 0,
    });
    expect(parsed.rows).toHaveLength(2);
  });

  it("rejects duplicate row keys", () => {
    expect(
      packageWeightEntryInputSchema.safeParse({
        rows: [
          { rowKey: "r1", grossWeightHundredths: 100 },
          { rowKey: "r1", grossWeightHundredths: 200 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects excess precision and negatives via weightHundredthsSchema", () => {
    expect(
      packageWeightEntryInputSchema.safeParse({
        rows: [{ rowKey: "r1", grossWeightHundredths: 12.5 }],
      }).success,
    ).toBe(false);
    expect(
      packageWeightEntryInputSchema.safeParse({
        rows: [{ rowKey: "r1", grossWeightHundredths: -1 }],
      }).success,
    ).toBe(false);
  });

  it("documents the technical max row bound", () => {
    expect(PACKAGE_WEIGHT_ENTRY_MAX_ROWS).toBe(200);
  });
});

describe("validatedPackageWeightSummarySchema", () => {
  it("accepts the synthetic three-package fixture totals", () => {
    const parsed = validatedPackageWeightSummarySchema.parse({
      status: "complete",
      packageCount: 3,
      grossWeightHundredths: 7975,
      packagingWeightHundredths: 0,
      netWeightHundredths: 7975,
      unit: "kg",
      rows: [
        { rowKey: "1", grossWeightHundredths: 3200 },
        { rowKey: "2", grossWeightHundredths: 2850 },
        { rowKey: "3", grossWeightHundredths: 1925 },
      ],
      errors: [],
    });
    expect(parsed.grossWeightHundredths).toBe(7975);
  });
});
