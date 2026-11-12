import { DomainError } from "./money.js";

export type BillType = "farmer" | "trader";
export type PaymentReferenceType = "receipt" | "payout";

const FARMER_PREFIX = "F-";
const TRADER_PREFIX = "T-";
const RECEIPT_PREFIX = "R-";
const PAYOUT_PREFIX = "P-";

export function formatBillNumber(type: BillType, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new DomainError("INVALID_SEQUENCE", "Bill sequence must be a non-negative safe integer");
  }
  const prefix = type === "farmer" ? FARMER_PREFIX : TRADER_PREFIX;
  return `${prefix}${sequence}`;
}

export function isFarmerBillNumber(value: string): boolean {
  return /^F-\d+$/.test(value);
}

export function isTraderBillNumber(value: string): boolean {
  return /^T-\d+$/.test(value);
}

export function parseBillNumber(value: string): { type: BillType; sequence: number } {
  const farmer = /^F-(\d+)$/.exec(value);
  if (farmer) {
    return { type: "farmer", sequence: Number(farmer[1]) };
  }
  const trader = /^T-(\d+)$/.exec(value);
  if (trader) {
    return { type: "trader", sequence: Number(trader[1]) };
  }
  throw new DomainError("INVALID_BILL_NUMBER", "Bill number must match F-{digits} or T-{digits}");
}

export function formatPaymentReference(type: PaymentReferenceType, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new DomainError(
      "INVALID_SEQUENCE",
      "Payment sequence must be a non-negative safe integer",
    );
  }
  const prefix = type === "receipt" ? RECEIPT_PREFIX : PAYOUT_PREFIX;
  return `${prefix}${sequence}`;
}

export function isReceiptReference(value: string): boolean {
  return /^R-\d+$/.test(value);
}

export function isPayoutReference(value: string): boolean {
  return /^P-\d+$/.test(value);
}

export function parsePaymentReference(value: string): {
  type: PaymentReferenceType;
  sequence: number;
} {
  const receipt = /^R-(\d+)$/.exec(value);
  if (receipt) {
    return { type: "receipt", sequence: Number(receipt[1]) };
  }
  const payout = /^P-(\d+)$/.exec(value);
  if (payout) {
    return { type: "payout", sequence: Number(payout[1]) };
  }
  throw new DomainError(
    "INVALID_PAYMENT_REFERENCE",
    "Payment reference must match R-{digits} or P-{digits}",
  );
}
