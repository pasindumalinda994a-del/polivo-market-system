import { createHash } from "node:crypto";

/** SHA-256 hex digest of the exact UTF-8 body bytes that will be transmitted. */
export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
