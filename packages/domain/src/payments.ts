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

export type ObligationKind = "trader_bill" | "farmer_sale_line" | "opening_balance";

export type ExplicitAllocationTarget = {
  obligationKind: ObligationKind;
  /** Stable target id: trader_bill_id, sale_line_id, or opening_draft_id. */
  targetId: string;
  appliedMinor: MoneyMinor;
};

export type ObligationRemainder = {
  obligationKind: ObligationKind;
  targetId: string;
  effectiveAmountMinor: MoneyMinor;
  activeAllocatedMinor: MoneyMinor;
  remainingMinor: MoneyMinor;
};

export type ValidatedExplicitAllocations = {
  allocations: ExplicitAllocationTarget[];
  allocatedTotalMinor: MoneyMinor;
  unappliedMinor: MoneyMinor;
  remainingByTargetId: Record<string, MoneyMinor>;
};

function assertNonNegativeMoney(value: MoneyMinor, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("INVALID_MONEY", `${label} must be a non-negative safe integer`);
  }
}

function finalizedAtEpochMs(finalizedAt: string): number {
  const epochMs = Date.parse(finalizedAt);
  if (Number.isNaN(epochMs)) {
    throw new DomainError("INVALID_BILL", "Bill finalizedAt must be a valid absolute timestamp");
  }
  return epochMs;
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

  const seenBillIds = new Set<string>();
  for (const bill of bills) {
    if (bill.billId.length === 0) {
      throw new DomainError("INVALID_BILL", "Bill id is required");
    }
    if (seenBillIds.has(bill.billId)) {
      throw new DomainError("INVALID_BILL", `Duplicate bill id: ${bill.billId}`);
    }
    seenBillIds.add(bill.billId);
  }

  const sorted = [...bills].sort((a, b) => {
    const aMs = finalizedAtEpochMs(a.finalizedAt);
    const bMs = finalizedAtEpochMs(b.finalizedAt);
    if (aMs < bMs) return -1;
    if (aMs > bMs) return 1;
    return a.billId.localeCompare(b.billId);
  });

  const remainingOutstandingByBillId: Record<string, MoneyMinor> = {};
  for (const bill of sorted) {
    assertNonNegativeMoney(bill.outstandingMinor, "outstandingMinor");
    if (bill.outstandingMinor === 0) {
      throw new DomainError("INVALID_BILL", "Unpaid bill outstanding must be greater than zero");
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

export function assertPositivePaymentAmount(amountMinor: MoneyMinor): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new DomainError("INVALID_MONEY", "Payment amount must be a positive safe integer");
  }
}

/**
 * Payment available = posted payment amount − active allocations.
 * Rejects negative results instead of clamping.
 */
export function paymentAvailableAmountMinor(
  paymentAmountMinor: MoneyMinor,
  activeAllocatedMinor: MoneyMinor,
): MoneyMinor {
  assertPositivePaymentAmount(paymentAmountMinor);
  assertNonNegativeMoney(activeAllocatedMinor, "activeAllocatedMinor");
  const available = paymentAmountMinor - activeAllocatedMinor;
  if (available < 0) {
    throw new DomainError(
      "INVALID_ALLOCATION",
      "Active allocations exceed the posted payment amount",
    );
  }
  return available;
}

/**
 * Obligation remaining = effective obligation amount − active settlement allocations.
 * Rejects negative results instead of clamping.
 */
export function obligationRemainingAmountMinor(
  effectiveAmountMinor: MoneyMinor,
  activeAllocatedMinor: MoneyMinor,
): MoneyMinor {
  assertNonNegativeMoney(effectiveAmountMinor, "effectiveAmountMinor");
  assertNonNegativeMoney(activeAllocatedMinor, "activeAllocatedMinor");
  const remaining = effectiveAmountMinor - activeAllocatedMinor;
  if (remaining < 0) {
    throw new DomainError(
      "INVALID_ALLOCATION",
      "Active allocations exceed the obligation effective amount",
    );
  }
  return remaining;
}

export function buildObligationRemainder(input: {
  obligationKind: ObligationKind;
  targetId: string;
  effectiveAmountMinor: MoneyMinor;
  activeAllocatedMinor: MoneyMinor;
}): ObligationRemainder {
  if (input.targetId.length === 0) {
    throw new DomainError("INVALID_OBLIGATION", "Obligation target id is required");
  }
  const remainingMinor = obligationRemainingAmountMinor(
    input.effectiveAmountMinor,
    input.activeAllocatedMinor,
  );
  return {
    obligationKind: input.obligationKind,
    targetId: input.targetId,
    effectiveAmountMinor: input.effectiveAmountMinor,
    activeAllocatedMinor: input.activeAllocatedMinor,
    remainingMinor,
  };
}

/**
 * Validate explicit operator-reviewed allocations against a payment amount and
 * current obligation remainders. Does not redistribute amounts.
 */
export function validateExplicitAllocations(input: {
  paymentAmountMinor: MoneyMinor;
  allocations: readonly ExplicitAllocationTarget[];
  remaindersByTargetId: Readonly<Record<string, MoneyMinor>>;
}): ValidatedExplicitAllocations {
  assertPositivePaymentAmount(input.paymentAmountMinor);

  const seen = new Set<string>();
  let allocatedTotalMinor = 0;
  const remainingByTargetId: Record<string, MoneyMinor> = {
    ...input.remaindersByTargetId,
  };

  for (const allocation of input.allocations) {
    if (allocation.targetId.length === 0) {
      throw new DomainError("INVALID_ALLOCATION", "Allocation target id is required");
    }
    if (seen.has(allocation.targetId)) {
      throw new DomainError(
        "INVALID_ALLOCATION",
        `Duplicate allocation target: ${allocation.targetId}`,
      );
    }
    seen.add(allocation.targetId);

    if (!Number.isSafeInteger(allocation.appliedMinor) || allocation.appliedMinor <= 0) {
      throw new DomainError(
        "INVALID_ALLOCATION",
        "Allocation applied amount must be a positive safe integer",
      );
    }

    const remaining = remainingByTargetId[allocation.targetId];
    if (remaining === undefined) {
      throw new DomainError(
        "INVALID_ALLOCATION",
        `Unknown or ineligible allocation target: ${allocation.targetId}`,
      );
    }
    if (allocation.appliedMinor > remaining) {
      throw new DomainError(
        "INVALID_ALLOCATION",
        `Allocation exceeds remaining amount for target ${allocation.targetId}`,
      );
    }

    remainingByTargetId[allocation.targetId] = remaining - allocation.appliedMinor;
    allocatedTotalMinor += allocation.appliedMinor;
  }

  if (allocatedTotalMinor > input.paymentAmountMinor) {
    throw new DomainError(
      "INVALID_ALLOCATION",
      "Allocated total exceeds the payment amount",
    );
  }

  return {
    allocations: [...input.allocations],
    allocatedTotalMinor,
    unappliedMinor: input.paymentAmountMinor - allocatedTotalMinor,
    remainingByTargetId,
  };
}

/** Effects of a full payment reversal on the payment available amount. */
export function paymentReversalReleasedAmountMinor(
  activeAllocatedMinor: MoneyMinor,
): MoneyMinor {
  assertNonNegativeMoney(activeAllocatedMinor, "activeAllocatedMinor");
  return activeAllocatedMinor;
}

/** Aggregate bill settlement from obligation remainders that belong to the bill. */
export function aggregateBillSettlement(input: {
  originalTotalMinor: MoneyMinor;
  obligationRemainders: readonly ObligationRemainder[];
}): {
  originalAmountMinor: MoneyMinor;
  activeAllocatedMinor: MoneyMinor;
  remainingMinor: MoneyMinor;
  paymentStatus: "unpaid" | "partially_paid" | "fully_paid";
} {
  assertNonNegativeMoney(input.originalTotalMinor, "originalTotalMinor");
  let remainingMinor = 0;
  let activeAllocatedMinor = 0;
  for (const item of input.obligationRemainders) {
    remainingMinor += item.remainingMinor;
    activeAllocatedMinor += item.activeAllocatedMinor;
  }
  if (remainingMinor > input.originalTotalMinor) {
    throw new DomainError(
      "INVALID_OUTSTANDING",
      "Aggregated remaining cannot exceed the original bill total",
    );
  }
  return {
    originalAmountMinor: input.originalTotalMinor,
    activeAllocatedMinor,
    remainingMinor,
    paymentStatus: paymentStatusForOutstanding(input.originalTotalMinor, remainingMinor),
  };
}

/** Ledger amount for a buyer receipt or farmer payout (natural-sign reduction). */
export function paymentLedgerAmountMinor(paymentAmountMinor: MoneyMinor): MoneyMinor {
  assertPositivePaymentAmount(paymentAmountMinor);
  return -paymentAmountMinor;
}
