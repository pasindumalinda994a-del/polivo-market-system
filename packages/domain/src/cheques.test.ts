import { describe, expect, it } from "vitest";

import { recordFarmerChequeAsPaid } from "./cheques.js";

describe("recordFarmerChequeAsPaid", () => {
  it("records a farmer cheque as paid immediately", () => {
    const result = recordFarmerChequeAsPaid({
      farmerId: "farmer-1",
      amountMinor: 50_000,
      paidAt: "2026-11-01T10:00:00.000+05:30",
      staffId: "staff-1",
    });

    expect(result).toEqual({
      method: "cheque",
      farmerId: "farmer-1",
      amountMinor: 50_000,
      paidAt: "2026-11-01T10:00:00.000+05:30",
      staffId: "staff-1",
      reducesOutstandingImmediately: true,
    });
  });
});
