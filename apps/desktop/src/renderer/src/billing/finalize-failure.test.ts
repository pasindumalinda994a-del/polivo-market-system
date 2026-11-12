import { describe, expect, it } from "vitest";

import { classifyFinalizeFailure, shouldResolveFinalizeOutcome } from "./finalize-failure";

describe("classifyFinalizeFailure", () => {
  it("treats farmer account-not-ready CONFLICT as a definite failure", () => {
    const kind = classifyFinalizeFailure({
      conflict: true,
      code: "CONFLICT",
      message: "Farmer account is not ready for operational posting.",
    });
    expect(kind).toBe("definite_conflict");
    expect(shouldResolveFinalizeOutcome(kind)).toBe(false);
  });

  it("treats stale calculation CONFLICT as a definite failure", () => {
    const kind = classifyFinalizeFailure({
      conflict: true,
      code: "CONFLICT",
      message: "Sale calculation is stale. Request a new preview and resubmit finalization.",
    });
    expect(kind).toBe("definite_conflict");
    expect(shouldResolveFinalizeOutcome(kind)).toBe(false);
  });

  it("keeps recovery for timeout and network failures", () => {
    expect(
      classifyFinalizeFailure({
        conflict: false,
        code: "SERVICE_UNAVAILABLE",
        message: "Request timed out while finalizing.",
      }),
    ).toBe("ambiguous");
    expect(
      classifyFinalizeFailure({
        conflict: false,
        code: "SERVICE_UNAVAILABLE",
        message: "Stall host unreachable",
      }),
    ).toBe("ambiguous");
    expect(
      shouldResolveFinalizeOutcome(
        classifyFinalizeFailure({
          conflict: false,
          code: "SERVICE_UNAVAILABLE",
          message: "network error",
        }),
      ),
    ).toBe(true);
  });

  it("keeps recovery when the idempotency key is already in use", () => {
    const kind = classifyFinalizeFailure({
      conflict: true,
      code: "CONFLICT",
      message: "Idempotency key is already in use.",
    });
    expect(kind).toBe("ambiguous");
    expect(shouldResolveFinalizeOutcome(kind)).toBe(true);
  });

  it("keeps recovery when the sale may already be finalized", () => {
    const kind = classifyFinalizeFailure({
      conflict: true,
      code: "CONFLICT",
      message: "Sale has already been finalized.",
    });
    expect(kind).toBe("ambiguous");
  });

  it("treats other completed non-conflict errors as definite", () => {
    const kind = classifyFinalizeFailure({
      conflict: false,
      code: "VALIDATION_ERROR",
      message: "Sale requires at least one line before finalization.",
    });
    expect(kind).toBe("definite_other");
    expect(shouldResolveFinalizeOutcome(kind)).toBe(false);
  });
});
