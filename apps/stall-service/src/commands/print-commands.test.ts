import { describe, expect, it } from "vitest";

import {
  DOCUMENTS_PRINT_CAPABILITY,
  DOCUMENTS_REPRINT_CAPABILITY,
  buildBuyerBillStatusAnnotation,
  buildPaymentStatusAnnotation,
  buildTestPageContent,
  canAccessPrintDocument,
  formatPrintAttemptReference,
  requiredPrintCapability,
  resolvePrepareClassification,
} from "./print-commands.js";

const caps = (...values: string[]) => new Set(values);

describe("canAccessPrintDocument", () => {
  it("requires a bill capability in addition to a print capability for bills", () => {
    expect(canAccessPrintDocument(caps(DOCUMENTS_PRINT_CAPABILITY), "buyer_bill", "print")).toBe(
      false,
    );
    expect(
      canAccessPrintDocument(
        caps(DOCUMENTS_PRINT_CAPABILITY, "bills.finalize"),
        "buyer_bill",
        "print",
      ),
    ).toBe(true);
    expect(canAccessPrintDocument(caps("bills.finalize"), "farmer_bill", "print")).toBe(false);
  });

  it("distinguishes print from reprint", () => {
    const printOnly = caps(DOCUMENTS_PRINT_CAPABILITY, "bills.create");
    expect(canAccessPrintDocument(printOnly, "buyer_bill", "reprint")).toBe(false);
    expect(canAccessPrintDocument(printOnly, "buyer_bill", "view")).toBe(true);
    const reprintOnly = caps(DOCUMENTS_REPRINT_CAPABILITY, "bills.create");
    expect(canAccessPrintDocument(reprintOnly, "buyer_bill", "reprint")).toBe(true);
    expect(canAccessPrintDocument(reprintOnly, "buyer_bill", "print")).toBe(false);
  });

  it("maps receipts and statements to their own capabilities", () => {
    expect(
      canAccessPrintDocument(
        caps(DOCUMENTS_PRINT_CAPABILITY, "payments.pay_farmer"),
        "payment_receipt",
        "print",
      ),
    ).toBe(true);
    expect(
      canAccessPrintDocument(
        caps(DOCUMENTS_PRINT_CAPABILITY, "accounts.view"),
        "account_statement",
        "print",
      ),
    ).toBe(true);
    expect(
      canAccessPrintDocument(
        caps(DOCUMENTS_PRINT_CAPABILITY, "bills.create"),
        "account_statement",
        "print",
      ),
    ).toBe(false);
  });

  it("allows test pages with documents.print only", () => {
    expect(canAccessPrintDocument(caps(DOCUMENTS_PRINT_CAPABILITY), "test_page", "print")).toBe(
      true,
    );
    expect(canAccessPrintDocument(caps(DOCUMENTS_REPRINT_CAPABILITY), "test_page", "view")).toBe(
      false,
    );
  });
});

describe("requiredPrintCapability", () => {
  it("requires documents.reprint for reprints except for nonfinancial test pages", () => {
    expect(requiredPrintCapability("buyer_bill", "initial")).toBe(DOCUMENTS_PRINT_CAPABILITY);
    expect(requiredPrintCapability("buyer_bill", "reprint")).toBe(DOCUMENTS_REPRINT_CAPABILITY);
    expect(requiredPrintCapability("test_page", "reprint")).toBe(DOCUMENTS_PRINT_CAPABILITY);
  });
});

describe("resolvePrepareClassification", () => {
  it("accepts an initial print with no prior acceptance", () => {
    expect(
      resolvePrepareClassification({
        requested: "initial",
        required: "initial",
        reprintReason: undefined,
      }),
    ).toEqual({ classification: "initial", reprintReason: null });
  });

  it("rejects an initial request when a reprint is required", () => {
    expect(() =>
      resolvePrepareClassification({
        requested: "initial",
        required: "reprint",
        reprintReason: undefined,
      }),
    ).toThrowError(/reprint/i);
  });

  it("requires a reason for reprints and trims it", () => {
    expect(() =>
      resolvePrepareClassification({
        requested: "reprint",
        required: "reprint",
        reprintReason: "   ",
      }),
    ).toThrowError(/reason/i);
    expect(
      resolvePrepareClassification({
        requested: "reprint",
        required: "initial",
        reprintReason: "  Paper jam  ",
      }),
    ).toEqual({ classification: "reprint", reprintReason: "Paper jam" });
  });

  it("rejects a reprint reason on an initial print", () => {
    expect(() =>
      resolvePrepareClassification({
        requested: "initial",
        required: "initial",
        reprintReason: "oops",
      }),
    ).toThrowError(/reprint reason/i);
  });
});

describe("status annotations", () => {
  it("marks reversed and superseded buyer bills distinctly", () => {
    expect(
      buildBuyerBillStatusAnnotation({
        correctionStatus: "reversed",
        replacementBillId: null,
        replacementBillNumber: null,
        isCorrectionReplacement: false,
      }).status,
    ).toBe("reversed");
    const superseded = buildBuyerBillStatusAnnotation({
      correctionStatus: "superseded",
      replacementBillId: "bill-2",
      replacementBillNumber: "T-000002",
      isCorrectionReplacement: false,
    });
    expect(superseded.status).toBe("superseded");
    expect(superseded.replacementDocumentId).toBe("bill-2");
    expect(superseded.label).toContain("T-000002");
  });

  it("treats active and replacement bills as current/adjusted", () => {
    const base = { replacementBillId: null, replacementBillNumber: null };
    expect(
      buildBuyerBillStatusAnnotation({
        ...base,
        correctionStatus: "active",
        isCorrectionReplacement: false,
      }).label,
    ).toBe("Current");
    expect(
      buildBuyerBillStatusAnnotation({
        ...base,
        correctionStatus: "none",
        isCorrectionReplacement: true,
      }).status,
    ).toBe("adjusted");
  });

  it("marks reversed payments", () => {
    expect(
      buildPaymentStatusAnnotation({
        status: "reversed",
        reversedByPaymentId: "p2",
        reversesPaymentId: null,
      }).status,
    ).toBe("reversed");
    expect(
      buildPaymentStatusAnnotation({
        status: "posted",
        reversedByPaymentId: null,
        reversesPaymentId: null,
      }).status,
    ).toBe("current");
  });
});

describe("misc helpers", () => {
  it("formats a bounded attempt reference", () => {
    expect(formatPrintAttemptReference("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "PRT-A1B2C3D4E5F6",
    );
    expect(formatPrintAttemptReference("---")).toBe("PRT-ATTEMPT");
  });

  it("builds a nonfinancial test page for the requested profile", () => {
    const content = buildTestPageContent("thermal-80mm-test");
    expect(content.kind).toBe("test_page");
    expect(content.profileId).toBe("thermal-80mm-test");
  });
});
