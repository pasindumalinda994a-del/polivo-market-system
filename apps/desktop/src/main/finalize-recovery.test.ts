import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tempRoot = mkdtempSync(join(tmpdir(), "polivo-finalize-recovery-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tempRoot,
  },
}));

describe("finalize recovery store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("round-trips minimal recovery metadata without secrets", async () => {
    const mod = await import("./finalize-recovery.js");
    mod.clearFinalizeRecovery();
    expect(mod.readFinalizeRecovery()).toBeNull();
    const record = {
      saleId: "sale-1",
      idempotencyKey: "key-1",
      expectedRevision: 3,
      expectedCalculationFingerprint: "a".repeat(64),
      startedAt: "2026-11-10T12:00:00.000Z",
    };
    mod.writeFinalizeRecovery(record);
    expect(mod.readFinalizeRecovery()).toEqual(record);
    mod.clearFinalizeRecovery();
    expect(mod.readFinalizeRecovery()).toBeNull();
  });
});

afterAll(() => {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
