import { describe, expect, it } from "vitest";

import { billingAllows, describeSaveStatus } from "./billing-state";

describe("billingAllows", () => {
  it("allows finalize only from ready_for_review", () => {
    expect(billingAllows("ready_for_review", "finalize")).toBe(true);
    expect(billingAllows("review_stale", "finalize")).toBe(false);
    expect(billingAllows("unsaved_changes", "finalize")).toBe(false);
    expect(billingAllows("finalizing", "finalize")).toBe(false);
  });

  it("locks mutations while finalizing or outcome unknown", () => {
    expect(billingAllows("finalizing", "edit_fields")).toBe(false);
    expect(billingAllows("finalization_outcome_unknown", "edit_fields")).toBe(false);
    expect(billingAllows("finalization_outcome_unknown", "check_finalization")).toBe(true);
  });

  it("allows reload on revision conflict", () => {
    expect(billingAllows("revision_conflict", "reload_authoritative")).toBe(true);
    expect(billingAllows("revision_conflict", "save")).toBe(false);
  });
});

describe("describeSaveStatus", () => {
  it("maps workflow states to truthful labels", () => {
    expect(describeSaveStatus("unsaved_changes")).toBe("Unsaved");
    expect(describeSaveStatus("saving")).toBe("Saving…");
    expect(describeSaveStatus("saved")).toBe("Saved to stall");
    expect(describeSaveStatus("finalization_outcome_unknown")).toBe(
      "Checking whether the bill was finalized",
    );
    expect(describeSaveStatus("service_unavailable")).toContain("not stored at stall");
  });
});
