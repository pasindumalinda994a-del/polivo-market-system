import {
  buildIngestPossessionMessage,
  SYNC_INGEST_SIGNED_AT_SKEW_SECONDS,
} from "@polivo/contracts";

import { verifyEd25519Possession } from "@/lib/device/crypto";

export { buildIngestPossessionMessage };

export function verifyIngestPossession(input: {
  publicKey: string;
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  batchId: string;
  bodySha256: string;
  signedAt: string;
  signature: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.nowMs ?? Date.now();
  const signedAtMs = Date.parse(input.signedAt);
  if (!Number.isFinite(signedAtMs)) {
    return { ok: false, reason: "signedAt is not a valid timestamp." };
  }
  const skewMs = SYNC_INGEST_SIGNED_AT_SKEW_SECONDS * 1000;
  if (Math.abs(now - signedAtMs) > skewMs) {
    return { ok: false, reason: "signedAt is outside the allowed skew window." };
  }

  const message = buildIngestPossessionMessage(input);
  const verified = verifyEd25519Possession({
    publicKey: input.publicKey,
    message,
    signature: input.signature,
  });
  if (!verified) {
    return { ok: false, reason: "Ingest possession signature is invalid." };
  }
  return { ok: true };
}
