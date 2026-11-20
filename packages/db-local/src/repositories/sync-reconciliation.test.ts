import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase } from "../connection.js";
import { loadBundledMigrations } from "../migrations/registry.js";
import { applyPendingMigrations } from "../migrations/runner.js";
import {
  insertDiagnosticExport,
  insertReconciliationRun,
  insertRecoveryPlan,
  listPendingBlockedOutboxGroups,
  tryGetLatestReconciliationRun,
} from "./sync-reconciliation.js";

describe("sync reconciliation repositories", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes migration 019", () => {
    const migrations = loadBundledMigrations();
    expect(migrations.some((m) => m.id === "019")).toBe(true);
  });

  it("persists reconciliation runs and recovery plans", () => {
    const dir = mkdtempSync(join(tmpdir(), "polivo-sync-recon-"));
    dirs.push(dir);
    const local = initializeNewDatabase(join(dir, "local.sqlite"));
    applyPendingMigrations(local.db);
    const database = local;
    const run = insertReconciliationRun(database, {
      id: "run-1",
      stallId: "stall-1",
      requestId: "req-1",
      scope: "delivery+data",
      startedAt: "2026-11-14T00:00:00.000Z",
      createdByStaffId: "staff-1",
      createdByDeviceId: "device-1",
    });
    expect(run.state).toBe("running");
    expect(tryGetLatestReconciliationRun(database, "stall-1")?.id).toBe("run-1");

    const plan = insertRecoveryPlan(database, {
      id: "plan-1",
      stallId: "stall-1",
      actionType: "retry_upload_worker",
      targetStreamId: "stream-1",
      targetConfigDomain: null,
      eventGroupRangeJson: null,
      configurationRevision: null,
      expectedStateFingerprint: "fp-1",
      affectedItemCount: 2,
      safetyRationale: "Wake existing worker",
      potentialOutcome: "Pending groups upload",
      requiredCapability: "sync.retry",
      planJson: "{}",
      createdAt: "2026-11-14T00:00:00.000Z",
      expiresAt: "2026-11-14T00:15:00.000Z",
      createdByStaffId: "staff-1",
      createdByDeviceId: "device-1",
    });
    expect(plan.actionType).toBe("retry_upload_worker");

    const exp = insertDiagnosticExport(database, {
      id: "diag-1",
      stallId: "stall-1",
      defaultFileName: "sync-diagnostics.json",
      contentSha256: "a".repeat(64),
      byteLength: 2,
      contentJson: "{}",
      createdByStaffId: "staff-1",
      createdByDeviceId: "device-1",
      createOperationId: "op-1",
      createdAt: "2026-11-14T00:00:00.000Z",
      expiresAt: "2026-11-14T01:00:00.000Z",
    });
    expect(exp.contentType).toBe("application/json");
    expect(listPendingBlockedOutboxGroups(database, "stall-1")).toEqual([]);
    local.close();
  });
});
