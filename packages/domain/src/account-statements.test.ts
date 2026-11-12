import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
  allocationActiveAtCutoff,
  assertSnapshotMatchesBinding,
  buildSnapshotExpiry,
  computeRunningBalances,
  computeStatementPeriodTotals,
  decodeStatementPageCursor,
  decodeStatementSnapshotToken,
  encodeStatementPageCursor,
  encodeStatementSnapshotToken,
  reconcileOutstandingWithBalance,
  settlementStatusForRemaining,
  splitIncreaseDecrease,
  type StatementSnapshotPayload,
} from "./account-statements.js";
import { DomainError } from "./money.js";

describe("account statement math", () => {
  it("matches the buyer exact fixture: opening 2000 + sale 10000 - receipt 4000 = 8000", () => {
    // Guide amounts are major rupees; fixtures use paisa (×100).
    const totals = computeStatementPeriodTotals("trader", 0, [200_000, 1_000_000, -400_000]);
    expect(totals.closingBalanceMinor).toBe(800_000);
    expect(totals.periodIncreaseMinor).toBe(1_200_000);
    expect(totals.periodDecreaseMinor).toBe(400_000);
    expect(totals.closingDirectionLabel).toBe("Buyer owes stall");
  });

  it("returns 1,200,000 after reversing the 400,000 receipt", () => {
    const afterReverse = computeStatementPeriodTotals("trader", 0, [
      200_000,
      1_000_000,
      -400_000,
      400_000,
    ]);
    expect(afterReverse.closingBalanceMinor).toBe(1_200_000);
  });

  it("matches the farmer exact fixture: entitlement 9500 - cheque 3000 = 6500", () => {
    const totals = computeStatementPeriodTotals("farmer", 0, [950_000, -300_000]);
    expect(totals.closingBalanceMinor).toBe(650_000);
    expect(totals.closingDirectionLabel).toBe("Stall owes farmer");
  });

  it("treats statement opening before the period separately from period rows", () => {
    const opening = 200_000;
    const totals = computeStatementPeriodTotals("trader", opening, [1_000_000, -400_000]);
    expect(totals.openingBalanceMinor).toBe(200_000);
    expect(totals.closingBalanceMinor).toBe(800_000);
  });

  it("keeps nonzero opening with no period activity", () => {
    const totals = computeStatementPeriodTotals("farmer", 650_000, []);
    expect(totals.closingBalanceMinor).toBe(650_000);
    expect(totals.periodIncreaseMinor).toBe(0);
    expect(totals.periodDecreaseMinor).toBe(0);
  });

  it("continues running balances across pages", () => {
    const page1 = computeRunningBalances(200_000, [1_000_000, -400_000]);
    expect(page1).toEqual([1_200_000, 800_000]);
    const page2 = computeRunningBalances(800_000, [50_000, -20_000]);
    expect(page2).toEqual([850_000, 830_000]);
  });

  it("splits increase and decrease columns", () => {
    expect(splitIncreaseDecrease(1_000_000)).toEqual({
      increaseMinor: 1_000_000,
      decreaseMinor: 0,
    });
    expect(splitIncreaseDecrease(-400_000)).toEqual({
      increaseMinor: 0,
      decreaseMinor: 400_000,
    });
  });
});

describe("outstanding reconciliation", () => {
  it("reconciles remaining obligations minus unapplied to account balance", () => {
    // Buyer owes 800_000; all on obligations; no unapplied.
    const ok = reconcileOutstandingWithBalance({
      partyKind: "trader",
      accountBalanceMinor: 800_000,
      remainingObligationsMinor: 800_000,
      unappliedSettlementMinor: 0,
    });
    expect(ok.reconciliationOk).toBe(true);

    // Net zero with outstanding bill and unapplied payment.
    const netZero = reconcileOutstandingWithBalance({
      partyKind: "trader",
      accountBalanceMinor: 0,
      remainingObligationsMinor: 400_000,
      unappliedSettlementMinor: 400_000,
    });
    expect(netZero.reconciliationOk).toBe(true);
    expect(netZero.reconciliationNetMinor).toBe(0);
  });

  it("returns a diagnostic without inventing balancing entries on mismatch", () => {
    const result = reconcileOutstandingWithBalance({
      partyKind: "trader",
      accountBalanceMinor: 100,
      remainingObligationsMinor: 50,
      unappliedSettlementMinor: 0,
    });
    expect(result.reconciliationOk).toBe(false);
    expect(result.diagnostic).toContain("does not equal");
  });

  it("derives settlement status from remaining", () => {
    expect(settlementStatusForRemaining(100, 100)).toBe("unpaid");
    expect(settlementStatusForRemaining(100, 40)).toBe("partial");
    expect(settlementStatusForRemaining(100, 0)).toBe("paid");
  });
});

describe("allocation historical activity", () => {
  it("uses released_at when present", () => {
    expect(
      allocationActiveAtCutoff(
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          releasedAt: "2026-02-01T00:00:00.000Z",
          legacyReleaseRecordedAt: null,
        },
        "2026-01-15T00:00:00.000Z",
      ),
    ).toEqual({ active: true, usedLegacyReleaseProxy: false });
    expect(
      allocationActiveAtCutoff(
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          releasedAt: "2026-02-01T00:00:00.000Z",
          legacyReleaseRecordedAt: null,
        },
        "2026-02-15T00:00:00.000Z",
      ).active,
    ).toBe(false);
  });

  it("falls back to legacy reversal recorded_at", () => {
    const result = allocationActiveAtCutoff(
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        releasedAt: null,
        legacyReleaseRecordedAt: "2026-03-01T00:00:00.000Z",
      },
      "2026-02-01T00:00:00.000Z",
    );
    expect(result).toEqual({ active: true, usedLegacyReleaseProxy: true });
  });
});

describe("snapshot tokens", () => {
  const basePayload = (): StatementSnapshotPayload => ({
    v: 1,
    stallId: "stall-1",
    partyKind: "trader",
    partyId: "buyer-1",
    currency: "LKR",
    fromBusinessDate: "2026-01-01",
    toBusinessDate: "2026-01-31",
    asOfBusinessDate: null,
    purpose: "statement",
    capturedAt: "2026-11-11T10:00:00.000Z",
    expiresAt: buildSnapshotExpiry("2026-11-11T10:00:00.000Z"),
    watermarks: {
      maxPostingSequence: 42,
      maxAllocationCreatedAt: "2026-11-11T09:59:00.000Z",
      maxAllocationId: "alloc-9",
      maxPaymentRecordedAt: "2026-11-11T09:58:00.000Z",
      maxPaymentId: "pay-3",
    },
    filterFingerprint: null,
  });

  it("round-trips snapshot tokens", () => {
    const token = encodeStatementSnapshotToken(basePayload());
    const decoded = decodeStatementSnapshotToken(token);
    expect(decoded.watermarks.maxPostingSequence).toBe(42);
    expect(ACCOUNT_STATEMENT_VIEW_MODEL_VERSION).toBe("1");
  });

  it("rejects expired and mismatched snapshots", () => {
    const payload = basePayload();
    expect(() =>
      assertSnapshotMatchesBinding(
        payload,
        {
          stallId: "stall-1",
          partyKind: "trader",
          partyId: "buyer-1",
          currency: "LKR",
          purpose: "statement",
          fromBusinessDate: "2026-01-01",
          toBusinessDate: "2026-01-31",
        },
        "2026-11-11T10:05:00.000Z",
      ),
    ).not.toThrow();

    expect(() =>
      assertSnapshotMatchesBinding(
        payload,
        {
          stallId: "stall-1",
          partyKind: "trader",
          partyId: "buyer-1",
          currency: "LKR",
          purpose: "statement",
          fromBusinessDate: "2026-01-01",
          toBusinessDate: "2026-01-31",
        },
        "2026-11-11T10:31:00.000Z",
      ),
    ).toThrow(DomainError);

    expect(() =>
      assertSnapshotMatchesBinding(
        payload,
        {
          stallId: "stall-1",
          partyKind: "trader",
          partyId: "other",
          currency: "LKR",
          purpose: "statement",
          fromBusinessDate: "2026-01-01",
          toBusinessDate: "2026-01-31",
        },
        "2026-11-11T10:05:00.000Z",
      ),
    ).toThrow(DomainError);
  });

  it("binds page cursors to snapshot tokens", () => {
    const token = encodeStatementSnapshotToken(basePayload());
    const cursor = encodeStatementPageCursor({
      snapshotToken: token,
      afterBusinessDate: "2026-01-10",
      afterPostingSequence: 7,
      afterEntryId: "entry-7",
    });
    const decoded = decodeStatementPageCursor(cursor);
    expect(decoded.afterPostingSequence).toBe(7);
    expect(decoded.snapshotToken).toBe(token);
  });
});
