import { describe, expect, it } from "vitest";

import {
  accountBalanceResponseSchema,
  correctOpeningRequestSchema,
  prepareOpeningDraftRequestSchema,
  postOpeningDraftResponseSchema,
} from "./accounts.js";

describe("accounts contracts", () => {
  it("accepts a settled zero balance response", () => {
    const parsed = accountBalanceResponseSchema.parse({
      stallId: "stall-1",
      partyKind: "farmer",
      partyId: "farmer-1",
      currency: "LKR",
      balanceMinor: 0,
      displayAmountMinor: 0,
      directionLabel: "Settled",
      openingStatus: "not_opened",
      openingCutoffDate: null,
      asOfBusinessDate: null,
    });
    expect(parsed.openingStatus).toBe("not_opened");
  });

  it("accepts prepare opening draft requests", () => {
    const parsed = prepareOpeningDraftRequestSchema.parse({
      partyKind: "trader",
      partyId: "buyer-1",
      direction: "buyer_owes_stall",
      amountMinor: 15_000,
      cutoffDate: "2026-11-01",
      reference: "OB-1",
      explanation: "Cutover receivable",
    });
    expect(parsed.amountMinor).toBe(15_000);
  });

  it("rejects negative opening amounts", () => {
    const result = prepareOpeningDraftRequestSchema.safeParse({
      partyKind: "farmer",
      partyId: "farmer-1",
      direction: "stall_owes_farmer",
      amountMinor: -1,
      cutoffDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });

  it("requires a correction reason", () => {
    expect(
      correctOpeningRequestSchema.safeParse({
        partyKind: "farmer",
        partyId: "farmer-1",
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      correctOpeningRequestSchema.parse({
        partyKind: "farmer",
        partyId: "farmer-1",
        reason: "Wrong cutoff amount",
        replacement: {
          direction: "stall_owes_farmer",
          amountMinor: 20_000,
        },
      }).replacement?.amountMinor,
    ).toBe(20_000);
  });

  it("allows null postingId for zero openings", () => {
    const parsed = postOpeningDraftResponseSchema.parse({
      draft: {
        id: "draft-1",
        stallId: "stall-1",
        partyKind: "farmer",
        partyId: "farmer-1",
        direction: "stall_owes_farmer",
        amountMinor: 0,
        signedAmountMinor: null,
        cutoffDate: "2026-11-01",
        currency: "LKR",
        reference: null,
        explanation: null,
        status: "posted",
        revision: 2,
        isZeroOpening: true,
        directionLabel: "Settled",
        createdAt: "2026-11-09T08:00:00.000Z",
        updatedAt: "2026-11-09T08:05:00.000Z",
        createdByStaffId: "staff-1",
        postedPostingId: null,
      },
      balance: {
        stallId: "stall-1",
        partyKind: "farmer",
        partyId: "farmer-1",
        currency: "LKR",
        balanceMinor: 0,
        displayAmountMinor: 0,
        directionLabel: "Settled",
        openingStatus: "opened_zero",
        openingCutoffDate: "2026-11-01",
        asOfBusinessDate: null,
      },
      postingId: null,
    });
    expect(parsed.draft.isZeroOpening).toBe(true);
  });
});
