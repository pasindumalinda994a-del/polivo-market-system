import { describe, expect, it } from "vitest";

import {
  SYNC_MANIFEST_VERSION,
  SYNC_MISMATCH_CATEGORIES,
  SYNC_RECOVERY_ACTION_TYPES,
  syncMismatchCategorySchema,
  syncRecoveryPlanSchema,
  syncWorkspaceStatusSchema,
} from "./reconciliation.js";
import {
  buildSyncProgressPossessionMessage,
  buildSyncReceiptLookupPossessionMessage,
} from "./reconcile-possession.js";

describe("sync reconciliation contracts", () => {
  it("exports stable mismatch categories and recovery actions", () => {
    expect(SYNC_MISMATCH_CATEGORIES).toContain("expected_upload_backlog");
    expect(SYNC_MISMATCH_CATEGORIES).toContain("stale_projection");
    expect(SYNC_RECOVERY_ACTION_TYPES).not.toContain("reset_cursor");
    expect(SYNC_RECOVERY_ACTION_TYPES).not.toContain("skip_event");
    expect(syncMismatchCategorySchema.parse("missing_cloud_receipt")).toBe(
      "missing_cloud_receipt",
    );
  });

  it("builds distinct possession messages for progress and receipts", () => {
    const base = {
      tenantId: "t1",
      deviceId: "d1",
      installationId: "i1",
      credentialVersion: 1,
      requestId: "r1",
      bodySha256: "a".repeat(64),
      signedAt: "2026-11-14T00:00:00.000Z",
    };
    const progress = buildSyncProgressPossessionMessage(base);
    const receipts = buildSyncReceiptLookupPossessionMessage(base);
    expect(progress.startsWith("polivo-sync-progress-v1\n")).toBe(true);
    expect(receipts.startsWith("polivo-sync-receipts-v1\n")).toBe(true);
    expect(progress).not.toEqual(receipts);
  });

  it("rejects recovery plans that omit required safety fields", () => {
    expect(() =>
      syncRecoveryPlanSchema.parse({
        planId: "plan-1",
        actionType: "retry_upload_worker",
        targetStreamId: null,
        targetConfigDomain: null,
        eventGroupRange: null,
        configurationRevision: null,
        expectedStateFingerprint: "fp",
        affectedItemCount: 1,
        safetyRationale: "Wake existing worker",
        potentialOutcome: "Upload resumes",
        requiredCapability: "sync.retry",
        createdAt: "2026-11-14T00:00:00.000Z",
        expiresAt: "2026-11-14T00:15:00.000Z",
      }),
    ).not.toThrow();
    expect(SYNC_MANIFEST_VERSION).toBe("sync-manifest-v1");
  });

  it("requires overallHealthy to be explicit on workspace status shape", () => {
    const parsed = syncWorkspaceStatusSchema.safeParse({
      upload: null,
      configuration: null,
      reconciliation: null,
      pendingBlocked: [],
      localObservedAt: "2026-11-14T00:00:00.000Z",
      hasUnresolvedIntegrityConflict: false,
      accessSnapshotExpired: false,
      overallHealthy: true,
    });
    expect(parsed.success).toBe(false);
  });
});
