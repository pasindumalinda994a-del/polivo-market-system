import { describe, expect, it } from "vitest";

import {
  changeFarmerStatusRequestSchema,
  createFarmerRequestSchema,
  farmerRecordSchema,
  listFarmersQuerySchema,
  partyShortCodeSchema,
  updateFarmerRequestSchema,
} from "./farmers.js";

describe("partyShortCodeSchema", () => {
  it("trims and accepts proposed charset", () => {
    expect(partyShortCodeSchema.parse("  F1  ")).toBe("F1");
    expect(partyShortCodeSchema.parse("ab_12.3-x")).toBe("ab_12.3-x");
  });

  it("rejects empty, whitespace-only, and invalid characters", () => {
    expect(partyShortCodeSchema.safeParse("").success).toBe(false);
    expect(partyShortCodeSchema.safeParse("   ").success).toBe(false);
    expect(partyShortCodeSchema.safeParse("F 1").success).toBe(false);
    expect(partyShortCodeSchema.safeParse("කා").success).toBe(false);
  });

  it("preserves case", () => {
    expect(partyShortCodeSchema.parse("AbC")).toBe("AbC");
  });
});

describe("createFarmerRequestSchema", () => {
  it("accepts required fields and optional contact", () => {
    const parsed = createFarmerRequestSchema.parse({
      shortCode: "F1",
      displayName: "කමල් Perera",
      contactNumber: "0712345678",
    });
    expect(parsed.displayName).toBe("කමල් Perera");
    expect(parsed.contactNumber).toBe("0712345678");
  });

  it("rejects whitespace-only display names", () => {
    expect(
      createFarmerRequestSchema.safeParse({ shortCode: "F1", displayName: "  " }).success,
    ).toBe(false);
  });
});

describe("updateFarmerRequestSchema", () => {
  it("requires at least one editable field", () => {
    expect(updateFarmerRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it("allows explicit null to clear optional fields", () => {
    const parsed = updateFarmerRequestSchema.parse({
      expectedRevision: 2,
      contactNumber: null,
      locality: null,
    });
    expect(parsed.contactNumber).toBeNull();
    expect(parsed.locality).toBeNull();
  });

  it("treats omitted optional fields as undefined", () => {
    const parsed = updateFarmerRequestSchema.parse({
      expectedRevision: 1,
      displayName: "Updated",
    });
    expect(parsed.contactNumber).toBeUndefined();
    expect(parsed.locality).toBeUndefined();
  });
});

describe("changeFarmerStatusRequestSchema", () => {
  it("accepts active and inactive with revision", () => {
    expect(
      changeFarmerStatusRequestSchema.parse({ expectedRevision: 1, status: "inactive" }).status,
    ).toBe("inactive");
  });
});

describe("listFarmersQuerySchema", () => {
  it("defaults active filter to active and coerces limit", () => {
    const parsed = listFarmersQuerySchema.parse({ limit: "10" });
    expect(parsed.active).toBe("active");
    expect(parsed.limit).toBe(10);
  });

  it("rejects excessive pagination limits", () => {
    expect(listFarmersQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("farmerRecordSchema", () => {
  it("requires revision and nullable contact fields", () => {
    const parsed = farmerRecordSchema.parse({
      id: "farmer-1",
      shortCode: "F1",
      displayName: "Test Farmer A",
      contactNumber: null,
      locality: null,
      isActive: true,
      revision: 1,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(parsed.revision).toBe(1);
  });
});
