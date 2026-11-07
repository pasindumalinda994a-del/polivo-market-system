import {
  buildHostIdentityMessage,
  type HostIdentityResponse,
  type HostTrustBundle,
} from "@polivo/contracts";
import { getHostEnrollment, tryGetStallBinding, type LocalDatabase } from "@polivo/db-local";

import { publicKeyFromPrivate, signPossessionMessage } from "../security/ed25519.js";
import { resolveStallDisplayName } from "../security/host-meta.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";
import type { TlsMaterial } from "../security/tls-material.js";

export type HostTrustContext = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  tlsMaterial: TlsMaterial;
  credentialRoot: string;
  nowIso: string;
};

export function buildHostTrustBundle(ctx: HostTrustContext): HostTrustBundle {
  const host = getHostEnrollment(ctx.database);
  if (host.activationState !== "activated") {
    throw new Error("Host is not activated; trust bundle is unavailable.");
  }
  const privateKey = ctx.secureStorage.getSecret(host.credentialRef);
  if (!privateKey) {
    throw new Error("Host device credential is unavailable.");
  }
  const binding = tryGetStallBinding(ctx.database);
  const stallDisplayName = resolveStallDisplayName({
    credentialRoot: ctx.credentialRoot,
    fallbackTenantId: binding?.tenantId ?? null,
  });
  return {
    hostDeviceId: host.cloudDeviceId ?? host.hostDeviceId,
    hostPublicKey: publicKeyFromPrivate(privateKey),
    hostCredentialVersion: host.credentialVersion,
    stallDisplayName,
    tlsCertificateSha256: ctx.tlsMaterial.certificateSha256,
  };
}

export function buildSignedHostIdentity(ctx: HostTrustContext): HostIdentityResponse {
  const host = getHostEnrollment(ctx.database);
  const privateKey = ctx.secureStorage.getSecret(host.credentialRef);
  if (!privateKey) {
    throw new Error("Host device credential is unavailable.");
  }
  const bundle = buildHostTrustBundle(ctx);
  const signedAt = ctx.nowIso;
  const message = buildHostIdentityMessage({ ...bundle, signedAt });
  const signature = signPossessionMessage(privateKey, message);
  return {
    ...bundle,
    signedAt,
    signature,
  };
}

export function buildAcceptTrustFields(ctx: HostTrustContext): {
  hostDeviceId: string;
  hostPublicKey: string;
  hostCredentialVersion: number;
  stallDisplayName: string;
  tlsCertificateSha256: string;
  trustSignedAt: string;
  trustSignature: string;
} {
  const identity = buildSignedHostIdentity(ctx);
  return {
    hostDeviceId: identity.hostDeviceId,
    hostPublicKey: identity.hostPublicKey,
    hostCredentialVersion: identity.hostCredentialVersion,
    stallDisplayName: identity.stallDisplayName,
    tlsCertificateSha256: identity.tlsCertificateSha256,
    trustSignedAt: identity.signedAt,
    trustSignature: identity.signature,
  };
}
