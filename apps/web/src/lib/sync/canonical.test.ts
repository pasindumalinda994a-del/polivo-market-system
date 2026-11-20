import { describe, expect, it } from "vitest";

import { canonicalizeJson, sha256HexOfCanonicalJson } from "./canonical";

describe("sync canonical hash", () => {
  it("sorts object keys for stable hashing", () => {
    const a = canonicalizeJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalizeJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(sha256HexOfCanonicalJson({ b: 1, a: 2 })).toBe(sha256HexOfCanonicalJson({ a: 2, b: 1 }));
  });
});
