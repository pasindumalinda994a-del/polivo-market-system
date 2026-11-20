import { createHash } from "node:crypto";

import { canonicalizeForSyncManifest } from "@polivo/domain";

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256HexOfCanonical(value: unknown): string {
  return sha256HexOfUtf8(canonicalizeForSyncManifest(value));
}
