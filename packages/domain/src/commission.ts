import {
  DomainError,
  roundMoneyTimesWeight,
  type MoneyMinor,
  type WeightHundredths,
} from "./money.js";

/** Commission rate in money minor units per kilogram. */
export type CommissionRatePerKgMinor = MoneyMinor;

const BAND_LOW_EXCLUSIVE_MAX = 20_000; // Rs. 200.00
const BAND_HIGH_INCLUSIVE_MAX = 40_000; // Rs. 400.00
const RATE_BELOW = 500; // Rs. 5.00
const RATE_MID = 1_500; // Rs. 15.00
const RATE_ABOVE = 5_000; // Rs. 50.00

/**
 * Commission per kg from selling price per kg (minor units).
 * Below 200: 5; 200–400 inclusive: 15; above 400: 50.
 */
export function commissionRatePerKgMinor(
  sellingPricePerKgMinor: MoneyMinor,
): CommissionRatePerKgMinor {
  if (!Number.isSafeInteger(sellingPricePerKgMinor) || sellingPricePerKgMinor < 0) {
    throw new DomainError(
      "INVALID_PRICE",
      "Selling price per kg must be a non-negative safe integer",
    );
  }

  if (sellingPricePerKgMinor < BAND_LOW_EXCLUSIVE_MAX) {
    return RATE_BELOW;
  }
  if (sellingPricePerKgMinor <= BAND_HIGH_INCLUSIVE_MAX) {
    return RATE_MID;
  }
  return RATE_ABOVE;
}

/** Commission for a bag: ratePerKg × netWeight, half-up to minor units. */
export function commissionForNetWeight(
  sellingPricePerKgMinor: MoneyMinor,
  netWeightHundredths: WeightHundredths,
): MoneyMinor {
  if (!Number.isSafeInteger(netWeightHundredths) || netWeightHundredths < 0) {
    throw new DomainError("INVALID_WEIGHT", "Net weight must be a non-negative safe integer");
  }
  const rate = commissionRatePerKgMinor(sellingPricePerKgMinor);
  return roundMoneyTimesWeight(rate, netWeightHundredths);
}
