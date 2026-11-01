import { DomainError } from "./money.js";

export type BillType = "farmer" | "trader";

const FARMER_PREFIX = "F-";
const TRADER_PREFIX = "T-";

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
