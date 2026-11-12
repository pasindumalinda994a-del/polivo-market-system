export const BILLING_WORKFLOW_STATES = [
  "no_active_draft",
  "loading_draft",
  "editing",
  "unsaved_changes",
  "saving",
  "saved",
  "previewing",
  "ready_for_review",
  "review_stale",
  "finalizing",
  "finalization_outcome_unknown",
  "finalized",
  "revision_conflict",
  "service_unavailable",
  "session_expired",
  "permission_denied",
] as const;

export type BillingWorkflowState = (typeof BILLING_WORKFLOW_STATES)[number];

export type BillingAction =
  | "new_bill"
  | "resume_draft"
  | "edit_fields"
  | "save"
  | "preview"
  | "finalize"
  | "reload_authoritative"
  | "check_finalization"
  | "open_draft_list"
  | "close_panel";

const ALWAYS: ReadonlySet<BillingAction> = new Set(["close_panel"]);

const MATRIX: Record<BillingWorkflowState, ReadonlySet<BillingAction>> = {
  no_active_draft: new Set(["new_bill", "resume_draft", "open_draft_list", "close_panel"]),
  loading_draft: new Set(["close_panel"]),
  editing: new Set([
    "new_bill",
    "resume_draft",
    "edit_fields",
    "save",
    "preview",
    "open_draft_list",
    "close_panel",
  ]),
  unsaved_changes: new Set([
    "new_bill",
    "resume_draft",
    "edit_fields",
    "save",
    "preview",
    "open_draft_list",
    "close_panel",
  ]),
  saving: new Set(["close_panel"]),
  saved: new Set([
    "new_bill",
    "resume_draft",
    "edit_fields",
    "save",
    "preview",
    "open_draft_list",
    "close_panel",
  ]),
  previewing: new Set(["close_panel"]),
  ready_for_review: new Set([
    "new_bill",
    "resume_draft",
    "edit_fields",
    "save",
    "preview",
    "finalize",
    "open_draft_list",
    "close_panel",
  ]),
  review_stale: new Set([
    "new_bill",
    "resume_draft",
    "edit_fields",
    "save",
    "preview",
    "open_draft_list",
    "close_panel",
  ]),
  finalizing: new Set(["close_panel"]),
  finalization_outcome_unknown: new Set(["check_finalization", "close_panel"]),
  finalized: new Set(["new_bill", "open_draft_list", "close_panel"]),
  revision_conflict: new Set([
    "reload_authoritative",
    "edit_fields",
    "open_draft_list",
    "close_panel",
  ]),
  service_unavailable: new Set(["edit_fields", "open_draft_list", "close_panel"]),
  session_expired: new Set(["close_panel"]),
  permission_denied: new Set(["close_panel"]),
};

export function billingAllows(state: BillingWorkflowState, action: BillingAction): boolean {
  return MATRIX[state]?.has(action) ?? ALWAYS.has(action);
}

export function describeSaveStatus(state: BillingWorkflowState): string {
  switch (state) {
    case "unsaved_changes":
    case "review_stale":
      return "Unsaved";
    case "saving":
      return "Saving…";
    case "saved":
    case "editing":
    case "ready_for_review":
      return "Saved to stall";
    case "previewing":
      return "Previewing…";
    case "finalizing":
      return "Finalizing…";
    case "finalization_outcome_unknown":
      return "Checking whether the bill was finalized";
    case "finalized":
      return "Finalized";
    case "revision_conflict":
      return "Conflict";
    case "service_unavailable":
      return "Service unavailable — edits not stored at stall";
    case "loading_draft":
      return "Loading…";
    default:
      return "No draft";
  }
}
