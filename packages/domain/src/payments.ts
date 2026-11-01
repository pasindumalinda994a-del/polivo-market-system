import { DomainError, type MoneyMinor } from "./money.js";

export type UnpaidBill = {
  billId: string;
  /** Outstanding remaining amount in minor units (> 0). */
  outstandingMinor: MoneyMinor;
  /** Older bills should sort earlier; callers may pass ISO timestamps. */
  finalizedAt: string;
};

export type PaymentAllocation = {
  billId: string;
  appliedMinor: MoneyMinor;
};

export type AllocatePaymentResult = {
  allocations: PaymentAllocation[];
  creditMinor: MoneyMinor;
  remainingOutstandingByBillId: Record<string, MoneyMinor>;
};

function assertNonNegativeMoney(value: MoneyMinor, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("INVALID_MONEY", `${label} must be a non-negative safe integer`);
  }
}

/**
 * Allocate a payment to unpaid bills oldest-first.
 * Extra money becomes customer credit.
 */
export function allocatePaymentOldestFirst(
  bills: readonly UnpaidBill[],
  paymentMinor: MoneyMinor,
): AllocatePaymentResult {
  assertNonNegativeMoney(paymentMinor, "paymentMinor");

  const sorted = [...bills].sort((a, b) => {
    if (a.finalizedAt < b.finalizedAt) return -1;
    if (a.finalizedAt > b.finalizedAt) return 1;
    return a.billId.localeCompare(b.billId);
  });

  const remainingOutstandingByBillId: Record<string, MoneyMinor> = {};
  for (const bill of sorted) {
    assertNonNegativeMoney(bill.outstandingMinor, "outstandingMinor");
    if (bill.outstandingMinor === 0) {
      throw new DomainError("INVALID_BILL", "Unpaid bill outstanding must be greater than zero");
    }
    if (bill.billId.length === 0) {
      throw new DomainError("INVALID_BILL", "Bill id is required");
    }
    remainingOutstandingByBillId[bill.billId] = bill.outstandingMinor;
  }

  let remainingPayment = paymentMinor;
  const allocations: PaymentAllocation[] = [];

  for (const bill of sorted) {
    if (remainingPayment === 0) break;
    const outstanding = remainingOutstandingByBillId[bill.billId]!;
    const applied = remainingPayment < outstanding ? remainingPayment : outstanding;
    allocations.push({ billId: bill.billId, appliedMinor: applied });
    remainingOutstandingByBillId[bill.billId] = outstanding - applied;
    remainingPayment -= applied;
  }

  return {
    allocations,
    creditMinor: remainingPayment,
    remainingOutstandingByBillId,
  };
}

/**
 * Apply a previously recorded farmer advance against a settlement amount.
 * Advance consumed cannot exceed the settlement; unused advance remains.
 */
export function applyFarmerAdvance(
  settlementMinor: MoneyMinor,
  advanceMinor: MoneyMinor,
): {
  netPayoutMinor: MoneyMinor;
  advanceConsumedMinor: MoneyMinor;
  advanceRemainingMinor: MoneyMinor;
} {
  assertNonNegativeMoney(settlementMinor, "settlementMinor");
  assertNonNegativeMoney(advanceMinor, "advanceMinor");

  const advanceConsumedMinor = advanceMinor < settlementMinor ? advanceMinor : settlementMinor;
  return {
    netPayoutMinor: settlementMinor - advanceConsumedMinor,
    advanceConsumedMinor,
    advanceRemainingMinor: advanceMinor - advanceConsumedMinor,
  };
}

export function paymentStatusForOutstanding(
  originalTotalMinor: MoneyMinor,
  outstandingMinor: MoneyMinor,
): "unpaid" | "partially_paid" | "fully_paid" {
  assertNonNegativeMoney(originalTotalMinor, "originalTotalMinor");
  assertNonNegativeMoney(outstandingMinor, "outstandingMinor");
  if (outstandingMinor > originalTotalMinor) {
    throw new DomainError("INVALID_OUTSTANDING", "Outstanding cannot exceed the original total");
  }
  if (outstandingMinor === originalTotalMinor) return "unpaid";
  if (outstandingMinor === 0) return "fully_paid";
  return "partially_paid";
}
