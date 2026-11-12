import { describe, expect, it } from "vitest";

import { billingAllows } from "./billing-state";
import { classifyFinalizeFailure, shouldResolveFinalizeOutcome } from "./finalize-failure";

/**
 * Documents the finalize gate: only a fresh ready review may finalize,
 * and repeated activation must reuse the in-flight path (no new key at UI layer).
 */
describe("finalization workflow gates", () => {
  it("editing after review invalidates finalize permission", () => {
    expect(billingAllows("ready_for_review", "finalize")).toBe(true);
    expect(billingAllows("review_stale", "finalize")).toBe(false);
    expect(billingAllows("unsaved_changes", "preview")).toBe(true);
  });

  it("finalized is read-only for edits", () => {
    expect(billingAllows("finalized", "edit_fields")).toBe(false);
    expect(billingAllows("finalized", "new_bill")).toBe(true);
  });

  it("unknown outcome only allows check and close", () => {
    expect(billingAllows("finalization_outcome_unknown", "check_finalization")).toBe(true);
    expect(billingAllows("finalization_outcome_unknown", "finalize")).toBe(false);
    expect(billingAllows("finalization_outcome_unknown", "save")).toBe(false);
  });

  it("account-not-ready conflict returns to review (finalize allowed again)", () => {
    const kind = classifyFinalizeFailure({
      conflict: true,
      code: "CONFLICT",
      message: "Farmer account is not ready for operational posting.",
    });
    expect(shouldResolveFinalizeOutcome(kind)).toBe(false);
    // After clearing recovery, workflow is ready_for_review — finalize is enabled again.
    expect(billingAllows("ready_for_review", "finalize")).toBe(true);
    expect(billingAllows("finalization_outcome_unknown", "finalize")).toBe(false);
  });

  it("timeout keeps the unknown-outcome check path", () => {
    const kind = classifyFinalizeFailure({
      conflict: false,
      code: "SERVICE_UNAVAILABLE",
      message: "Request timed out while finalizing.",
    });
    expect(shouldResolveFinalizeOutcome(kind)).toBe(true);
    expect(billingAllows("finalization_outcome_unknown", "check_finalization")).toBe(true);
  });
});
