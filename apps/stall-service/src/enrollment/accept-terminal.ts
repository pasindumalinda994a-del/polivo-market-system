import {
  getHostEnrollment,
  tryGetAcceptedTerminal,
  upsertAcceptedTerminal,
  type LocalDatabase,
} from "@polivo/db-local";
import { createPublicKey, verify } from "node:crypto";

export type AcceptTerminalInput = {
  terminalDeviceId: string;
  publicKey: string;
  credentialVersion: number;
  label?: string | null;
  cloudStateRevision: number;
  pairingArtifact: string;
  pairingSignature: string;
};

export type AcceptTerminalResult = {
  pairingState: "accepted";
  cloudStateRevision: number;
};

/**
 * Host verifies a terminal pairing artifact and durably accepts the terminal identity.
 * Rejects terminals intended for a different host (artifact embeds host device id).
 */
export function acceptTerminalPairing(
  database: LocalDatabase,
  input: AcceptTerminalInput,
  nowIso: string,
): AcceptTerminalResult {
  const host = getHostEnrollment(database);
  if (host.activationState !== "activated" || !host.cloudDeviceId) {
    throw new Error("Host is not activated; cannot accept terminal pairing.");
  }

  let artifact: {
    hostDeviceId: string;
    terminalDeviceId: string;
    publicKey: string;
    credentialVersion: number;
    cloudStateRevision: number;
  };
  try {
    artifact = JSON.parse(input.pairingArtifact) as typeof artifact;
  } catch {
    throw new Error("Pairing artifact is not valid JSON.");
  }

  if (artifact.hostDeviceId !== host.cloudDeviceId && artifact.hostDeviceId !== host.hostDeviceId) {
    throw new Error("Terminal pairing is intended for a different host.");
  }
  if (artifact.terminalDeviceId !== input.terminalDeviceId) {
    throw new Error("Terminal device id mismatch.");
  }
  if (artifact.publicKey !== input.publicKey) {
    throw new Error("Terminal public key mismatch.");
  }

  if (!verifyEd25519(input.publicKey, input.pairingArtifact, input.pairingSignature)) {
    throw new Error("Terminal pairing signature is invalid.");
  }

  const existing = tryGetAcceptedTerminal(database, input.terminalDeviceId);
  if (existing?.pairingState === "revoked") {
    throw new Error("This terminal credential was revoked locally.");
  }

  upsertAcceptedTerminal(database, {
    terminalDeviceId: input.terminalDeviceId,
    publicKey: input.publicKey,
    credentialVersion: input.credentialVersion,
    label: input.label ?? null,
    pairingState: "accepted",
    cloudStateRevision: input.cloudStateRevision,
    acceptedAt: existing?.acceptedAt ?? nowIso,
    revokedAt: null,
    updatedAt: nowIso,
  });

  return {
    pairingState: "accepted",
    cloudStateRevision: input.cloudStateRevision,
  };
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
