import { describe, expect, it } from "vitest";

import {
  authorizeEnrollmentResponseSchema,
  authorizeHostEnrollmentRequestSchema,
  redeemEnrollmentRequestSchema,
} from "./device-enrollment.js";

describe("device enrollment contracts", () => {
  it("accepts host authorization request", () => {
    const parsed = authorizeHostEnrollmentRequestSchema.parse({
      deploymentEnvironment: "development",
      label: "Office host",
    });
    expect(parsed.label).toBe("Office host");
  });

  it("requires one-time secret on authorize response", () => {
    const parsed = authorizeEnrollmentResponseSchema.parse({
      grantId: "dgr_1",
      reservedDeviceId: "dev_1",
      expiresAt: "2026-11-03T12:00:00.000Z",
      enrollmentSecret: "a".repeat(43),
    });
    expect(parsed.enrollmentSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("rejects redeem payloads without possession proof", () => {
    expect(() =>
      redeemEnrollmentRequestSchema.parse({
        enrollmentSecret: "a".repeat(43),
        installationId: "inst_1",
        publicKey: "pk-public-key-value",
        deploymentEnvironment: "development",
      }),
    ).toThrow();
  });
});
