import { describe, expect, it } from "vitest";

import {
  changePackageTypeStatusRequestSchema,
  createPackageTypeRequestSchema,
  listPackageTypesQuerySchema,
  packageTypeRecordSchema,
  updatePackageTypeRequestSchema,
} from "./package-types.js";

describe("createPackageTypeRequestSchema", () => {
  it("accepts bag and box style labels", () => {
    const parsed = createPackageTypeRequestSchema.parse({
      shortCode: "BAG",
      displayName: "Bag",
    });
    expect(parsed.shortCode).toBe("BAG");
    expect(parsed.displayName).toBe("Bag");
  });
});

describe("updatePackageTypeRequestSchema", () => {
  it("rejects unknown tare fields and short-code edits", () => {
    expect(
      updatePackageTypeRequestSchema.safeParse({
        expectedRevision: 1,
        displayName: "Bag",
        defaultTareHundredths: 50,
      }).success,
    ).toBe(false);
    expect(
      updatePackageTypeRequestSchema.safeParse({
        expectedRevision: 1,
        shortCode: "BOX",
        displayName: "Box",
      }).success,
    ).toBe(false);
  });
});

describe("changePackageTypeStatusRequestSchema", () => {
  it("accepts active and inactive", () => {
    expect(
      changePackageTypeStatusRequestSchema.parse({ expectedRevision: 1, status: "inactive" })
        .status,
    ).toBe("inactive");
  });
});

describe("listPackageTypesQuerySchema", () => {
  it("defaults active filter", () => {
    expect(listPackageTypesQuerySchema.parse({}).active).toBe("active");
  });
});

describe("packageTypeRecordSchema", () => {
  it("parses a complete record", () => {
    const parsed = packageTypeRecordSchema.parse({
      id: "pkg-1",
      shortCode: "BAG",
      displayName: "Bag",
      isActive: true,
      revision: 3,
      createdAt: "2026-11-09T10:00:00.000Z",
      updatedAt: "2026-11-09T11:00:00.000Z",
    });
    expect(parsed.revision).toBe(3);
  });
});
