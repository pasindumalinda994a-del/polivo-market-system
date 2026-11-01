import { z } from "zod";

/**
 * Monetary amount in integer minor units (paisa).
 * Rs. 1.00 → 100. Signed to allow reversals and credits.
 * Rejects non-integers and non-finite values.
 */
export const moneyMinorSchema = z.number().int().safe();

/**
 * Non-negative monetary amount in integer minor units (paisa).
 */
export const nonNegativeMoneyMinorSchema = z.number().int().safe().nonnegative();

/**
 * Weight in integer hundredths of a kilogram.
 * 25.50 kg → 2550. Non-negative only.
 */
export const weightHundredthsSchema = z.number().int().safe().nonnegative();

export const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PAYMENT_STATUSES = ["unpaid", "partially_paid", "fully_paid"] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

/**
 * Farmer bill number display form: F- followed by one or more digits.
 * Sequence assignment belongs to the stall service, not this schema.
 */
export const farmerBillNumberSchema = z
  .string()
  .regex(/^F-\d+$/, "Farmer bill number must match F-{digits}");

/**
 * Trader bill number display form: T- followed by one or more digits.
 */
export const traderBillNumberSchema = z
  .string()
  .regex(/^T-\d+$/, "Trader bill number must match T-{digits}");

export const billNumberSchema = z.union([farmerBillNumberSchema, traderBillNumberSchema]);

export type MoneyMinor = z.infer<typeof moneyMinorSchema>;
export type NonNegativeMoneyMinor = z.infer<typeof nonNegativeMoneyMinorSchema>;
export type WeightHundredths = z.infer<typeof weightHundredthsSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type FarmerBillNumber = z.infer<typeof farmerBillNumberSchema>;
export type TraderBillNumber = z.infer<typeof traderBillNumberSchema>;
export type BillNumber = z.infer<typeof billNumberSchema>;
