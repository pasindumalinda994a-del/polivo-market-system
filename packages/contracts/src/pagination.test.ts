import { describe, expect, it } from "vitest";
import { z } from "zod";

import { opaqueIdSchema } from "./primitives.js";
import {
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
  paginationQuerySchema,
} from "./pagination.js";

describe("pagination", () => {
  it("coerces a query-string limit", () => {
    const result = paginationLimitQuerySchema.safeParse("20");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(20);
    }
  });

  it("rejects a zero pagination limit", () => {
    expect(paginationLimitQuerySchema.safeParse("0").success).toBe(false);
  });

  it("rejects a negative pagination limit", () => {
    expect(paginationLimitQuerySchema.safeParse("-1").success).toBe(false);
  });

  it("rejects a fractional pagination limit", () => {
    expect(paginationLimitQuerySchema.safeParse("1.5").success).toBe(false);
  });

  it("rejects an excessive pagination limit", () => {
    expect(paginationLimitQuerySchema.safeParse("101").success).toBe(false);
  });

  it("rejects an invalid pagination query", () => {
    expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("accepts a paginated response with items", () => {
    const listSchema = createPaginatedResponseSchema(z.strictObject({ id: opaqueIdSchema }));
    expect(listSchema.safeParse({ items: [{ id: "a" }], nextCursor: null }).success).toBe(true);
  });
});
