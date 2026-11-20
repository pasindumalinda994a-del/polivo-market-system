import { describe, expect, it } from "vitest";

import { groupSaleRows, sumSaleMetrics } from "./load-report";
import type { ReportSaleLineRow } from "@polivo/db-cloud";

function line(
  partial: Partial<ReportSaleLineRow> & Pick<ReportSaleLineRow, "saleLineId">,
): ReportSaleLineRow {
  return {
    saleId: "sale-1",
    businessDate: "2026-11-01",
    recordedAt: "2026-11-01T00:00:00.000Z",
    postingSequence: 1,
    traderId: "t-1",
    traderDisplayName: "Trader One",
    farmerId: "f-1",
    farmerDisplayName: "Farmer",
    vegetableId: "v-1",
    vegetableCode: "TOM",
    vegetableDisplayName: "Tomato",
    packageCount: 2,
    netWeightHundredths: 10000,
    unitPricePerKgMinor: 50000,
    saleAmountMinor: 50000,
    commissionAmountMinor: 5000,
    farmerReceivesMinor: 45000,
    correctionStatus: "active",
    traderBillNumber: "B-1",
    ...partial,
  };
}

describe("sale aggregation helpers", () => {
  it("sums sale metrics across lines", () => {
    const totals = sumSaleMetrics([
      line({ saleLineId: "l1", saleAmountMinor: 100, commissionAmountMinor: 10, packageCount: 1 }),
      line({ saleLineId: "l2", saleAmountMinor: 200, commissionAmountMinor: 20, packageCount: 3 }),
    ]);
    expect(totals.gross_sale_minor).toBe(300);
    expect(totals.commission_minor).toBe(30);
    expect(totals.package_count).toBe(4);
  });

  it("groups rows by business date", () => {
    const rows = groupSaleRows(
      [
        line({ saleLineId: "a", businessDate: "2026-11-01" }),
        line({ saleLineId: "b", businessDate: "2026-11-01" }),
        line({ saleLineId: "c", businessDate: "2026-11-02" }),
      ],
      "business_date",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.metrics.gross_sale_minor).toBe(100000);
  });
});
