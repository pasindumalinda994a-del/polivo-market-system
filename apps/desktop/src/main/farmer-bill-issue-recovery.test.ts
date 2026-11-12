import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tempRoot = mkdtempSync(join(tmpdir(), "polivo-farmer-bill-issue-recovery-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tempRoot,
  },
}));

describe("farmer bill issue recovery store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("round-trips minimal recovery metadata without secrets", async () => {
    const mod = await import("./farmer-bill-issue-recovery.js");
    mod.clearFarmerBillIssueRecovery();
    expect(mod.readFarmerBillIssueRecovery()).toBeNull();
    const record = {
      farmerId: "farmer-1",
      sourceLineIds: ["line-1", "line-2"],
      expectedSelectionFingerprint: "a".repeat(64),
      businessDate: "2026-11-10",
      idempotencyKey: "key-1",
      startedAt: "2026-11-10T12:00:00.000Z",
    };
    mod.writeFarmerBillIssueRecovery(record);
    expect(mod.readFarmerBillIssueRecovery()).toEqual(record);
    mod.clearFarmerBillIssueRecovery();
    expect(mod.readFarmerBillIssueRecovery()).toBeNull();
  });
});

afterAll(() => {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
