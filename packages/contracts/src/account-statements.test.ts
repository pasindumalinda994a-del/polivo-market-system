import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
  accountStatementQuerySchema,
  accountStatementResponseSchema,
  historicalOutstandingQuerySchema,
  outstandingObligationsResponseSchema,
} from "./account-statements.js";

describe("account statement contracts", () => {
  it("rejects inverted date ranges", () => {
    expect(
      accountStatementQuerySchema.safeParse({
        fromBusinessDate: "2026-02-01",
        toBusinessDate: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("defaults currency and date basis", () => {
    const parsed = accountStatementQuerySchema.parse({
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-31",
    });
    expect(parsed.currency).toBe("LKR");
    expect(parsed.dateBasis).toBe("business_effective");
    expect(parsed.limit).toBe(20);
  });

  it("requires as-of date for historical outstanding", () => {
    expect(historicalOutstandingQuerySchema.safeParse({}).success).toBe(false);
    expect(
      historicalOutstandingQuerySchema.parse({ asOfBusinessDate: "2026-01-15" }).asOfBusinessDate,
    ).toBe("2026-01-15");
  });

  it("accepts a statement response shape", () => {
    const parsed = accountStatementResponseSchema.parse({
      viewModelVersion: ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
      header: {
        stallId: "stall-1",
        tenantId: null,
        partyKind: "trader",
        partyId: "buyer-1",
        partyCode: "B1",
        partyDisplayName: "Buyer One",
        accountRole: "trader",
        currency: "LKR",
        fromBusinessDate: "2026-01-01",
        toBusinessDate: "2026-01-31",
        dateBasis: "business_effective",
        openingStatus: "opened",
        generatedAt: "2026-11-11T10:00:00.000Z",
      },
      summary: {
        openingBalanceMinor: 200_000,
        openingDirectionLabel: "Buyer owes stall",
        periodIncreaseMinor: 1_000_000,
        periodDecreaseMinor: 400_000,
        periodNetMinor: 600_000,
        closingBalanceMinor: 800_000,
        closingDirectionLabel: "Buyer owes stall",
        movementCount: 2,
      },
      balanceBeforePageMinor: 200_000,
      items: [],
      nextCursor: null,
      snapshot: {
        snapshotToken: "abc",
        capturedAt: "2026-11-11T10:00:00.000Z",
        expiresAt: "2026-11-11T10:30:00.000Z",
        maxPostingSequence: 3,
        dateBasis: "business_effective",
        businessTimezone: "UTC",
      },
      rowFilterActive: false,
      rowFilterLabel: null,
    });
    expect(parsed.summary.closingBalanceMinor).toBe(800_000);
  });

  it("accepts outstanding responses with historical reconstruction flags", () => {
    const parsed = outstandingObligationsResponseSchema.parse({
      partyKind: "farmer",
      partyId: "farmer-1",
      currency: "LKR",
      asOfBusinessDate: "2026-01-15",
      isHistorical: true,
      reconstructionBasis: "effective_and_recording_cutoff",
      legacyReleaseTimestampLimitation: true,
      remainingObligationsMinor: 650_000,
      unappliedPaymentsMinor: 0,
      accountBalanceMinor: 650_000,
      reconciliationNetMinor: 650_000,
      reconciliationOk: true,
      reconciliationDiagnostic: null,
      items: [],
      nextCursor: null,
      snapshot: {
        snapshotToken: "tok",
        capturedAt: "2026-11-11T10:00:00.000Z",
        expiresAt: "2026-11-11T10:30:00.000Z",
        maxPostingSequence: 1,
        dateBasis: "business_effective",
        businessTimezone: "UTC",
      },
    });
    expect(parsed.isHistorical).toBe(true);
  });
});
