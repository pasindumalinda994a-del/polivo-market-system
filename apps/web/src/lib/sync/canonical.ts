import { createHash } from "node:crypto";

/**
 * Deterministic JSON canonicalization for payload hashing.
 * Sorts object keys recursively; arrays keep order; rejects non-JSON types.
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const out: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      out[key] = sortValue(nested);
    }
    return out;
  }
  throw new Error("Unsupported JSON value for canonicalization.");
}

export function sha256HexOfCanonicalJson(value: unknown): string {
  const canonical = canonicalizeJson(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
