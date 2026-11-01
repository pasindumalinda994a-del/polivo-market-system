import { commissionForNetWeight } from "./commission.js";
import {
  DomainError,
  roundMoneyTimesWeight,
  type MoneyMinor,
  type WeightHundredths,
} from "./money.js";
import { netWeightHundredths } from "./weight.js";

export type SaleLineInput = {
  grossWeightHundredths: WeightHundredths;
  packagingWeightHundredths?: WeightHundredths;
  sellingPricePerKgMinor: MoneyMinor;
};

export type SaleLineResult = {
  netWeightHundredths: WeightHundredths;
  saleAmountMinor: MoneyMinor;
  commissionMinor: MoneyMinor;
  /** Full selling price paid by the trader. */
  traderPaysMinor: MoneyMinor;
  /** Farmer receipt before separate money deductions. */
  farmerReceivesBeforeDeductionsMinor: MoneyMinor;
};

/**
 * Calculate one bag/sale line using net weight, per-bag half-up rounding,
 * and confirmed commission bands.
 */
export function calculateSaleLine(input: SaleLineInput): SaleLineResult {
  const packaging = input.packagingWeightHundredths ?? 0;
  const net = netWeightHundredths(input.grossWeightHundredths, packaging);

  if (!Number.isSafeInteger(input.sellingPricePerKgMinor) || input.sellingPricePerKgMinor < 0) {
    throw new DomainError(
      "INVALID_PRICE",
      "Selling price per kg must be a non-negative safe integer",
    );
  }

  const saleAmountMinor = roundMoneyTimesWeight(input.sellingPricePerKgMinor, net);
  const commissionMinor = commissionForNetWeight(input.sellingPricePerKgMinor, net);
  const farmerReceivesBeforeDeductionsMinor = saleAmountMinor - commissionMinor;

  return {
    netWeightHundredths: net,
    saleAmountMinor,
    commissionMinor,
    traderPaysMinor: saleAmountMinor,
    farmerReceivesBeforeDeductionsMinor,
  };
}
