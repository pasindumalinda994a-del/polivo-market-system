import { describe, expect, it } from "vitest";

import {
  PRODUCTION_OFFLINE_ACCESS_DURATIONS,
  createProductionOfflineAccessPolicy,
  createTestOnlyOfflineAccessPolicy,
  productionFailClosedOfflineAccessPolicy,
} from "./offline-access-policy.js";

const HOUR = 60 * 60 * 1000;

describe("createProductionOfflineAccessPolicy (ADR 0013)", () => {
  const policy = createProductionOfflineAccessPolicy();

  it("exposes approved production durations", () => {
    expect(policy.label).toBe("production");
    expect(policy.idleTimeoutMs()).toBe(PRODUCTION_OFFLINE_ACCESS_DURATIONS.idleTimeoutMs);
    expect(policy.maxSnapshotAgeMs()).toBe(PRODUCTION_OFFLINE_ACCESS_DURATIONS.maxSnapshotAgeMs);
    expect(PRODUCTION_OFFLINE_ACCESS_DURATIONS.absoluteSessionLifetimeMs).toBe(12 * HOUR);
    expect(PRODUCTION_OFFLINE_ACCESS_DURATIONS.idleTimeoutMs).toBe(2 * HOUR);
    expect(PRODUCTION_OFFLINE_ACCESS_DURATIONS.maxSnapshotAgeMs).toBe(7 * 24 * HOUR);
  });

  it("allows first login offline when snapshot is within max age", () => {
    const issued = "2026-11-07T05:30:00.000Z";
    expect(
      policy.allowNewSession({
        nowIso: "2026-11-07T06:00:00.000Z",
        authorityVerifiedAt: "2026-11-07T05:00:00.000Z",
      }),
    ).toBe(true);
    const absolute = policy.absoluteExpiresAt(issued);
    expect(absolute).toBe("2026-11-07T17:30:00.000Z");
  });

  it("expires snapshot at the inclusive age boundary (168h)", () => {
    const verified = "2026-11-01T00:00:00.000Z";
    const justUnder = "2026-11-07T23:59:59.000Z";
    const atLimit = "2026-11-08T00:00:00.000Z";
    expect(policy.allowNewSession({ nowIso: justUnder, authorityVerifiedAt: verified })).toBe(
      true,
    );
    const denied = policy.allowNewSession({ nowIso: atLimit, authorityVerifiedAt: verified });
    expect(denied).not.toBe(true);
    if (denied !== true) {
      expect(denied.message).toBe("Stall access needs an online refresh.");
    }
  });

  it("denies protected access when absolute or idle expires; re-login does not renew snapshot", () => {
    const authorityVerifiedAt = "2026-11-07T05:00:00.000Z";
    const issuedAt = "2026-11-07T05:30:00.000Z";
    const absoluteExpiresAt = "2026-11-07T17:30:00.000Z";

    const absoluteHit = policy.allowProtectedAccess({
      nowIso: "2026-11-07T17:30:00.000Z",
      authorityVerifiedAt,
      sessionIssuedAt: issuedAt,
      sessionAbsoluteExpiresAt: absoluteExpiresAt,
      sessionLastActivityAt: "2026-11-07T17:00:00.000Z",
    });
    expect(absoluteHit).not.toBe(true);

    const idleHit = policy.allowProtectedAccess({
      nowIso: "2026-11-07T10:00:00.000Z",
      authorityVerifiedAt,
      sessionIssuedAt: issuedAt,
      sessionAbsoluteExpiresAt: absoluteExpiresAt,
      sessionLastActivityAt: "2026-11-07T07:59:00.000Z",
    });
    expect(idleHit).not.toBe(true);

    // New session may be allowed, but snapshot age is unchanged by sign-in.
    expect(
      policy.allowNewSession({
        nowIso: "2026-11-07T18:00:00.000Z",
        authorityVerifiedAt,
      }),
    ).toBe(true);
  });

  it("treats clock rollback as expired", () => {
    const denied = policy.allowNewSession({
      nowIso: "2026-11-07T04:00:00.000Z",
      authorityVerifiedAt: "2026-11-07T05:00:00.000Z",
    });
    expect(denied).not.toBe(true);
  });
});

describe("fail-closed and TEST-ONLY labels", () => {
  it("keeps fail-closed refusing sessions", () => {
    expect(productionFailClosedOfflineAccessPolicy.label).toBe("production-fail-closed");
    expect(
      productionFailClosedOfflineAccessPolicy.allowNewSession({
        nowIso: "2026-11-07T06:00:00.000Z",
        authorityVerifiedAt: "2026-11-07T05:00:00.000Z",
      }),
    ).not.toBe(true);
  });

  it("keeps TEST-ONLY distinct from production", () => {
    const testPolicy = createTestOnlyOfflineAccessPolicy({
      absoluteSessionLifetimeMs: HOUR,
      idleTimeoutMs: HOUR,
      maxSnapshotAgeMs: HOUR,
    });
    expect(testPolicy.label).toBe("TEST-ONLY");
  });
});
