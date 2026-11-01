import { DomainError, roundHalfUpRatio, type MoneyMinor, type WeightHundredths } from "./money.js";

export type FinalizedSalePricePoint = {
  /** Selling price per kg before commission, in minor units. */
  sellingPricePerKgMinor: MoneyMinor;
  netWeightHundredths: WeightHundredths;
  /** Sale value already rounded per bag (minor units), before commission. */
  saleAmountMinor: MoneyMinor;
  cancelled: boolean;
};

export type PublicPriceSummary = {
  lowPerKgMinor: MoneyMinor;
  highPerKgMinor: MoneyMinor;
  /** Average = total sale value ÷ total net kg, half-up to minor units per kg. */
  averagePerKgMinor: MoneyMinor;
  totalSaleValueMinor: MoneyMinor;
  totalNetWeightHundredths: WeightHundredths;
};

/**
 * Daily public prices from finalized, non-cancelled sales.
 * Uses selling prices before commission.
 */
export function summarizePublicPrices(
  sales: readonly FinalizedSalePricePoint[],
): PublicPriceSummary | null {
  const eligible = sales.filter((sale) => !sale.cancelled);
  if (eligible.length === 0) {
    return null;
  }

  let low = eligible[0]!.sellingPricePerKgMinor;
  let high = eligible[0]!.sellingPricePerKgMinor;
  let totalSaleValue = 0n;
  let totalNetWeight = 0n;

  for (const sale of eligible) {
    if (!Number.isSafeInteger(sale.sellingPricePerKgMinor) || sale.sellingPricePerKgMinor < 0) {
      throw new DomainError("INVALID_PRICE", "Selling price must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(sale.netWeightHundredths) || sale.netWeightHundredths < 0) {
      throw new DomainError("INVALID_WEIGHT", "Net weight must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(sale.saleAmountMinor) || sale.saleAmountMinor < 0) {
      throw new DomainError("INVALID_MONEY", "Sale amount must be a non-negative safe integer");
    }

    if (sale.sellingPricePerKgMinor < low) low = sale.sellingPricePerKgMinor;
    if (sale.sellingPricePerKgMinor > high) high = sale.sellingPricePerKgMinor;
    totalSaleValue += BigInt(sale.saleAmountMinor);
    totalNetWeight += BigInt(sale.netWeightHundredths);
  }

  if (totalNetWeight === 0n) {
    throw new DomainError("INVALID_WEIGHT", "Total net weight must be greater than zero");
  }

  // averagePerKg = totalSaleValue / (totalNetWeight / 100) = totalSaleValue * 100 / totalNetWeight
  const averagePerKgMinor = roundHalfUpRatio(totalSaleValue * 100n, totalNetWeight);

  return {
    lowPerKgMinor: low,
    highPerKgMinor: high,
    averagePerKgMinor,
    totalSaleValueMinor: Number(totalSaleValue),
    totalNetWeightHundredths: Number(totalNetWeight),
  };
}
