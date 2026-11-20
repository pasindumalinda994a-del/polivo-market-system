import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyPendingMigrations, initializeNewDatabase } from "@polivo/db-local";

import { createRecoveryPlan } from "./recovery.js";

const temps: string[] = [];

afterEach(() => {
  for (const path of temps.splice(0)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("sync recovery plans", () => {
  it("creates a retry plan without forbidden action types", () => {
    const dir = mkdtempSync(join(tmpdir(), "polivo-recovery-"));
    temps.push(dir);
    const local = initializeNewDatabase(join(dir, "db.sqlite"));
    applyPendingMigrations(local.db);

    const plan = createRecoveryPlan({
      database: local,
      stallId: "stall-1",
      actionType: "retry_upload_worker",
      staffId: "staff-1",
      deviceId: "device-1",
      createId: () => "plan-test-1",
      now: () => "2026-11-14T12:00:00.000Z",
    });

    expect(plan.actionType).toBe("retry_upload_worker");
    expect(plan.requiredCapability).toBe("sync.retry");
    expect(plan.safetyRationale.toLowerCase()).toContain("existing");
    expect(plan.planId).toBe("plan-test-1");
    local.close();
  });

  it("rejects inventing cursor-reset style actions at the type level", () => {
    expect(["retry_upload_worker", "replay_original_events"]).not.toContain("reset_cursor");
  });
});
