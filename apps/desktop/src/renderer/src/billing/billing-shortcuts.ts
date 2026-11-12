export type BillingShortcut = {
  id: string;
  keys: string;
  /** Display chord, e.g. Ctrl+N */
  chord: string;
  label: string;
  action:
    | "new_bill"
    | "focus_buyer"
    | "add_line"
    | "save"
    | "review"
    | "finalize"
    | "open_draft_list"
    | "close_panel"
    | "toggle_help";
};

/**
 * Ctrl-based map chosen to avoid common Electron/OS conflicts.
 * Enter never finalizes; Escape closes the nearest temporary UI first.
 */
export const BILLING_SHORTCUTS: readonly BillingShortcut[] = [
  { id: "new", keys: "ctrl+n", chord: "Ctrl+N", label: "New bill", action: "new_bill" },
  {
    id: "buyer",
    keys: "ctrl+b",
    chord: "Ctrl+B",
    label: "Focus buyer search",
    action: "focus_buyer",
  },
  { id: "line", keys: "ctrl+l", chord: "Ctrl+L", label: "Add sale line", action: "add_line" },
  { id: "save", keys: "ctrl+s", chord: "Ctrl+S", label: "Save draft", action: "save" },
  { id: "review", keys: "ctrl+r", chord: "Ctrl+R", label: "Review bill", action: "review" },
  {
    id: "finalize",
    keys: "ctrl+enter",
    chord: "Ctrl+Enter",
    label: "Finalize (from ready review)",
    action: "finalize",
  },
  {
    id: "drafts",
    keys: "ctrl+d",
    chord: "Ctrl+D",
    label: "Open draft list",
    action: "open_draft_list",
  },
  {
    id: "help",
    keys: "ctrl+/",
    chord: "Ctrl+/",
    label: "Shortcut help",
    action: "toggle_help",
  },
  {
    id: "close",
    keys: "escape",
    chord: "Esc",
    label: "Close panel / suggestions",
    action: "close_panel",
  },
] as const;

export function matchBillingShortcut(event: KeyboardEvent): BillingShortcut | null {
  if (event.isComposing) {
    return null;
  }
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();

  for (const shortcut of BILLING_SHORTCUTS) {
    if (shortcut.keys === "escape" && key === "escape" && !ctrl) {
      return shortcut;
    }
    if (shortcut.keys === "ctrl+enter" && ctrl && key === "enter") {
      return shortcut;
    }
    if (shortcut.keys === "ctrl+/" && ctrl && (key === "/" || event.code === "Slash")) {
      return shortcut;
    }
    if (shortcut.keys.startsWith("ctrl+") && ctrl) {
      const letter = shortcut.keys.slice("ctrl+".length);
      if (letter.length === 1 && key === letter) {
        return shortcut;
      }
    }
  }
  return null;
}
