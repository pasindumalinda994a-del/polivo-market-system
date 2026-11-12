import { describe, expect, it } from "vitest";

import {
  buildPrintPayloadHashMaterial,
  classifyAdditionalPrintAttempt,
  canReportPrintOutcome,
  escapePrintText,
  formatMoneyMinorForPrint,
  formatWeightHundredthsForPrint,
  reprintLabelFor,
} from "./printing.js";

describe("printing helpers", () => {
  it("builds stable hash material regardless of key order", () => {
    const a = buildPrintPayloadHashMaterial({ b: 1, a: { z: 2, y: 3 } });
    const b = buildPrintPayloadHashMaterial({ a: { y: 3, z: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify({ a: { y: 3, z: 2 }, b: 1 }));
  });

  it("classifies additional attempts conservatively", () => {
    expect(classifyAdditionalPrintAttempt({ priorOutcomes: [] })).toBe("initial");
    expect(classifyAdditionalPrintAttempt({ priorOutcomes: ["failed_before_submission"] })).toBe(
      "initial",
    );
    expect(classifyAdditionalPrintAttempt({ priorOutcomes: ["accepted_by_print_system"] })).toBe(
      "reprint",
    );
    expect(classifyAdditionalPrintAttempt({ priorOutcomes: ["outcome_unknown"] })).toBe("reprint");
    expect(classifyAdditionalPrintAttempt({ priorOutcomes: ["submitting"] })).toBe("reprint");
  });

  it("allows outcome reporting only from prepared/submitting unless repeating same terminal", () => {
    expect(canReportPrintOutcome({ current: "prepared", next: "accepted_by_print_system" })).toBe(
      true,
    );
    expect(
      canReportPrintOutcome({
        current: "accepted_by_print_system",
        next: "accepted_by_print_system",
      }),
    ).toBe(true);
    expect(
      canReportPrintOutcome({
        current: "accepted_by_print_system",
        next: "failed_before_submission",
      }),
    ).toBe(false);
  });

  it("escapes user text and formats money/weight", () => {
    expect(escapePrintText(`A <b> & "x"`)).toBe("A &lt;b&gt; &amp; &quot;x&quot;");
    expect(formatMoneyMinorForPrint(123456)).toBe("1,234.56");
    expect(formatWeightHundredthsForPrint(15050)).toBe("150.50");
    expect(reprintLabelFor("reprint")).toBe("REPRINT");
    expect(reprintLabelFor("initial")).toBeNull();
  });
});
