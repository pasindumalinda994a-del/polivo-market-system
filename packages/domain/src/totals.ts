import { calculateSaleLine, type SaleLineInput, type SaleLineResult } from "./sale-line.js";
import { DomainError, sumMoneyMinor, type MoneyMinor } from "./money.js";

export type MoneyDeduction = {
  description: string;
  amountMinor: MoneyMinor;
};

export type SaleLinesTotals = {
  lines: SaleLineResult[];
  totalSaleAmountMinor: MoneyMinor;
  totalCommissionMinor: MoneyMinor;
  totalTraderPaysMinor: MoneyMinor;
  totalFarmerReceivesBeforeDeductionsMinor: MoneyMinor;
};

export function totalSaleLines(lines: readonly SaleLineInput[]): SaleLinesTotals {
  const calculated = lines.map((line) => calculateSaleLine(line));
  return {
    lines: calculated,
    totalSaleAmountMinor: sumMoneyMinor(calculated.map((line) => line.saleAmountMinor)),
    totalCommissionMinor: sumMoneyMinor(calculated.map((line) => line.commissionMinor)),
    totalTraderPaysMinor: sumMoneyMinor(calculated.map((line) => line.traderPaysMinor)),
    totalFarmerReceivesBeforeDeductionsMinor: sumMoneyMinor(
      calculated.map((line) => line.farmerReceivesBeforeDeductionsMinor),
    ),
  };
}

/**
 * Apply separate money deductions (transport, loading, packaging charges, etc.)
 * to a farmer settlement amount. Descriptions are required and preserved by callers.
 */
export function applyFarmerMoneyDeductions(
  farmerReceivesBeforeDeductionsMinor: MoneyMinor,
  deductions: readonly MoneyDeduction[],
): { totalDeductionsMinor: MoneyMinor; farmerReceivesMinor: MoneyMinor } {
  if (!Number.isSafeInteger(farmerReceivesBeforeDeductionsMinor)) {
    throw new DomainError("INVALID_MONEY", "Farmer amount must be a safe integer");
  }

  for (const deduction of deductions) {
    if (typeof deduction.description !== "string" || deduction.description.length === 0) {
      throw new DomainError("INVALID_DEDUCTION", "Each deduction requires a description");
    }
    if (!Number.isSafeInteger(deduction.amountMinor) || deduction.amountMinor < 0) {
      throw new DomainError(
        "INVALID_DEDUCTION",
        "Each deduction amount must be a non-negative safe integer",
      );
    }
  }

  const totalDeductionsMinor = sumMoneyMinor(deductions.map((d) => d.amountMinor));
  return {
    totalDeductionsMinor,
    farmerReceivesMinor: farmerReceivesBeforeDeductionsMinor - totalDeductionsMinor,
  };
}
