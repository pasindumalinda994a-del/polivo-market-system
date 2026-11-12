import { describe, expect, it } from "vitest";

import { createWeightEntryRow } from "../WeightEntry";
import {
  buildLineInput,
  buildUpdateRequest,
  createEmptyEditor,
  createEmptyLine,
} from "./billing-editor";

describe("buildLineInput", () => {
  it("requires farmer, vegetable, package, complete weights, and price", () => {
    const line = createEmptyLine();
    expect(buildLineInput(line).ok).toBe(false);

    line.farmer = { id: "f1", shortCode: "F1", displayName: "Farmer" };
    line.vegetable = { id: "v1", shortCode: "V1", displayName: "Veg" };
    line.packageType = { id: "p1", shortCode: "P1", displayName: "Bag" };
    line.weightRows = [
      { rowKey: "r1", weightText: "32.00" },
      { rowKey: "r2", weightText: "28.50" },
      { rowKey: "r3", weightText: "19.25" },
      createWeightEntryRow(),
    ];
    line.unitPriceText = "250.00";
    const built = buildLineInput(line);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.line.weights.rows).toHaveLength(3);
      expect(built.line.unitPricePerKgMinor).toBe(25_000);
    }
  });

  it("rejects incomplete price without converting empty weight to zero", () => {
    const line = createEmptyLine();
    line.farmer = { id: "f1", shortCode: "F1", displayName: "Farmer" };
    line.vegetable = { id: "v1", shortCode: "V1", displayName: "Veg" };
    line.packageType = { id: "p1", shortCode: "P1", displayName: "Bag" };
    line.weightRows = [{ rowKey: "r1", weightText: "" }];
    line.unitPriceText = "10.00";
    const built = buildLineInput(line);
    expect(built.ok).toBe(false);
  });
});

describe("buildUpdateRequest", () => {
  it("requires buyer and revision", () => {
    const editor = createEmptyEditor("2026-11-10");
    expect(buildUpdateRequest(editor).ok).toBe(false);
    editor.trader = { id: "t1", shortCode: "T1", displayName: "Buyer" };
    editor.revision = 1;
    editor.saleId = "sale-1";
    // empty lines only → ok with zero lines
    expect(buildUpdateRequest(editor).ok).toBe(true);
  });
});
