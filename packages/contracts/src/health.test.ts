import { describe, expect, it } from "vitest";

import { buildHealthResponse, healthResponseSchema } from "./health.js";

describe("health response", () => {
  it("accepts the health builder output", () => {
    expect(healthResponseSchema.safeParse(buildHealthResponse()).success).toBe(true);
  });

  it("rejects an invalid health status", () => {
    expect(
      healthResponseSchema.safeParse({
        service: "polivo-stall-service",
        status: "degraded",
      }).success,
    ).toBe(false);
  });

  it("rejects unexpected fields where strictness is required", () => {
    expect(
      healthResponseSchema.safeParse({
        service: "polivo-stall-service",
        status: "ok",
        database: "ready",
      }).success,
    ).toBe(false);
  });
});
