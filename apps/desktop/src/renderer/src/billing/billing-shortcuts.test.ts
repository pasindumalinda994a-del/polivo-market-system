import { describe, expect, it } from "vitest";

import { matchBillingShortcut } from "./billing-shortcuts";

function keyEvent(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: partial.key,
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    code: partial.code ?? "",
    isComposing: partial.isComposing ?? false,
  } as KeyboardEvent;
}

describe("matchBillingShortcut", () => {
  it("matches Ctrl+S for save and ignores composition", () => {
    expect(matchBillingShortcut(keyEvent({ key: "s", ctrlKey: true }))?.action).toBe("save");
    expect(
      matchBillingShortcut(keyEvent({ key: "s", ctrlKey: true, isComposing: true })),
    ).toBeNull();
  });

  it("matches Ctrl+Enter for finalize only via chord", () => {
    expect(matchBillingShortcut(keyEvent({ key: "Enter", ctrlKey: true }))?.action).toBe(
      "finalize",
    );
    expect(matchBillingShortcut(keyEvent({ key: "Enter" }))).toBeNull();
  });

  it("matches Escape to close panels", () => {
    expect(matchBillingShortcut(keyEvent({ key: "Escape" }))?.action).toBe("close_panel");
  });
});
