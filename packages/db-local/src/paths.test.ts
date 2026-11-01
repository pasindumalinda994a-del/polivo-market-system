import { describe, expect, it } from "vitest";

import { DatabasePathError, requireAbsoluteDatabasePath, resolveDatabasePath } from "./paths.js";

describe("database paths", () => {
  it("rejects empty, memory, and file URL paths", () => {
    expect(() => resolveDatabasePath("")).toThrow(DatabasePathError);
    expect(() => resolveDatabasePath(":memory:")).toThrow(/in-memory/i);
    expect(() => resolveDatabasePath("file:test.db")).toThrow(/URL-style/i);
  });

  it("requires absolute paths for operational configuration", () => {
    expect(() => requireAbsoluteDatabasePath("relative.sqlite")).toThrow(/absolute/i);
  });
});
