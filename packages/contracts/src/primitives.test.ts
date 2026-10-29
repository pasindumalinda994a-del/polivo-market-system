import { describe, expect, it } from "vitest";

import {
  absoluteTimestampSchema,
  calendarDateSchema,
  opaqueIdSchema,
  tenantIdSchema,
} from "./primitives.js";

describe("opaque identifiers", () => {
  it("accepts a valid identifier", () => {
    expect(opaqueIdSchema.safeParse("tenant-abc").success).toBe(true);
  });

  it("accepts a minimum-length identifier", () => {
    expect(tenantIdSchema.safeParse("a").success).toBe(true);
  });

  it("rejects an empty identifier", () => {
    expect(opaqueIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects an oversized identifier", () => {
    expect(opaqueIdSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("preserves identifier values exactly", () => {
    const value = " Tenant_Id-01 ";
    const result = opaqueIdSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(value);
    }
  });
});

describe("absolute timestamps", () => {
  it("accepts a UTC absolute timestamp", () => {
    expect(absoluteTimestampSchema.safeParse("2026-10-29T09:00:00.000Z").success).toBe(true);
  });

  it("accepts an absolute timestamp with an offset", () => {
    expect(absoluteTimestampSchema.safeParse("2026-10-29T14:30:00+05:30").success).toBe(true);
  });

  it("rejects a locale-formatted timestamp", () => {
    expect(absoluteTimestampSchema.safeParse("10/29/2026 9:00 AM").success).toBe(false);
  });

  it("rejects a calendar date as an absolute timestamp", () => {
    expect(absoluteTimestampSchema.safeParse("2026-10-29").success).toBe(false);
  });

  it("rejects an ambiguous timestamp without timezone information", () => {
    expect(absoluteTimestampSchema.safeParse("2026-10-29T09:00:00").success).toBe(false);
  });
});

describe("calendar dates", () => {
  it("accepts a valid calendar date", () => {
    expect(calendarDateSchema.safeParse("2026-10-29").success).toBe(true);
  });

  it("accepts a leap-day boundary on a leap year", () => {
    expect(calendarDateSchema.safeParse("2024-02-29").success).toBe(true);
  });

  it("rejects a leap-day on a non-leap year", () => {
    expect(calendarDateSchema.safeParse("2023-02-29").success).toBe(false);
  });

  it("rejects an invalid calendar date", () => {
    expect(calendarDateSchema.safeParse("2026-02-30").success).toBe(false);
  });

  it("rejects a locale-formatted calendar date", () => {
    expect(calendarDateSchema.safeParse("29-10-2026").success).toBe(false);
  });
});
