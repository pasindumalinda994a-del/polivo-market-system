import { describe, expect, it } from "vitest";

import {
  allocatePaymentOldestFirst,
  applyFarmerAdvance,
  paymentStatusForOutstanding,
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
