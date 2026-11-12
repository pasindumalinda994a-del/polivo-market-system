export const PRINT_TEMPLATE_VERSION = "1" as const;

export type PrintTemplateId =
  | "buyer_bill"
  | "farmer_bill"
  | "payment_receipt"
  | "account_statement"
  | "test_page";

export type PrintDocumentKind =
  | "buyer_bill"
  | "farmer_bill"
  | "payment_receipt"
  | "account_statement"
  | "test_page";

export type PrintClassification = "initial" | "reprint";

export type PrintAttemptOutcome =
  | "prepared"
  | "submitting"
  | "accepted_by_print_system"
  | "failed_before_submission"
  | "cancelled_before_submission"
  | "outcome_unknown";

export const TERMINAL_PRINT_OUTCOMES = [
  "accepted_by_print_system",
  "failed_before_submission",
  "cancelled_before_submission",
  "outcome_unknown",
] as const;

export type TerminalPrintOutcome = (typeof TERMINAL_PRINT_OUTCOMES)[number];

export function templateIdForDocumentKind(kind: PrintDocumentKind): PrintTemplateId {
  return kind;
}

/**
 * Canonical JSON material for a print payload body (excluding print metadata).
 * Callers that need a digest must hash this in a Node-only layer (stall-service).
 * Kept browser-safe so the domain barrel can load in the Electron renderer.
 */
export function buildPrintPayloadHashMaterial(canonicalBody: unknown): string {
  return stableStringify(canonicalBody);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = sortKeys(record[key]);
    }
    return out;
  }
  return value;
}

/**
 * Classify whether an additional attempt must be a reprint.
 * Prior acceptance or uncertainty forces reprint; confirmed pre-submission failure may retry as initial.
 */
export function classifyAdditionalPrintAttempt(args: {
  priorOutcomes: readonly PrintAttemptOutcome[];
}): PrintClassification {
  for (const outcome of args.priorOutcomes) {
    if (outcome === "accepted_by_print_system" || outcome === "outcome_unknown") {
      return "reprint";
    }
    if (outcome === "submitting") {
      return "reprint";
    }
  }
  return "initial";
}

export function isTerminalPrintOutcome(outcome: PrintAttemptOutcome): boolean {
  return (
    outcome === "accepted_by_print_system" ||
    outcome === "failed_before_submission" ||
    outcome === "cancelled_before_submission" ||
    outcome === "outcome_unknown"
  );
}

export function canReportPrintOutcome(args: {
  current: PrintAttemptOutcome;
  next: TerminalPrintOutcome;
}): boolean {
  if (isTerminalPrintOutcome(args.current)) {
    return args.current === args.next;
  }
  return args.current === "prepared" || args.current === "submitting";
}

export function reprintLabelFor(classification: PrintClassification): string | null {
  return classification === "reprint" ? "REPRINT" : null;
}

export function escapePrintText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatMoneyMinorForPrint(amountMinor: number): string {
  const negative = amountMinor < 0;
  const absolute = Math.abs(amountMinor);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;
  const formatted = `${major.toLocaleString("en-LK")}.${minor.toString().padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

export function formatWeightHundredthsForPrint(weightHundredths: number): string {
  const major = Math.floor(weightHundredths / 100);
  const frac = weightHundredths % 100;
  if (frac === 0) {
    return major.toLocaleString("en-LK");
  }
  return `${major.toLocaleString("en-LK")}.${frac.toString().padStart(2, "0")}`;
}
