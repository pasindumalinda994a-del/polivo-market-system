import type {
  PackageWeightEntryInput,
  SaleDraftLineRecordDto,
  SaleDraftRecordDto,
  UpdateSaleDraftRequest,
} from "@polivo/contracts";
import {
  moneyMinorFromMajorDecimalString,
  summarizePackageWeightEntry,
  weightHundredthsToMajorDecimalString,
} from "@polivo/domain";

import { createWeightEntryRow, type WeightEntryRowState } from "../WeightEntry";
import { newClientId } from "./billing-format";
import type { ReferenceOption } from "./ReferenceCombobox";

export type EditorLine = {
  clientKey: string;
  lineId?: string;
  farmer: ReferenceOption | null;
  vegetable: ReferenceOption | null;
  packageType: ReferenceOption | null;
  weightRows: WeightEntryRowState[];
  unitPriceText: string;
};

export type BillEditor = {
  saleId: string | null;
  revision: number | null;
  trader: ReferenceOption | null;
  businessDate: string;
  lines: EditorLine[];
  activeLineKey: string | null;
};

export function createEmptyLine(): EditorLine {
  return {
    clientKey: newClientId("line"),
    farmer: null,
    vegetable: null,
    packageType: null,
    weightRows: [createWeightEntryRow()],
    unitPriceText: "",
  };
}

export function createEmptyEditor(businessDate: string): BillEditor {
  const line = createEmptyLine();
  return {
    saleId: null,
    revision: null,
    trader: null,
    businessDate,
    lines: [line],
    activeLineKey: line.clientKey,
  };
}

export function editorFromDraft(
  draft: SaleDraftRecordDto,
  refs: {
    trader: ReferenceOption | null;
    farmers: Map<string, ReferenceOption>;
    vegetables: Map<string, ReferenceOption>;
    packageTypes: Map<string, ReferenceOption>;
  },
): BillEditor {
  const lines =
    draft.lines.length === 0
      ? [createEmptyLine()]
      : draft.lines.map((line) => lineRecordToEditor(line, refs));
  return {
    saleId: draft.id,
    revision: draft.revision,
    trader: refs.trader,
    businessDate: draft.businessDate,
    lines,
    activeLineKey: lines[0]?.clientKey ?? null,
  };
}

function lineRecordToEditor(
  line: SaleDraftLineRecordDto,
  refs: {
    farmers: Map<string, ReferenceOption>;
    vegetables: Map<string, ReferenceOption>;
    packageTypes: Map<string, ReferenceOption>;
  },
): EditorLine {
  const weightRows =
    line.weights.length === 0
      ? [createWeightEntryRow()]
      : [
          ...line.weights.map((row) => ({
            rowKey: row.rowKey,
            weightText: weightHundredthsToMajorDecimalString(row.grossWeightHundredths),
          })),
          createWeightEntryRow(),
        ];
  return {
    clientKey: line.lineId,
    lineId: line.lineId,
    farmer: refs.farmers.get(line.farmerId) ?? {
      id: line.farmerId,
      shortCode: "?",
      displayName: "Loaded farmer",
      active: true,
    },
    vegetable: refs.vegetables.get(line.vegetableId) ?? {
      id: line.vegetableId,
      shortCode: "?",
      displayName: "Loaded vegetable",
      active: true,
    },
    packageType: refs.packageTypes.get(line.packageTypeId) ?? {
      id: line.packageTypeId,
      shortCode: "?",
      displayName: "Loaded package",
      active: true,
    },
    weightRows,
    unitPriceText: formatMinorAsMajor(line.unitPricePerKgMinor),
  };
}

function formatMinorAsMajor(minor: number): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${minor < 0 ? "-" : ""}${whole}.${frac}`;
}

export type LineBuildResult =
  | { ok: true; line: UpdateSaleDraftRequest["lines"][number] }
  | { ok: false; message: string; field?: string };

export function buildLineInput(line: EditorLine): LineBuildResult {
  if (!line.farmer) {
    return { ok: false, message: "Select a farmer.", field: "farmer" };
  }
  if (!line.vegetable) {
    return { ok: false, message: "Select a vegetable.", field: "vegetable" };
  }
  if (!line.packageType) {
    return { ok: false, message: "Select a package type.", field: "packageType" };
  }
  const draftRows = line.weightRows.map((row) => ({
    rowKey: row.rowKey,
    weightText: row.weightText,
    packageTypeId: line.packageType!.id,
  }));
  const summary = summarizePackageWeightEntry({ rows: draftRows });
  if (summary.status !== "complete") {
    return {
      ok: false,
      message: summary.errors[0] ?? "Complete package weights before saving.",
      field: "weights",
    };
  }
  let unitPricePerKgMinor: number;
  try {
    unitPricePerKgMinor = moneyMinorFromMajorDecimalString(line.unitPriceText.trim());
  } catch {
    return { ok: false, message: "Enter a valid price per kilogram.", field: "price" };
  }
  if (unitPricePerKgMinor < 0) {
    return { ok: false, message: "Price cannot be negative.", field: "price" };
  }
  const weights: PackageWeightEntryInput = {
    rows: summary.rows.map((row) => ({
      rowKey: row.rowKey,
      packageTypeId: line.packageType!.id,
      grossWeightHundredths: row.grossWeightHundredths,
    })),
    packagingWeightHundredths: summary.packagingWeightHundredths,
  };
  return {
    ok: true,
    line: {
      lineId: line.lineId,
      farmerId: line.farmer.id,
      vegetableId: line.vegetable.id,
      packageTypeId: line.packageType.id,
      unitPricePerKgMinor,
      weights,
    },
  };
}

export function buildUpdateRequest(
  editor: BillEditor,
): { ok: true; request: UpdateSaleDraftRequest } | { ok: false; message: string } {
  if (!editor.trader) {
    return { ok: false, message: "Select a buyer before saving." };
  }
  if (editor.revision === null) {
    return { ok: false, message: "Draft revision is missing." };
  }
  const lines: UpdateSaleDraftRequest["lines"] = [];
  for (const line of editor.lines) {
    const hasAnyInput =
      line.farmer ||
      line.vegetable ||
      line.packageType ||
      line.unitPriceText.trim().length > 0 ||
      line.weightRows.some((row) => row.weightText.trim().length > 0);
    if (!hasAnyInput) {
      continue;
    }
    const built = buildLineInput(line);
    if (!built.ok) {
      return { ok: false, message: built.message };
    }
    lines.push(built.line);
  }
  return {
    ok: true,
    request: {
      expectedRevision: editor.revision,
      traderId: editor.trader.id,
      businessDate: editor.businessDate,
      lines,
    },
  };
}

export function lineGrossPreviewKg(line: EditorLine): string {
  const draftRows = line.weightRows.map((row) => ({
    rowKey: row.rowKey,
    weightText: row.weightText,
    packageTypeId: line.packageType?.id,
  }));
  const summary = summarizePackageWeightEntry({ rows: draftRows });
  return weightHundredthsToMajorDecimalString(summary.grossWeightHundredths);
}
