import { describe, expect, it } from "vitest";

import { buildTestPageRenderInput, renderPrintDocumentHtml } from "./print-templates.js";
import { printViewModelToRenderInput } from "./print-view-model-render.js";

describe("print templates", () => {
  it("renders buyer bill amounts exactly and escapes markup", () => {
    const html = renderPrintDocumentHtml(
      printViewModelToRenderInput({
        documentKind: "buyer_bill",
        stallIdentity: {
          displayName: "Stall <A>",
          address: null,
          provenance: "historical",
        },
        statusAnnotation: { label: "Superseded" },
        printMetadata: {
          classification: "reprint",
          reprintLabel: "REPRINT",
          printedAt: "2026-11-12T10:00:00.000Z",
          attemptReference: "A-1",
          paperProfile: "a4-paged-test",
          templateId: "buyer_bill",
          templateVersion: "1",
        },
        content: {
          kind: "buyer_bill",
          bill: {
            billNumber: "T-444444",
            businessDate: "2026-11-12",
            traderDisplayName: "Buyer <script>",
            traderShortCode: "B1",
            totalAmountMinor: 123456,
            finalizedAt: "2026-11-12T09:00:00.000Z",
            lines: [
              {
                vegetableDisplayName: "Beans & Peas",
                packageTypeDisplayName: "Bag",
                netWeightHundredths: 15050,
                unitPricePerKgMinor: 10000,
                traderPaysMinor: 123456,
              },
            ],
          },
        },
      }),
    );

    expect(html).toContain("T-444444");
    expect(html).toContain("1,234.56");
    expect(html).toContain("150.50");
    expect(html).toContain("REPRINT");
    expect(html).toContain("Superseded");
    expect(html).toContain("Stall &lt;A&gt;");
    expect(html).toContain("Buyer &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders farmer bill commission and net totals", () => {
    const html = renderPrintDocumentHtml(
      printViewModelToRenderInput({
        documentKind: "farmer_bill",
        stallIdentity: {
          displayName: "Polivo Stall",
          address: "Market Road",
          provenance: "current_unverified",
        },
        statusAnnotation: { label: "Current" },
        printMetadata: {
          classification: "initial",
          reprintLabel: null,
          printedAt: "2026-11-12T10:00:00.000Z",
          attemptReference: "A-2",
          paperProfile: "thermal-80mm-test",
          templateId: "farmer_bill",
          templateVersion: "1",
        },
        content: {
          kind: "farmer_bill",
          bill: {
            billNumber: "F-111111",
            businessDate: "2026-11-12",
            farmerDisplayName: "ගොවියා",
            farmerShortCode: "F1",
            coveredBusinessDateFrom: "2026-11-10",
            coveredBusinessDateTo: "2026-11-12",
            totalAmountMinor: 90000,
            totalSaleAmountMinor: 100000,
            totalCommissionMinor: 10000,
            totalFarmerReceivesMinor: 90000,
            finalizedAt: "2026-11-12T09:00:00.000Z",
            lines: [
              {
                vegetableDisplayName: "කැරට්",
                netWeightHundredths: 20000,
                saleAmountMinor: 100000,
                commissionAmountMinor: 10000,
                farmerReceivesMinor: 90000,
              },
            ],
          },
        },
      }),
    );

    expect(html).toContain("F-111111");
    expect(html).toContain("ගොවියා");
    expect(html).toContain("කැරට්");
    expect(html).toContain("1,000.00");
    expect(html).toContain("100.00");
    expect(html).toContain("900.00");
    expect(html).toContain("current local print settings");
  });

  it("renders test page without bill numbers", () => {
    const html = renderPrintDocumentHtml(
      buildTestPageRenderInput({
        paperProfile: "thermal-80mm-test",
        printedAt: "2026-11-12T10:00:00.000Z",
        attemptReference: "TEST-1",
      }),
    );
    expect(html).toContain("TEST PAGE");
    expect(html).toContain("නමුනා මුදල්");
    expect(html).not.toMatch(/T-\d{6}/);
    expect(html).not.toMatch(/F-\d{6}/);
  });
});
