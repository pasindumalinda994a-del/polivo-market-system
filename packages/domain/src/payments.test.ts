import { describe, expect, it } from "vitest";

import { DomainError } from "./money.js";
import {
  allocatePaymentOldestFirst,
  applyFarmerAdvance,
  obligationRemainingAmountMinor,
  paymentAvailableAmountMinor,
  paymentLedgerAmountMinor,
  paymentStatusForOutstanding,
  validateExplicitAllocations,
} from "./payments.js";

describe("allocatePaymentOldestFirst", () => {
  it("allocates to the oldest unpaid bill first and credits overpayment", () => {
    const result = allocatePaymentOldestFirst(
      [
        { billId: "b2", outstandingMinor: 100_000, finalizedAt: "2026-11-02T00:00:00.000Z" },
        { billId: "b1", outstandingMinor: 50_000, finalizedAt: "2026-11-01T00:00:00.000Z" },
      ],
      180_000,
    );

    expect(result.allocations).toEqual([
      { billId: "b1", appliedMinor: 50_000 },
      { billId: "b2", appliedMinor: 100_000 },
    ]);
    expect(result.creditMinor).toBe(30_000);
    expect(result.remainingOutstandingByBillId).toEqual({ b1: 0, b2: 0 });
  });

  it("supports partial payment on the oldest bill", () => {
    const result = allocatePaymentOldestFirst(
      [{ billId: "b1", outstandingMinor: 100_000, finalizedAt: "2026-11-01T00:00:00.000Z" }],
      40_000,
    );
    expect(result.allocations).toEqual([{ billId: "b1", appliedMinor: 40_000 }]);
    expect(result.remainingOutstandingByBillId.b1).toBe(60_000);
    expect(result.creditMinor).toBe(0);
  });

  it("compares finalizedAt as instants across timezone offsets", () => {
    // +05:30 → 04:30Z (earlier); 06:00Z is later. Lexicographic string order is reversed.
    const result = allocatePaymentOldestFirst(
      [
        {
          billId: "later-utc",
          outstandingMinor: 100_000,
          finalizedAt: "2026-11-01T06:00:00.000Z",
        },
        {
          billId: "earlier-offset",
          outstandingMinor: 50_000,
          finalizedAt: "2026-11-01T10:00:00+05:30",
        },
      ],
      50_000,
    );

    expect(result.allocations).toEqual([{ billId: "earlier-offset", appliedMinor: 50_000 }]);
  });

  it("rejects duplicate bill ids", () => {
    expect(() =>
      allocatePaymentOldestFirst(
        [
          { billId: "b1", outstandingMinor: 100_000, finalizedAt: "2026-11-01T00:00:00.000Z" },
          { billId: "b1", outstandingMinor: 100_000, finalizedAt: "2026-11-02T00:00:00.000Z" },
        ],
        200_000,
      ),
    ).toThrow(DomainError);
  });
});

describe("applyFarmerAdvance", () => {
  it("deducts advances from later settlements", () => {
    expect(applyFarmerAdvance(100_000, 30_000)).toEqual({
      netPayoutMinor: 70_000,
      advanceConsumedMinor: 30_000,
      advanceRemainingMinor: 0,
    });
  });
});

describe("paymentStatusForOutstanding", () => {
  it("classifies unpaid, partial, and fully paid", () => {
    expect(paymentStatusForOutstanding(100, 100)).toBe("unpaid");
    expect(paymentStatusForOutstanding(100, 40)).toBe("partially_paid");
    expect(paymentStatusForOutstanding(100, 0)).toBe("fully_paid");
  });
});

describe("Phase 26 exact allocation calculations", () => {
  it("reduces a 10000 obligation by a 4000 payment to 6000 remaining", () => {
    const remaining = obligationRemainingAmountMinor(1_000_000, 400_000);
    expect(remaining).toBe(600_000);
    expect(paymentAvailableAmountMinor(400_000, 400_000)).toBe(0);
  });

  it("settles remaining 6000 with a second 6000 payment", () => {
    expect(obligationRemainingAmountMinor(1_000_000, 1_000_000)).toBe(0);
  });

  it("validates explicit split across 3000 and 7000 obligations for a 5000 payment", () => {
    const result = validateExplicitAllocations({
      paymentAmountMinor: 500_000,
      allocations: [
        { obligationKind: "trader_bill", targetId: "a", appliedMinor: 300_000 },
        { obligationKind: "trader_bill", targetId: "b", appliedMinor: 200_000 },
      ],
      remaindersByTargetId: { a: 300_000, b: 700_000 },
    });
    expect(result.allocatedTotalMinor).toBe(500_000);
    expect(result.unappliedMinor).toBe(0);
    expect(result.remainingByTargetId).toEqual({ a: 0, b: 500_000 });
  });

  it("allows unapplied remainder as credit without changing allocation targets", () => {
    const result = validateExplicitAllocations({
      paymentAmountMinor: 500_000,
      allocations: [{ obligationKind: "trader_bill", targetId: "a", appliedMinor: 300_000 }],
      remaindersByTargetId: { a: 300_000 },
    });
    expect(result.unappliedMinor).toBe(200_000);
  });

  it("rejects duplicate targets and over-allocation", () => {
    expect(() =>
      validateExplicitAllocations({
        paymentAmountMinor: 100_000,
        allocations: [
          { obligationKind: "trader_bill", targetId: "a", appliedMinor: 40_000 },
          { obligationKind: "trader_bill", targetId: "a", appliedMinor: 40_000 },
        ],
        remaindersByTargetId: { a: 100_000 },
      }),
    ).toThrow(DomainError);

    expect(() =>
      validateExplicitAllocations({
        paymentAmountMinor: 100_000,
        allocations: [{ obligationKind: "trader_bill", targetId: "a", appliedMinor: 150_000 }],
        remaindersByTargetId: { a: 100_000 },
      }),
    ).toThrow(DomainError);

    expect(() => obligationRemainingAmountMinor(100, 150)).toThrow(DomainError);
  });

  it("posts a negative ledger amount for receipts and payouts", () => {
    expect(paymentLedgerAmountMinor(400_000)).toBe(-400_000);
  });
});
