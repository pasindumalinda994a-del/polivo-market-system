import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";

/** Cryptographically random enrollment secret (raw). Store only the digest. */
export function generateEnrollmentSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest of a raw enrollment secret. */
export function hashEnrollmentSecret(rawSecret: string): string {
  return createHash("sha256").update(rawSecret, "utf8").digest("hex");
}

/**
 * Build the canonical redeem possession message.
 * Devices must sign this exact UTF-8 payload with their Ed25519 private key.
 */
export function buildRedeemPossessionMessage(input: {
  installationId: string;
  publicKey: string;
  deploymentEnvironment: string;
}): string {
  return [
    "polivo-redeem-v1",
    input.installationId,
    input.publicKey,
    input.deploymentEnvironment,
  ].join("\n");
}

export function buildConfirmPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  publicKey: string;
  credentialVersion: number;
}): string {
  return [
    "polivo-confirm-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    input.publicKey,
    String(input.credentialVersion),
  ].join("\n");
}

/**
 * Verify an Ed25519 signature.
 * `publicKey` and `signature` are base64url encodings of the raw 32-byte key and 64-byte signature.
 */
export function verifyEd25519Possession(input: {
  publicKey: string;
  message: string;
  signature: string;
}): boolean {
  try {
    const keyBytes = Buffer.from(input.publicKey, "base64url");
    const signature = Buffer.from(input.signature, "base64url");
    if (keyBytes.length !== 32 || signature.length !== 64) {
      return false;
    }
    const keyObject = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keyBytes]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(input.message, "utf8"), keyObject, signature);
  } catch {
    return false;
  }
}
