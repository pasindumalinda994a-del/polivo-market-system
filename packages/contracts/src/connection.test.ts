import { describe, expect, it } from "vitest";

import {
  buildHostIdentityMessage,
  desktopConnectionStatusSchema,
  hostIdentityResponseSchema,
  hostTrustBundleSchema,
} from "./connection.js";

describe("connection contracts", () => {
  it("accepts a valid host trust bundle", () => {
    const parsed = hostTrustBundleSchema.parse({
      hostDeviceId: "host-1",
      hostPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      hostCredentialVersion: 1,
      stallDisplayName: "Test Stall",
      tlsCertificateSha256: "a".repeat(64),
    });
    expect(parsed.stallDisplayName).toBe("Test Stall");
  });

  it("builds a stable host identity message", () => {
    const message = buildHostIdentityMessage({
      hostDeviceId: "host-1",
      hostPublicKey: "pk",
      hostCredentialVersion: 2,
      stallDisplayName: "Stall",
      tlsCertificateSha256: "b".repeat(64),
      signedAt: "2026-11-05T10:00:00.000Z",
    });
    expect(message).toBe(
      [
        "polivo-host-identity-v1",
        "host-1",
        "pk",
        "2",
        "Stall",
        "b".repeat(64),
        "2026-11-05T10:00:00.000Z",
      ].join("\n"),
    );
  });

  it("accepts a signed identity response and renderer-safe status", () => {
    expect(
      hostIdentityResponseSchema.parse({
        hostDeviceId: "host-1",
        hostPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        hostCredentialVersion: 1,
        stallDisplayName: "Test Stall",
        tlsCertificateSha256: "c".repeat(64),
        signedAt: "2026-11-05T10:00:00.000Z",
        signature: "d".repeat(86),
      }).hostDeviceId,
    ).toBe("host-1");

    expect(
      desktopConnectionStatusSchema.parse({
        state: "verified",
        pairedHostDeviceId: "host-1",
        verifiedStallDisplayName: "Test Stall",
        configuredHostLabel: "127.0.0.1:3040",
        lastSuccessfulCheckAt: "2026-11-05T10:00:00.000Z",
        lastErrorMessage: null,
        staffDisplayName: null,
        staffCode: null,
        capabilities: [],
      }).state,
    ).toBe("verified");
  });
});
