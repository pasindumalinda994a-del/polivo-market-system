import { DomainError, type MoneyMinor } from "./money.js";

export type FarmerChequePaymentInput = {
  farmerId: string;
  amountMinor: MoneyMinor;
  paidAt: string;
  staffId: string;
};

export type FarmerChequePaymentResult = {
  method: "cheque";
  farmerId: string;
  amountMinor: MoneyMinor;
  paidAt: string;
  staffId: string;
  /** Farmer outstanding is reduced immediately by this amount. */
  reducesOutstandingImmediately: true;
};

/**
 * Farmer cheque policy: when a cheque is handed to a farmer, record it as paid
 * immediately. No cheque number, bank details, or clearance status required.
 *
 * Trader cheque balance effects are not confirmed and must not use this helper.
 */
export function recordFarmerChequeAsPaid(
  input: FarmerChequePaymentInput,
): FarmerChequePaymentResult {
  if (input.farmerId.length === 0) {
    throw new DomainError("INVALID_FARMER", "Farmer id is required");
  }
  if (input.staffId.length === 0) {
    throw new DomainError("INVALID_STAFF", "Staff id is required");
  }
  if (input.paidAt.length === 0) {
    throw new DomainError("INVALID_DATE", "Payment date/time is required");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new DomainError(
      "INVALID_MONEY",
      "Cheque amount must be a positive safe integer minor amount",
    );
  }

  return {
    method: "cheque",
    farmerId: input.farmerId,
    amountMinor: input.amountMinor,
    paidAt: input.paidAt,
    staffId: input.staffId,
    reducesOutstandingImmediately: true,
  };
}
