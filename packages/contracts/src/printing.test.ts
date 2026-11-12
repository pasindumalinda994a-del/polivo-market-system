import { describe, expect, it } from "vitest";

import {
  createPrintJobRequestSchema,
  preparePrintAttemptRequestSchema,
  printAttemptOutcomeSchema,
  printDocumentKindSchema,
  printPaperProfileSchema,
  printViewModelSchema,
  reportPrintAttemptOutcomeRequestSchema,
  stallPrintIdentityResponseSchema,
  upsertStallPrintIdentityRequestSchema,
  PRINT_TEMPLATE_VERSION,
} from "./printing.js";

describe("printing contracts", () => {
  it("accepts known document kinds and paper profiles", () => {
    expect(printDocumentKindSchema.parse("buyer_bill")).toBe("buyer_bill");
    expect(printPaperProfileSchema.parse("thermal-80mm-test")).toBe("thermal-80mm-test");
    expect(printAttemptOutcomeSchema.parse("outcome_unknown")).toBe("outcome_unknown");
    expect(PRINT_TEMPLATE_VERSION).toBe("1");
  });

  it("requires reprint reason only when provided on prepare", () => {
    const initial = preparePrintAttemptRequestSchema.parse({
      idempotencyKey: "op-1",
      jobId: "job-1",
      classification: "initial",
      printerSystemName: "Test Printer",
      paperProfile: "a4-paged-test",
    });
    expect(initial.classification).toBe("initial");

    const reprint = preparePrintAttemptRequestSchema.parse({
      idempotencyKey: "op-2",
      jobId: "job-1",
      classification: "reprint",
      reprintReason: "Customer lost copy",
      printerSystemName: "Test Printer",
      paperProfile: "thermal-80mm-test",
    });
    expect(reprint.reprintReason).toBe("Customer lost copy");
  });

  it("validates create job and outcome report shapes", () => {
    expect(
      createPrintJobRequestSchema.parse({
        idempotencyKey: "create-1",
        documentKind: "farmer_bill",
        documentId: "fb-1",
        paperProfile: "thermal-80mm-test",
      }).documentKind,
    ).toBe("farmer_bill");

    expect(
      reportPrintAttemptOutcomeRequestSchema.parse({
        idempotencyKey: "report-1",
        attemptId: "att-1",
        outcome: "accepted_by_print_system",
        outcomeDetail: null,
      }).outcome,
    ).toBe("accepted_by_print_system");
  });

  it("rejects invalid view model missing required fields", () => {
    const result = printViewModelSchema.safeParse({
      documentKind: "test_page",
      documentId: "test-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts nested stall print identity responses and upsert requests", () => {
    expect(stallPrintIdentityResponseSchema.parse({ identity: null })).toEqual({
      identity: null,
    });
    const configured = stallPrintIdentityResponseSchema.parse({
      identity: {
        displayName: "Stall A",
        address: "Lane 1",
        updatedAt: "2026-11-12T10:00:00.000Z",
      },
    });
    expect(configured.identity?.displayName).toBe("Stall A");
    expect(
      upsertStallPrintIdentityRequestSchema.parse({
        displayName: " Stall A ",
        address: null,
      }).displayName,
    ).toBe("Stall A");
  });
});
