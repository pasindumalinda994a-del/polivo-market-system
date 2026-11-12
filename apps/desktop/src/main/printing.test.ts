import { describe, expect, it } from "vitest";

import { assertSafePrintIpcPayload } from "./printing.js";

describe("print IPC safety", () => {
  it("allows typed document print requests", () => {
    expect(() =>
      assertSafePrintIpcPayload({
        documentKind: "buyer_bill",
        documentId: "bill-1",
        classification: "initial",
      }),
    ).not.toThrow();
  });

  it("rejects arbitrary HTML, URLs, paths, and shell commands", () => {
    expect(() => assertSafePrintIpcPayload({ html: "<b>x</b>" })).toThrow(/html/);
    expect(() => assertSafePrintIpcPayload({ url: "https://evil.example" })).toThrow(/url/);
    expect(() => assertSafePrintIpcPayload({ path: "C:\\\\temp\\\\x.html" })).toThrow(/path/);
    expect(() => assertSafePrintIpcPayload({ filePath: "/tmp/x" })).toThrow(/filePath/);
    expect(() => assertSafePrintIpcPayload({ shellCommand: "print" })).toThrow(/shellCommand/);
    expect(() => assertSafePrintIpcPayload({ command: "rm" })).toThrow(/command/);
  });
});
