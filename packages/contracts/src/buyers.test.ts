import { describe, expect, it } from "vitest";

import {
  buyerRecordSchema,
  changeBuyerStatusRequestSchema,
  createBuyerRequestSchema,
  listBuyersQuerySchema,
  updateBuyerRequestSchema,
} from "./buyers.js";

describe("createBuyerRequestSchema", () => {
  it("accepts required fields and preserves a leading-zero contact number", () => {
    const parsed = createBuyerRequestSchema.parse({
      shortCode: " TB1 ",
      displayName: " ටෙස්ට් වෙළෙන්දා ",
      contactNumber: "0712345678",
    });
    expect(parsed.shortCode).toBe("TB1");
    expect(parsed.displayName).toBe("ටෙස්ට් වෙළෙන්දා");
    expect(parsed.contactNumber).toBe("0712345678");
  });

  it("rejects empty names and codes", () => {
    expect(createBuyerRequestSchema.safeParse({ shortCode: " ", displayName: "A" }).success).toBe(
      false,
    );
    expect(
      createBuyerRequestSchema.safeParse({ shortCode: "TB1", displayName: "  " }).success,
    ).toBe(false);
  });
});

describe("updateBuyerRequestSchema", () => {
  it("requires at least one editable field and rejects short code", () => {
    expect(updateBuyerRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(
      updateBuyerRequestSchema.safeParse({
        expectedRevision: 1,
        shortCode: "NEW",
        displayName: "Name",
      }).success,
    ).toBe(false);
  });

  it("allows explicit null to clear optional fields", () => {
    const parsed = updateBuyerRequestSchema.parse({
      expectedRevision: 2,
      contactNumber: null,
      locality: null,
    });
    expect(parsed.contactNumber).toBeNull();
    expect(parsed.locality).toBeNull();
  });
});

describe("changeBuyerStatusRequestSchema", () => {
  it("rejects unknown statuses", () => {
    expect(
      changeBuyerStatusRequestSchema.safeParse({ expectedRevision: 1, status: "archived" }).success,
    ).toBe(false);
  });
});

describe("listBuyersQuerySchema", () => {
  it("defaults the active filter and rejects excessive limits", () => {
    const parsed = listBuyersQuerySchema.parse({});
    expect(parsed.active).toBe("active");
    expect(parsed.limit).toBe(20);
    expect(listBuyersQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("buyerRecordSchema", () => {
  it("requires revision and nullable contact fields", () => {
    const parsed = buyerRecordSchema.parse({
      id: "buyer-1",
      shortCode: "TB1",
      displayName: "Test Trader A",
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
