import { describe, expect, it } from "vitest";

import {
  billNumberSchema,
  farmerBillNumberSchema,
  moneyMinorSchema,
  nonNegativeMoneyMinorSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  traderBillNumberSchema,
  weightHundredthsSchema,
} from "./financial.js";

describe("moneyMinorSchema", () => {
  it("accepts positive, zero, and negative integers", () => {
    expect(moneyMinorSchema.safeParse(100).success).toBe(true);
    expect(moneyMinorSchema.safeParse(0).success).toBe(true);
    expect(moneyMinorSchema.safeParse(-1500).success).toBe(true);
  });

  it("rejects fractional amounts", () => {
    expect(moneyMinorSchema.safeParse(1.5).success).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(moneyMinorSchema.safeParse(Number.NaN).success).toBe(false);
    expect(moneyMinorSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
  });
});

describe("nonNegativeMoneyMinorSchema", () => {
  it("accepts zero and positive integers", () => {
    expect(nonNegativeMoneyMinorSchema.safeParse(0).success).toBe(true);
    expect(nonNegativeMoneyMinorSchema.safeParse(2500000).success).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(nonNegativeMoneyMinorSchema.safeParse(-1).success).toBe(false);
  });
});

describe("weightHundredthsSchema", () => {
  it("accepts hundredths such as 25.50 kg as 2550", () => {
    expect(weightHundredthsSchema.safeParse(2550).success).toBe(true);
  });

  it("rejects negative weights and fractions", () => {
    expect(weightHundredthsSchema.safeParse(-1).success).toBe(false);
    expect(weightHundredthsSchema.safeParse(1.25).success).toBe(false);
  });
});

describe("paymentMethodSchema", () => {
  it("accepts cash, bank_transfer, and cheque", () => {
    expect(paymentMethodSchema.safeParse("cash").success).toBe(true);
    expect(paymentMethodSchema.safeParse("bank_transfer").success).toBe(true);
    expect(paymentMethodSchema.safeParse("cheque").success).toBe(true);
  });

  it("rejects unknown methods", () => {
    expect(paymentMethodSchema.safeParse("card").success).toBe(false);
  });
});

describe("paymentStatusSchema", () => {
  it("accepts unpaid, partially_paid, and fully_paid", () => {
    expect(paymentStatusSchema.safeParse("unpaid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("partially_paid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("fully_paid").success).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(paymentStatusSchema.safeParse("overpaid").success).toBe(false);
  });
});

describe("bill number schemas", () => {
  it("accepts farmer and trader bill numbers from the confirmed examples", () => {
    expect(farmerBillNumberSchema.safeParse("F-111111").success).toBe(true);
    expect(traderBillNumberSchema.safeParse("T-444444").success).toBe(true);
    expect(billNumberSchema.safeParse("F-111112").success).toBe(true);
    expect(billNumberSchema.safeParse("T-444445").success).toBe(true);
  });

  it("rejects malformed bill numbers", () => {
    expect(farmerBillNumberSchema.safeParse("T-111111").success).toBe(false);
    expect(traderBillNumberSchema.safeParse("F-444444").success).toBe(false);
    expect(billNumberSchema.safeParse("F-").success).toBe(false);
    expect(billNumberSchema.safeParse("111111").success).toBe(false);
    expect(billNumberSchema.safeParse("f-111111").success).toBe(false);
  });
});
