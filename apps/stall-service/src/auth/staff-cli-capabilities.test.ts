import { describe, expect, it } from "vitest";

import { parseCapabilitiesArgv } from "./staff-cli-capabilities.js";

describe("parseCapabilitiesArgv", () => {
  it("parses a valid JSON array of strings", () => {
    expect(
      parseCapabilitiesArgv(
        '["payments.receive_trader","payments.pay_farmer","reports.view_financial"]',
      ),
    ).toEqual(["payments.receive_trader", "payments.pay_farmer", "reports.view_financial"]);
  });

  it("parses an empty JSON array", () => {
    expect(parseCapabilitiesArgv("[]")).toEqual([]);
    expect(parseCapabilitiesArgv("")).toEqual([]);
  });

  it("recovers shell-mangled bracket lists (PowerShell/pnpm quote strip)", () => {
    expect(
      parseCapabilitiesArgv(
        "[payments.receive_trader,payments.pay_farmer,payments.record_cheque,reports.view_financial]",
      ),
    ).toEqual([
      "payments.receive_trader",
      "payments.pay_farmer",
      "payments.record_cheque",
      "reports.view_financial",
    ]);
  });

  it("accepts bare comma-separated capability ids", () => {
    expect(parseCapabilitiesArgv("bills.create,reports.view_financial")).toEqual([
      "bills.create",
      "reports.view_financial",
    ]);
  });

  it("rejects invalid junk with a clear Windows quoting hint", () => {
    expect(() => parseCapabilitiesArgv("{not:valid}")).toThrow(/Could not parse capabilities/);
    expect(() => parseCapabilitiesArgv("{not:valid}")).toThrow(/PowerShell/);
    expect(() => parseCapabilitiesArgv('["ok",123]')).toThrow(/JSON array of strings/);
  });
});
