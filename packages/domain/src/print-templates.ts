import {
  escapePrintText,
  formatMoneyMinorForPrint,
  formatWeightHundredthsForPrint,
} from "./printing.js";

export type PrintTemplateRenderInput = {
  templateId:
    | "buyer_bill"
    | "farmer_bill"
    | "payment_receipt"
    | "account_statement"
    | "test_page";
  templateVersion: "1";
  paperProfile: "thermal-80mm-test" | "a4-paged-test";
  stallDisplayName: string;
  stallAddress: string | null;
  stallProvenanceLabel: string;
  statusLabel: string;
  reprintLabel: string | null;
  printedAt: string;
  attemptReference: string;
  title: string;
  subtitle: string | null;
  metaRows: readonly { label: string; value: string }[];
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  totals: readonly { label: string; value: string }[];
  footnotes: readonly string[];
};

function pageCss(paperProfile: PrintTemplateRenderInput["paperProfile"]): string {
  if (paperProfile === "thermal-80mm-test") {
    return `
      @page { size: 80mm auto; margin: 3mm; }
      body { width: 74mm; font-size: 11pt; }
      table { width: 100%; }
      th, td { font-size: 10pt; }
    `;
  }
  return `
    @page { size: A4; margin: 12mm; }
    body { width: auto; font-size: 11pt; }
    table { width: 100%; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  `;
}

/** Renders a trusted print document. All dynamic strings must already be plain text. */
export function renderPrintDocumentHtml(input: PrintTemplateRenderInput): string {
  const e = escapePrintText;
  const meta = input.metaRows
    .map(
      (row) =>
        `<div class="meta-row"><span class="meta-label">${e(row.label)}</span><span>${e(row.value)}</span></div>`,
    )
    .join("");
  const headerCells = input.columns.map((col) => `<th>${e(col)}</th>`).join("");
  const bodyRows = input.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${e(cell)}</td>`).join("")}</tr>`)
    .join("");
  const totals = input.totals
    .map(
      (row) =>
        `<div class="total-row"><span>${e(row.label)}</span><strong>${e(row.value)}</strong></div>`,
    )
    .join("");
  const footnotes = input.footnotes.map((note) => `<p class="footnote">${e(note)}</p>`).join("");
  const reprint =
    input.reprintLabel === null
      ? ""
      : `<div class="reprint">${e(input.reprintLabel)}</div>`;
  const status =
    input.statusLabel === "Current"
      ? ""
      : `<div class="status">${e(input.statusLabel)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${e(input.title)}</title>
  <style>
    @font-face {
      font-family: "Inter";
      src: local("Inter"), local("Segoe UI");
      font-weight: 400 700;
    }
    @font-face {
      font-family: "Noto Sans Sinhala";
      src: local("Noto Sans Sinhala"), local("Nirmala UI");
      font-weight: 400 700;
    }
    body {
      margin: 0;
      color: #000;
      background: #fff;
      font-family: "Inter", "Noto Sans Sinhala", sans-serif;
      line-height: 1.5;
    }
    ${pageCss(input.paperProfile)}
    .banner { font-weight: 700; font-size: 14pt; margin-bottom: 4px; }
    .subtitle { margin: 0 0 8px; }
    .reprint, .status {
      border: 1px solid #000;
      display: inline-block;
      padding: 2px 6px;
      margin: 0 6px 8px 0;
      font-weight: 700;
      text-transform: uppercase;
    }
    .meta-row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .meta-label { font-weight: 600; }
    table { border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #000; text-align: left; padding: 4px 2px; vertical-align: top; }
    th { font-weight: 700; }
    .total-row { display: flex; justify-content: space-between; margin-top: 4px; }
    .footnote { font-size: 9pt; margin-top: 10px; }
    .provenance { font-size: 9pt; margin-top: 6px; }
    .align-markers { display: flex; justify-content: space-between; margin: 8px 0; font-size: 9pt; }
  </style>
</head>
<body>
  <div class="banner">${e(input.stallDisplayName)}</div>
  ${input.stallAddress ? `<div>${e(input.stallAddress)}</div>` : ""}
  <div class="provenance">${e(input.stallProvenanceLabel)}</div>
  ${reprint}${status}
  <h1 style="font-size:14pt;margin:8px 0 4px;">${e(input.title)}</h1>
  ${input.subtitle ? `<p class="subtitle">${e(input.subtitle)}</p>` : ""}
  ${meta}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div style="margin-top:10px;">${totals}</div>
  ${footnotes}
  <div class="footnote">Printed ${e(input.printedAt)} · Attempt ${e(input.attemptReference)} · Template ${e(input.templateId)} v${e(input.templateVersion)}</div>
</body>
</html>`;
}

export function moneyCell(amountMinor: number): string {
  return formatMoneyMinorForPrint(amountMinor);
}

export function weightCell(weightHundredths: number): string {
  return formatWeightHundredthsForPrint(weightHundredths);
}

export function buildTestPageRenderInput(args: {
  paperProfile: "thermal-80mm-test" | "a4-paged-test";
  printedAt: string;
  attemptReference: string;
}): PrintTemplateRenderInput {
  return {
    templateId: "test_page",
    templateVersion: "1",
    paperProfile: args.paperProfile,
    stallDisplayName: "Polivo",
    stallAddress: null,
    stallProvenanceLabel: "TEST PAGE — nonfinancial",
    statusLabel: "Current",
    reprintLabel: null,
    printedAt: args.printedAt,
    attemptReference: args.attemptReference,
    title: "Polivo printer test",
    subtitle: `Profile ${args.paperProfile}`,
    metaRows: [
      { label: "Application", value: "polivo" },
      { label: "Profile", value: args.paperProfile },
    ],
    columns: ["Item", "Sinhala", "Amount"],
    rows: [
      ["Sample English", "නමුනා මුදල්", moneyCell(123456)],
      ["Alignment L", "සමපාතය", moneyCell(100)],
      ["Alignment R", "පරීක්ෂාව", moneyCell(999999)],
    ],
    totals: [{ label: "Sample total", value: moneyCell(1123555) }],
    footnotes: [
      "This page does not use a real bill number and creates no financial records.",
      "|||| LEFT ALIGN |||| CENTER |||| RIGHT ALIGN ||||",
    ],
  };
}
