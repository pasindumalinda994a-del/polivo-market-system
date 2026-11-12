import { describe, expect, it } from "vitest";

import {
  farmerBillPreviewRequestSchema,
  issueFarmerBillRequestSchema,
  listFarmerSalesQuerySchema,
} from "./farmer-billing.js";

describe("farmer billing contracts", () => {
  it("rejects duplicate source line ids", () => {
    const result = farmerBillPreviewRequestSchema.safeParse({
      farmerId: "farmer-1",
      sourceLineIds: ["line-1", "line-1"],
    });
    expect(result.success).toBe(false);
  });

  it("requires nonempty unique source selection for issue", () => {
    const empty = issueFarmerBillRequestSchema.safeParse({
      farmerId: "farmer-1",
      sourceLineIds: [],
      expectedSelectionFingerprint: "a".repeat(64),
    });
    expect(empty.success).toBe(false);

    const ok = issueFarmerBillRequestSchema.safeParse({
      farmerId: "farmer-1",
      sourceLineIds: ["line-1"],
      expectedSelectionFingerprint: "a".repeat(64),
    });
    expect(ok.success).toBe(true);
  });

  it("requires farmerId on sales list query", () => {
    const missing = listFarmerSalesQuerySchema.safeParse({});
    expect(missing.success).toBe(false);
    const ok = listFarmerSalesQuerySchema.safeParse({ farmerId: "farmer-1" });
    expect(ok.success).toBe(true);
  });
});
