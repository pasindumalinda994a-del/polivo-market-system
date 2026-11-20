import {
  buildConfigAckPossessionMessage,
  buildConfigPullPossessionMessage,
  CONFIG_SYNC_SIGNED_AT_SKEW_SECONDS,
} from "@polivo/contracts";

import { verifyEd25519Possession } from "@/lib/device/crypto";

export function verifyConfigPullPossession(input: {
  publicKey: string;
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
  signature: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const skew = checkSkew(input.signedAt, input.nowMs);
  if (!skew.ok) {
    return skew;
  }
  const message = buildConfigPullPossessionMessage(input);
  const verified = verifyEd25519Possession({
    publicKey: input.publicKey,
    message,
    signature: input.signature,
  });
  if (!verified) {
    return { ok: false, reason: "Config pull possession signature is invalid." };
  }
  return { ok: true };
}

export function verifyConfigAckPossession(input: {
  publicKey: string;
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
  signature: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const skew = checkSkew(input.signedAt, input.nowMs);
  if (!skew.ok) {
    return skew;
  }
  const message = buildConfigAckPossessionMessage(input);
  const verified = verifyEd25519Possession({
    publicKey: input.publicKey,
    message,
    signature: input.signature,
  });
  if (!verified) {
    return { ok: false, reason: "Config acknowledgement possession signature is invalid." };
  }
  return { ok: true };
}

function checkSkew(signedAt: string, nowMs?: number): { ok: true } | { ok: false; reason: string } {
  const now = nowMs ?? Date.now();
  const signedAtMs = Date.parse(signedAt);
  if (!Number.isFinite(signedAtMs)) {
    return { ok: false, reason: "signedAt is not a valid timestamp." };
  }
  const skewMs = CONFIG_SYNC_SIGNED_AT_SKEW_SECONDS * 1000;
  if (Math.abs(now - signedAtMs) > skewMs) {
    return { ok: false, reason: "signedAt is outside the allowed skew window." };
  }
  return { ok: true };
}
