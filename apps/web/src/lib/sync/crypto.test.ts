import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildIngestPossessionMessage, verifyIngestPossession } from "./crypto";

function rawPublicKeyBase64Url(publicKeyDerSpki: Buffer): string {
  // SPKI for Ed25519 ends with the 32-byte raw key.
  return publicKeyDerSpki.subarray(-32).toString("base64url");
}

describe("sync ingest possession", () => {
  it("verifies a valid polivo-ingest-v1 signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyRaw = rawPublicKeyBase64Url(
      publicKey.export({ type: "spki", format: "der" }) as Buffer,
    );
    const signedAt = new Date().toISOString();
    const message = buildIngestPossessionMessage({
      tenantId: "ten_1",
      deviceId: "dev_1",
      installationId: "inst_1",
      credentialVersion: 1,
      batchId: "batch_1",
      bodySha256: "a".repeat(64),
      signedAt,
    });
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
    const result = verifyIngestPossession({
      publicKey: publicKeyRaw,
      tenantId: "ten_1",
      deviceId: "dev_1",
      installationId: "inst_1",
      credentialVersion: 1,
      batchId: "batch_1",
      bodySha256: "a".repeat(64),
      signedAt,
      signature,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects signatures outside the skew window", () => {
    const result = verifyIngestPossession({
      publicKey: "a".repeat(43),
      tenantId: "ten_1",
      deviceId: "dev_1",
      installationId: "inst_1",
      credentialVersion: 1,
      batchId: "batch_1",
      bodySha256: "a".repeat(64),
      signedAt: "2000-01-01T00:00:00.000Z",
      signature: "b".repeat(86),
      nowMs: Date.parse("2026-11-13T00:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
  });
});
