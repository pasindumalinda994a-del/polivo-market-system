import { getHostEnrollment, tryGetAcceptedTerminal, type LocalDatabase } from "@polivo/db-local";
import { createPublicKey, verify } from "node:crypto";

import { unauthenticatedError, type AppError } from "../errors/app-error.js";
import { publicKeyFromPrivate, signPossessionMessage } from "../security/ed25519.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";

export type DeviceProof = {
  deviceId: string;
  signedAt: string;
  signature: string;
};

export type VerifiedDevice = {
  deviceId: string;
  kind: "host" | "terminal";
};

export function buildDeviceAuthMessage(input: {
  deviceId: string;
  signedAt: string;
  method: string;
  path: string;
}): string {
  return ["polivo-device-auth-v1", input.deviceId, input.signedAt, input.method, input.path].join(
    "\n",
  );
}

export function signDeviceAuthMessage(
  privateKeyPkcs8: string,
  input: { deviceId: string; signedAt: string; method: string; path: string },
): string {
  return signPossessionMessage(privateKeyPkcs8, buildDeviceAuthMessage(input));
}

/**
 * Verify the caller is the activated host or an accepted, non-revoked terminal.
 * Host public key is derived from OS-protected private key (or simulated storage in tests).
 */
export function verifyDeviceProof(input: {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  proof: DeviceProof;
  method: string;
  path: string;
  nowIso: string;
  /** Reject proofs older than this many ms (clock skew / replay bound). */
  maxSkewMs?: number;
}): VerifiedDevice | AppError {
  const maxSkewMs = input.maxSkewMs ?? 5 * 60 * 1000;
  const signedAtMs = Date.parse(input.proof.signedAt);
  const nowMs = Date.parse(input.nowIso);
  if (Number.isNaN(signedAtMs) || Number.isNaN(nowMs)) {
    return unauthenticatedError("Device proof timestamp is invalid.");
  }
  if (Math.abs(nowMs - signedAtMs) > maxSkewMs) {
    return unauthenticatedError("Device proof timestamp is outside the allowed window.");
  }

  const host = getHostEnrollment(input.database);
  if (host.activationState !== "activated") {
    return unauthenticatedError("Host is not activated for this stall.");
  }

  const message = buildDeviceAuthMessage({
    deviceId: input.proof.deviceId,
    signedAt: input.proof.signedAt,
    method: input.method,
    path: input.path,
  });

  if (input.proof.deviceId === host.hostDeviceId || input.proof.deviceId === host.cloudDeviceId) {
    const privateKey = input.secureStorage.getSecret(host.credentialRef);
    if (!privateKey) {
      return unauthenticatedError("Host device credential is unavailable.");
    }
    const publicKey = publicKeyFromPrivate(privateKey);
    if (!verifyEd25519(publicKey, message, input.proof.signature)) {
      return unauthenticatedError("Device proof is invalid.");
    }
    return { deviceId: host.hostDeviceId, kind: "host" };
  }

  const terminal = tryGetAcceptedTerminal(input.database, input.proof.deviceId);
  if (terminal === null || terminal.pairingState !== "accepted") {
    return unauthenticatedError("Device is not enrolled or has been revoked.");
  }
  if (!verifyEd25519(terminal.publicKey, message, input.proof.signature)) {
    return unauthenticatedError("Device proof is invalid.");
  }
  return { deviceId: terminal.terminalDeviceId, kind: "terminal" };
}

function verifyEd25519(publicKey: string, message: string, signature: string): boolean {
  try {
    const keyBytes = Buffer.from(publicKey, "base64url");
    const sig = Buffer.from(signature, "base64url");
    if (keyBytes.length !== 32 || sig.length !== 64) {
      return false;
    }
    const keyObject = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keyBytes]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message, "utf8"), keyObject, sig);
  } catch {
    return false;
  }
}
