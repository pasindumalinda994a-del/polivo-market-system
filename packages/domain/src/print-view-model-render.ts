import type { PrintTemplateRenderInput } from "./print-templates.js";
import { moneyCell, weightCell } from "./print-templates.js";

/** Minimal view-model shape accepted by the renderer (mirrors contracts PrintViewModelDto). */
export type PrintableViewModel = {
  documentKind: string;
  stallIdentity: {
    displayName: string;
    address: string | null;
    provenance: "historical" | "current_unverified";
  };
  statusAnnotation: { label: string };
  printMetadata: {
    classification: "initial" | "reprint";
    reprintLabel: string | null;
    printedAt: string;
    attemptReference: string;
    paperProfile: "thermal-80mm-test" | "a4-paged-test";
    templateId:
      "buyer_bill" | "farmer_bill" | "payment_receipt" | "account_statement" | "test_page";
    templateVersion: "1";
  };
  content: {
    kind: string;
    bill?: {
      billNumber: string;
      billType?: string;
      businessDate: string;
      traderDisplayName?: string;
      traderShortCode?: string;
      farmerDisplayName?: string;
      farmerShortCode?: string;
      coveredBusinessDateFrom?: string;
      coveredBusinessDateTo?: string;
      totalAmountMinor: number;
      totalSaleAmountMinor?: number;
      totalCommissionMinor?: number;
      totalFarmerReceivesMinor?: number;
      finalizedAt: string;
      lines: Array<Record<string, unknown>>;
    };
    payment?: {
      referenceNumber: string;
      direction: string;
      method: string;
      amountMinor: number;
      businessDate: string;
      status: string;
      allocatedTotalMinor: number;
      unappliedAmountMinor: number;
      note: string | null;
      chequeNumber?: string | null;
      issuingBankLabel?: string | null;
      paidAt: string;
      allocations: Array<{
        obligationKind: string;
        appliedAmountMinor: number;
      }>;
    };
    statement?: {
      header: {
        partyDisplayName: string;
        partyKind: string;
        dateFrom: string;
        dateTo: string;
        dateBasis: string;
      };
      summary: {
        openingBalanceMinor: number;
        closingBalanceMinor: number;
        periodIncreaseMinor: number;
        periodDecreaseMinor: number;
      };
      reporting: {
        dataCutoffAt: string;
        snapshotToken: string;
      };
      rows: Array<{
        businessDate: string;
        description: string;
        increaseMinor: number;
        decreaseMinor: number;
        runningBalanceMinor: number;
      }>;
    };
    sampleSinhala?: string;
    sampleEnglish?: string;
    profileId?: string;
  };
};

function provenanceLabel(provenance: "historical" | "current_unverified"): string {
  return provenance === "historical"
    ? "Stall identity from issued document snapshot"
    : "Stall identity from current local print settings (not a verified historical snapshot)";
}

export function printViewModelToRenderInput(
  viewModel: PrintableViewModel,
): PrintTemplateRenderInput {
  const meta = viewModel.printMetadata;
  const base = {
    templateId: meta.templateId,
    templateVersion: meta.templateVersion,
    paperProfile: meta.paperProfile,
    stallDisplayName: viewModel.stallIdentity.displayName,
    stallAddress: viewModel.stallIdentity.address,
    stallProvenanceLabel: provenanceLabel(viewModel.stallIdentity.provenance),
    statusLabel: viewModel.statusAnnotation.label,
    reprintLabel: meta.reprintLabel,
    printedAt: meta.printedAt,
    attemptReference: meta.attemptReference,
  } as const;

  const content = viewModel.content;
  if (content.kind === "buyer_bill" && content.bill) {
    const bill = content.bill;
    return {
      ...base,
      title: "Buyer / trader bill",
      subtitle: bill.billNumber,
      metaRows: [
        {
          label: "Buyer",
          value: `${bill.traderDisplayName ?? ""} (${bill.traderShortCode ?? ""})`,
        },
        { label: "Business date", value: bill.businessDate },
        { label: "Issued", value: bill.finalizedAt },
      ],
      columns: ["Vegetable", "Pkg", "Net kg", "Price/kg", "Amount"],
      rows: bill.lines.map((line) => [
        String(line["vegetableDisplayName"] ?? ""),
        String(line["packageTypeDisplayName"] ?? ""),
        weightCell(Number(line["netWeightHundredths"] ?? 0)),
        moneyCell(Number(line["unitPricePerKgMinor"] ?? 0)),
        moneyCell(Number(line["traderPaysMinor"] ?? line["saleAmountMinor"] ?? 0)),
      ]),
      totals: [{ label: "Bill total", value: moneyCell(bill.totalAmountMinor) }],
      footnotes: ["Buyer bills do not show commission details."],
    };
  }

  if (content.kind === "farmer_bill" && content.bill) {
    const bill = content.bill;
    return {
      ...base,
      title: "Farmer bill",
      subtitle: bill.billNumber,
      metaRows: [
        {
          label: "Farmer",
          value: `${bill.farmerDisplayName ?? ""} (${bill.farmerShortCode ?? ""})`,
        },
        {
          label: "Covered sales",
          value: `${bill.coveredBusinessDateFrom ?? ""} → ${bill.coveredBusinessDateTo ?? ""}`,
        },
        { label: "Issued", value: bill.finalizedAt },
      ],
      columns: ["Vegetable", "Net kg", "Gross", "Commission", "Net"],
      rows: bill.lines.map((line) => [
        String(line["vegetableDisplayName"] ?? ""),
        weightCell(Number(line["netWeightHundredths"] ?? 0)),
        moneyCell(Number(line["saleAmountMinor"] ?? 0)),
        moneyCell(Number(line["commissionAmountMinor"] ?? 0)),
        moneyCell(Number(line["farmerReceivesMinor"] ?? 0)),
      ]),
      totals: [
        { label: "Gross", value: moneyCell(bill.totalSaleAmountMinor ?? 0) },
        { label: "Commission", value: moneyCell(bill.totalCommissionMinor ?? 0) },
        {
          label: "Net entitlement",
          value: moneyCell(bill.totalFarmerReceivesMinor ?? bill.totalAmountMinor),
        },
      ],
      footnotes: [],
    };
  }

  if (content.kind === "payment_receipt" && content.payment) {
    const payment = content.payment;
    return {
      ...base,
      title:
        payment.direction === "payout" ? "Farmer payout acknowledgement" : "Buyer payment receipt",
      subtitle: payment.referenceNumber,
      metaRows: [
        { label: "Method", value: payment.method },
        { label: "Business date", value: payment.businessDate },
        { label: "Status", value: payment.status },
        { label: "Paid at", value: payment.paidAt },
        ...(payment.chequeNumber
          ? [
              {
                label: "Cheque",
                value: `${payment.chequeNumber} / ${payment.issuingBankLabel ?? ""}`,
              },
            ]
          : []),
      ],
      columns: ["Allocation", "Amount"],
      rows: payment.allocations.map((allocation) => [
        allocation.obligationKind,
        moneyCell(allocation.appliedAmountMinor),
      ]),
      totals: [
        { label: "Amount", value: moneyCell(payment.amountMinor) },
        { label: "Allocated", value: moneyCell(payment.allocatedTotalMinor) },
        { label: "Unapplied", value: moneyCell(payment.unappliedAmountMinor) },
      ],
      footnotes: [
        ...(payment.note ? [payment.note] : []),
        ...(payment.method === "cheque"
          ? ["Cheque handover recorded operationally. Does not imply bank clearance."]
          : []),
        "Printing this receipt does not record another payment.",
      ],
    };
  }

  if (content.kind === "account_statement" && content.statement) {
    const statement = content.statement;
    return {
      ...base,
      title: "Account statement",
      subtitle: `${statement.header.partyDisplayName} (${statement.header.partyKind})`,
      metaRows: [
        {
          label: "Period",
          value: `${statement.header.dateFrom} → ${statement.header.dateTo} (${statement.header.dateBasis})`,
        },
        { label: "Data cutoff", value: statement.reporting.dataCutoffAt },
      ],
      columns: ["Date", "Description", "Increase", "Decrease", "Balance"],
      rows: statement.rows.map((row) => [
        row.businessDate,
        row.description,
        moneyCell(row.increaseMinor),
        moneyCell(row.decreaseMinor),
        moneyCell(row.runningBalanceMinor),
      ]),
      totals: [
        { label: "Opening", value: moneyCell(statement.summary.openingBalanceMinor) },
        { label: "Period +", value: moneyCell(statement.summary.periodIncreaseMinor) },
        { label: "Period −", value: moneyCell(statement.summary.periodDecreaseMinor) },
        { label: "Closing", value: moneyCell(statement.summary.closingBalanceMinor) },
      ],
      footnotes: [
        "Statements do not receive bill numbers.",
        "Full snapshot — not only the on-screen page.",
      ],
    };
  }

  return {
    ...base,
    title: "Polivo printer test",
    subtitle: content.profileId ?? meta.paperProfile,
    metaRows: [
      { label: "Application", value: "polivo" },
      { label: "English", value: content.sampleEnglish ?? "Sample English" },
      { label: "Sinhala", value: content.sampleSinhala ?? "නමුනා මුදල්" },
    ],
    columns: ["Marker", "Text", "Amount"],
    rows: [
      ["LEFT", content.sampleEnglish ?? "Sample", moneyCell(100)],
      ["CENTER", content.sampleSinhala ?? "පරීක්ෂාව", moneyCell(123456)],
      ["RIGHT", "TEST", moneyCell(999999)],
    ],
    totals: [{ label: "Sample total", value: moneyCell(1123555) }],
    footnotes: ["TEST PAGE — no bill numbers; no financial records."],
  };
}
