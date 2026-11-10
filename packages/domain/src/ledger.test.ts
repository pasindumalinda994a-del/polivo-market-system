import { describe, expect, it } from "vitest";

import { DomainError } from "./money.js";
import {
  balanceDirectionLabel,
  balanceDisplayAmountMinor,
  exactReversalAmount,
  signedAmountForOpeningDirection,
  sumLedgerAmounts,
  validateOpeningDraft,
} from "./ledger.js";

describe("ledger natural signs and labels", () => {
  it("maps farmer directions to natural signs", () => {
    expect(signedAmountForOpeningDirection("farmer", "stall_owes_farmer", 12_500)).toBe(12_500);
    expect(signedAmountForOpeningDirection("farmer", "farmer_owes_stall", 12_500)).toBe(-12_500);
    expect(signedAmountForOpeningDirection("farmer", "stall_owes_farmer", 0)).toBeNull();
  });

  it("maps buyer directions to natural signs", () => {
    expect(signedAmountForOpeningDirection("trader", "buyer_owes_stall", 9_999)).toBe(9_999);
    expect(signedAmountForOpeningDirection("trader", "stall_owes_buyer", 9_999)).toBe(-9_999);
  });

  it("rejects cross-role directions", () => {
    expect(() => signedAmountForOpeningDirection("farmer", "buyer_owes_stall", 100)).toThrow(
      DomainError,
    );
    expect(() => signedAmountForOpeningDirection("trader", "stall_owes_farmer", 100)).toThrow(
      DomainError,
    );
  });

  it("derives explicit direction labels", () => {
    expect(balanceDirectionLabel("farmer", 100)).toBe("Stall owes farmer");
    expect(balanceDirectionLabel("farmer", -100)).toBe("Farmer owes stall");
    expect(balanceDirectionLabel("trader", 100)).toBe("Buyer owes stall");
    expect(balanceDirectionLabel("trader", -100)).toBe("Stall owes buyer");
    expect(balanceDirectionLabel("farmer", 0)).toBe("Settled");
  });

  it("sums exactly and builds exact reversals", () => {
    expect(sumLedgerAmounts([100, -40, 15])).toBe(75);
    expect(exactReversalAmount(250)).toBe(-250);
    expect(exactReversalAmount(-250)).toBe(250);
    expect(() => exactReversalAmount(0)).toThrow(DomainError);
  });

  it("rejects invalid precision-like non-integers", () => {
    expect(() => signedAmountForOpeningDirection("farmer", "stall_owes_farmer", 1.5)).toThrow(
      DomainError,
    );
  });
});

describe("validateOpeningDraft", () => {
  it("accepts a farmer payable opening", () => {
    const draft = validateOpeningDraft({
      partyKind: "farmer",
      direction: "stall_owes_farmer",
      amountMinor: 50_000,
      cutoffDate: "2026-11-01",
      currency: "LKR",
      reference: " Cutover A ",
      explanation: "Pre-system payable",
    });
    expect(draft.isZeroOpening).toBe(false);
    expect(draft.signedAmountMinor).toBe(50_000);
    expect(draft.reference).toBe("Cutover A");
  });

  it("records zero openings without a movement amount", () => {
    const draft = validateOpeningDraft({
      partyKind: "trader",
      direction: "buyer_owes_stall",
      amountMinor: 0,
      cutoffDate: "2026-11-01",
      currency: "LKR",
    });
    expect(draft.isZeroOpening).toBe(true);
    expect(draft.signedAmountMinor).toBeNull();
  });

  it("rejects unsupported currency and bad cutoff", () => {
    expect(() =>
      validateOpeningDraft({
        partyKind: "farmer",
        direction: "stall_owes_farmer",
        amountMinor: 1,
        cutoffDate: "01-11-2026",
        currency: "LKR",
      }),
    ).toThrow(DomainError);
    expect(() =>
      validateOpeningDraft({
        partyKind: "farmer",
        direction: "stall_owes_farmer",
        amountMinor: 1,
        cutoffDate: "2026-11-01",
        currency: "USD" as "LKR",
      }),
    ).toThrow(DomainError);
  });

  it("exposes display amount as absolute", () => {
    expect(balanceDisplayAmountMinor(-42)).toBe(42);
    expect(balanceDisplayAmountMinor(42)).toBe(42);
  });
});
