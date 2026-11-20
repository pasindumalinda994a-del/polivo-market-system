import { describe, expect, it } from "vitest";

import { CloudReportError } from "./errors.js";
import { mapReportPaymentRow, mapReportSaleLineRow, mapReportingWatermarks } from "./mappers.js";

describe("report mappers", () => {
  it("maps reporting watermarks from RPC snake_case rows", () => {
    const row = mapReportingWatermarks({
      max_posting_sequence: 42,
      max_allocation_created_at: "2026-01-02T00:00:00.000Z",
      max_allocation_id: "alloc-1",
      max_payment_recorded_at: "2026-01-03T00:00:00.000Z",
      max_payment_id: "pay-1",
      committed_cloud_cursor: 7,
    });
    expect(row.maxPostingSequence).toBe(42);
    expect(row.committedCloudCursor).toBe(7);
  });

  it("maps sale line money and weight BIGINT as strings", () => {
    const mapped = mapReportSaleLineRow({
      sale_line_id: "sl-1",
      sale_id: "sale-1",
      business_date: "2026-01-01",
      recorded_at: "2026-01-01T10:00:00.000Z",
      posting_sequence: "12",
      trader_id: "trader-1",
      trader_display_name: "Trader",
      farmer_id: "farmer-1",
      farmer_display_name: "Farmer",
      vegetable_id: "veg-1",
      vegetable_code: "TOM",
      vegetable_display_name: "Tomato",
      package_count: "3",
      net_weight_hundredths: "15000",
      unit_price_per_kg_minor: "25000",
      sale_amount_minor: "50000",
      commission_amount_minor: "1000",
      farmer_receives_minor: "49000",
      correction_status: "active",
      trader_bill_number: "444444",
    });
    expect(mapped.saleAmountMinor).toBe(50000);
    expect(mapped.netWeightHundredths).toBe(15000);
    expect(mapped.postingSequence).toBe(12);
  });

  it("rejects empty vegetable_code from legacy COALESCE footgun", () => {
    expect(() =>
      mapReportSaleLineRow({
        sale_line_id: "sl-1",
        sale_id: "sale-1",
        business_date: "2026-01-01",
        recorded_at: "2026-01-01T10:00:00.000Z",
        posting_sequence: "12",
        trader_id: "trader-1",
        trader_display_name: "Trader",
        farmer_id: null,
        farmer_display_name: null,
        vegetable_id: "veg-1",
        vegetable_code: "",
        vegetable_display_name: "Tomato",
        package_count: "1",
        net_weight_hundredths: "1000",
        unit_price_per_kg_minor: "100",
        sale_amount_minor: "100",
        commission_amount_minor: "0",
        farmer_receives_minor: "100",
        correction_status: "active",
        trader_bill_number: null,
      }),
    ).toThrow(CloudReportError);
    expect(() =>
      mapReportSaleLineRow({
        sale_line_id: "sl-1",
        sale_id: "sale-1",
        business_date: "2026-01-01",
        recorded_at: "2026-01-01T10:00:00.000Z",
        posting_sequence: "12",
        trader_id: "trader-1",
        trader_display_name: "Trader",
        farmer_id: null,
        farmer_display_name: null,
        vegetable_id: "veg-1",
        vegetable_code: "",
        vegetable_display_name: "Tomato",
        package_count: "1",
        net_weight_hundredths: "1000",
        unit_price_per_kg_minor: "100",
        sale_amount_minor: "100",
        commission_amount_minor: "0",
        farmer_receives_minor: "100",
        correction_status: "active",
        trader_bill_number: null,
      }),
    ).toThrow(/vegetable_code must be a non-empty string/);
  });

  it("maps catalog-fallback vegetable_code when RPC provides a real code", () => {
    const mapped = mapReportSaleLineRow({
      sale_line_id: "sl-legacy",
      sale_id: "sale-legacy",
      business_date: "2026-11-12",
      recorded_at: "2026-11-12T10:00:00.000Z",
      posting_sequence: "5",
      trader_id: "trader-1",
      trader_display_name: "Trader",
      farmer_id: "farmer-1",
      farmer_display_name: "Farmer",
      vegetable_id: "veg-1",
      // Simulates RPC COALESCE(NULLIF(line_snapshot,''), vegetables.short_code)
      vegetable_code: "TOM",
      vegetable_display_name: "Tomato",
      package_count: "2",
      net_weight_hundredths: "2000",
      unit_price_per_kg_minor: "25000",
      sale_amount_minor: "50000",
      commission_amount_minor: "1000",
      farmer_receives_minor: "49000",
      correction_status: "active",
      trader_bill_number: "444444",
    });
    expect(mapped.vegetableCode).toBe("TOM");
    expect(mapped.vegetableDisplayName).toBe("Tomato");
  });

  it("computes unapplied payment from allocated subtotal", () => {
    const mapped = mapReportPaymentRow({
      payment_id: "pay-1",
      business_date: "2026-01-01",
      recorded_at: "2026-01-01T10:00:00.000Z",
      party_kind: "farmer",
      farmer_id: "f-1",
      farmer_display_name: "Farmer",
      trader_id: null,
      trader_display_name: null,
      direction: "pay",
      method: "cash",
      amount_minor: "100000",
      status: "posted",
      reference_number: "P-1",
      allocated_total_minor: "25000",
    });
    expect(mapped.unappliedAmountMinor).toBe(75000);
  });
});
