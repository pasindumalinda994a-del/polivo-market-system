import { describe, expect, it } from "vitest";

import { DomainError } from "./money.js";
import {
  assertExactReversalNet,
  buildSaleCorrectionPreviewFingerprintMaterial,
  normalizeSaleCorrectionReason,
} from "./sale-correction.js";

describe("normalizeSaleCorrectionReason", () => {
  it("trims and accepts a non-empty reason", () => {
    expect(normalizeSaleCorrectionReason("  price typo  ")).toBe("price typo");
  });

  it("rejects empty and oversized reasons", () => {
    expect(() => normalizeSaleCorrectionReason("   ")).toThrow(DomainError);
    expect(() => normalizeSaleCorrectionReason("x".repeat(501))).toThrow(DomainError);
  });
});

describe("sale correction fingerprint and net checks", () => {
  it("builds stable fingerprint material", () => {
    const a = buildSaleCorrectionPreviewFingerprintMaterial({
      action: "reverse",
      sourceSaleId: "sale-1",
      sourceRevision: 2,
      reason: "void",
      replacementPayload: null,
      reversalEffects: [{ partyKind: "trader", partyId: "t1", amountMinor: -100 }],
      replacementEffects: [],
    });
    const b = buildSaleCorrectionPreviewFingerprintMaterial({
      action: "reverse",
      sourceSaleId: "sale-1",
      sourceRevision: 2,
      reason: "void",
      replacementPayload: null,
      reversalEffects: [{ partyKind: "trader", partyId: "t1", amountMinor: -100 }],
      replacementEffects: [],
    });
    expect(a).toBe(b);
    expect(a).toContain("sale-1");
  });

  it("asserts exact original + reversal net zero", () => {
    expect(() =>
      assertExactReversalNet(
        [
          { partyKind: "trader", partyId: "t1", amountMinor: 500 },
          { partyKind: "farmer", partyId: "f1", amountMinor: 400 },
        ],
        [
          { partyKind: "trader", partyId: "t1", amountMinor: -500 },
          { partyKind: "farmer", partyId: "f1", amountMinor: -400 },
        ],
      ),
    ).not.toThrow();

    expect(() =>
      assertExactReversalNet(
        [{ partyKind: "trader", partyId: "t1", amountMinor: 500 }],
        [{ partyKind: "trader", partyId: "t1", amountMinor: -499 }],
      ),
    ).toThrow(DomainError);
  });
});
