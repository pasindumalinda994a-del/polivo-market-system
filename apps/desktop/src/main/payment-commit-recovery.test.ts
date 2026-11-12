import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tempRoot = mkdtempSync(join(tmpdir(), "polivo-payment-commit-recovery-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tempRoot,
  },
}));

describe("payment commit recovery store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("round-trips a post record without secrets", async () => {
    const mod = await import("./payment-commit-recovery.js");
    mod.clearPaymentCommitRecovery();
    expect(mod.readPaymentCommitRecovery()).toBeNull();
    const record = {
      kind: "post" as const,
      idempotencyKey: "pay-key-1",
      startedAt: "2026-11-11T12:00:00.000Z",
      partyKind: "trader" as const,
      partyId: "trader-1",
      direction: "receive" as const,
      paymentId: null,
      previewFingerprint: "a".repeat(64),
      payload: {
        partyKind: "trader",
        partyId: "trader-1",
        direction: "receive",
        method: "cash",
        amountMinor: 10000,
        allocations: [],
        previewFingerprint: "a".repeat(64),
      },
    };
    mod.writePaymentCommitRecovery(record);
    expect(mod.readPaymentCommitRecovery()).toEqual(record);
    mod.clearPaymentCommitRecovery();
    expect(mod.readPaymentCommitRecovery()).toBeNull();
  });

  it("round-trips allocate and reverse records keyed by payment id", async () => {
    const mod = await import("./payment-commit-recovery.js");
    for (const kind of ["allocate", "reverse"] as const) {
      const record = {
        kind,
        idempotencyKey: `key-${kind}`,
        startedAt: "2026-11-11T12:00:00.000Z",
        partyKind: null,
        partyId: null,
        direction: null,
        paymentId: "payment-1",
        previewFingerprint: "b".repeat(64),
        payload: { paymentId: "payment-1" },
      };
      mod.writePaymentCommitRecovery(record);
      expect(mod.readPaymentCommitRecovery()).toEqual(record);
    }
    mod.clearPaymentCommitRecovery();
    expect(mod.readPaymentCommitRecovery()).toBeNull();
  });

  it("rejects malformed records", async () => {
    const mod = await import("./payment-commit-recovery.js");
    const base = {
      kind: "post",
      idempotencyKey: "k",
      startedAt: "2026-11-11T12:00:00.000Z",
      partyKind: "trader",
      partyId: "t",
      direction: "receive",
      paymentId: null,
      previewFingerprint: "c".repeat(64),
      payload: {},
    };
    expect(mod.parsePaymentCommitRecovery(base)).not.toBeNull();
    expect(mod.parsePaymentCommitRecovery({ ...base, kind: "other" })).toBeNull();
    expect(mod.parsePaymentCommitRecovery({ ...base, partyId: null })).toBeNull();
    expect(mod.parsePaymentCommitRecovery({ ...base, payload: [] })).toBeNull();
    expect(mod.parsePaymentCommitRecovery({ ...base, kind: "reverse" })).toBeNull();
    expect(mod.parsePaymentCommitRecovery(null)).toBeNull();
  });
});

afterAll(() => {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
