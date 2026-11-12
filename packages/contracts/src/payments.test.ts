import { describe, expect, it } from "vitest";

import { paymentPostRequestSchema, paymentPreviewRequestSchema } from "./payments.js";

const baseRequest = {
  partyKind: "trader",
  partyId: "buyer-1",
  direction: "receive",
  method: "cash",
  amountMinor: 1_000,
  allocations: [],
} as const;

const farmerChequeBase = {
  partyKind: "farmer" as const,
  partyId: "farmer-1",
  direction: "pay" as const,
  method: "cheque" as const,
  amountMinor: 4_000,
  chequeNumber: "001234",
  issuingBankLabel: "People's Bank",
  chequeDate: "2026-11-10",
  physicalHandoverDate: "2026-11-11",
  allocations: [] as const,
};

describe("payment request schemas", () => {
  it("accepts a cash buyer receipt preview and the matching post request", () => {
    expect(paymentPreviewRequestSchema.safeParse(baseRequest).success).toBe(true);
    expect(
      paymentPostRequestSchema.safeParse({ ...baseRequest, previewFingerprint: "a".repeat(64) })
        .success,
    ).toBe(true);
  });

  it("rejects mismatched direction", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({ ...baseRequest, direction: "pay" }).success,
    ).toBe(false);
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...baseRequest,
        partyKind: "farmer",
        direction: "receive",
      }).success,
    ).toBe(false);
  });

  it("rejects buyer cheque receipts", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...baseRequest,
        method: "cheque",
        chequeNumber: "001234",
        issuingBankLabel: "Bank",
        chequeDate: "2026-11-10",
        physicalHandoverDate: "2026-11-11",
      }).success,
    ).toBe(false);
  });

  it("accepts farmer cheque payouts and preserves leading zeros", () => {
    const parsed = paymentPreviewRequestSchema.safeParse(farmerChequeBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.chequeNumber).toBe("001234");
    }
    expect(
      paymentPostRequestSchema.safeParse({
        ...farmerChequeBase,
        previewFingerprint: "a".repeat(64),
        physicalHandoverConfirmed: true,
      }).success,
    ).toBe(true);
  });

  it("requires cheque metadata and handover confirmation on post", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({
        partyKind: "farmer",
        partyId: "farmer-1",
        direction: "pay",
        method: "cheque",
        amountMinor: 100,
        allocations: [],
      }).success,
    ).toBe(false);
    expect(
      paymentPostRequestSchema.safeParse({
        ...farmerChequeBase,
        previewFingerprint: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      paymentPostRequestSchema.safeParse({
        ...farmerChequeBase,
        previewFingerprint: "a".repeat(64),
        physicalHandoverConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("isolates method-specific metadata", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...farmerChequeBase,
        bankTransferReference: "TXN-1",
      }).success,
    ).toBe(false);
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...baseRequest,
        chequeNumber: "001234",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported cheque lifecycle fields via strict object parsing", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...farmerChequeBase,
        clearedAt: "2026-11-12T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...farmerChequeBase,
        clearanceStatus: "cleared",
      }).success,
    ).toBe(false);
  });

  it("requires bank metadata only for bank transfers", () => {
    expect(
      paymentPreviewRequestSchema.safeParse({ ...baseRequest, method: "bank_transfer" }).success,
    ).toBe(false);
    expect(
      paymentPreviewRequestSchema.safeParse({
        ...baseRequest,
        method: "bank_transfer",
        bankTransferReference: "TXN-1",
        bankTransferDate: "2026-11-11",
      }).success,
    ).toBe(true);
    expect(
      paymentPreviewRequestSchema.safeParse({ ...baseRequest, bankTransferReference: "TXN-1" })
        .success,
    ).toBe(false);
  });

  it("requires a valid preview fingerprint when posting", () => {
    expect(paymentPostRequestSchema.safeParse(baseRequest).success).toBe(false);
    expect(
      paymentPostRequestSchema.safeParse({ ...baseRequest, previewFingerprint: "not-a-digest" })
        .success,
    ).toBe(false);
  });
});
