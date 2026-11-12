import { describe, expect, it } from "vitest";

import {
  changeVegetableStatusRequestSchema,
  createVegetableRequestSchema,
  listVegetablesQuerySchema,
  updateVegetableRequestSchema,
  vegetableRecordSchema,
} from "./vegetables.js";

describe("createVegetableRequestSchema", () => {
  it("trims short code and display name including Sinhala", () => {
    const parsed = createVegetableRequestSchema.parse({
      shortCode: " CB ",
      displayName: " කැරට් ",
    });
    expect(parsed.shortCode).toBe("CB");
    expect(parsed.displayName).toBe("කැරට්");
  });

  it("rejects empty codes and names", () => {
    expect(
      createVegetableRequestSchema.safeParse({ shortCode: " ", displayName: "Carrot" }).success,
    ).toBe(false);
    expect(
      createVegetableRequestSchema.safeParse({ shortCode: "CB", displayName: "  " }).success,
    ).toBe(false);
  });
});

describe("updateVegetableRequestSchema", () => {
  it("requires displayName and rejects short-code changes", () => {
    expect(updateVegetableRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(
      updateVegetableRequestSchema.safeParse({
        expectedRevision: 1,
        shortCode: "NEW",
        displayName: "Carrot",
      }).success,
    ).toBe(false);
    expect(
      updateVegetableRequestSchema.parse({ expectedRevision: 2, displayName: "Carrot" })
        .displayName,
    ).toBe("Carrot");
  });
});

describe("changeVegetableStatusRequestSchema", () => {
  it("rejects unknown statuses", () => {
    expect(
      changeVegetableStatusRequestSchema.safeParse({ expectedRevision: 1, status: "archived" })
        .success,
    ).toBe(false);
  });
});

describe("listVegetablesQuerySchema", () => {
  it("defaults the active filter and rejects excessive limits", () => {
    const parsed = listVegetablesQuerySchema.parse({});
    expect(parsed.active).toBe("active");
    expect(parsed.limit).toBe(20);
    expect(listVegetablesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("vegetableRecordSchema", () => {
  it("requires revision", () => {
    const parsed = vegetableRecordSchema.parse({
      id: "veg-1",
      shortCode: "CB",
      displayName: "Carrot",
      isActive: true,
      revision: 1,
      createdAt: "2026-11-09T10:00:00.000Z",
      updatedAt: "2026-11-09T10:00:00.000Z",
    });
    expect(parsed.revision).toBe(1);
  });
});
