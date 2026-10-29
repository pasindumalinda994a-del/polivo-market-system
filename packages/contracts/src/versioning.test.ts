import { describe, expect, it } from "vitest";

import { localApiContractVersionSchema, syncProtocolVersionSchema } from "./versioning.js";

describe("protocol versions", () => {
  it("accepts the supported API contract version", () => {
    expect(localApiContractVersionSchema.safeParse("1").success).toBe(true);
  });

  it("rejects an unsupported API contract version", () => {
    expect(localApiContractVersionSchema.safeParse("2").success).toBe(false);
  });

  it("rejects an unsupported sync protocol version", () => {
    expect(syncProtocolVersionSchema.safeParse("legacy").success).toBe(false);
  });
});
