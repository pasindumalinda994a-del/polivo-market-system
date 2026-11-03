import {
  getHostEnrollment,
  getLocalInstallation,
  updateHostActivationState,
  type LocalDatabase,
} from "@polivo/db-local";

import {
  generateDeviceKeyPair,
  publicKeyFromPrivate,
  signPossessionMessage,
} from "../security/ed25519.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";

export type RotateHostCredentialOptions = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  enrollmentBaseUrl: string;
  tenantId: string;
  fetchImpl?: typeof fetch;
};

/**
 * Install and prove possession of a replacement host credential before retiring the predecessor.
 * Interrupted rotation resumes when cloud already has the new version.
 */
export async function rotateHostCredential(
  options: RotateHostCredentialOptions,
): Promise<{ credentialVersion: number; stateRevision: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const enrollment = getHostEnrollment(options.database);
  const installation = getLocalInstallation(options.database);

  if (enrollment.activationState !== "activated" || !enrollment.cloudDeviceId) {
    throw new Error("Host must be activated before credential rotation.");
  }

  const previousSecret = options.secureStorage.getSecret(enrollment.credentialRef);
  if (!previousSecret) {
    throw new Error("Current host credential could not be opened from protected storage.");
  }
  const previousPublicKey = publicKeyFromPrivate(previousSecret);
  const nextVersion = enrollment.credentialVersion + 1;
  const nextRef = `host-${installation.id}-v${nextVersion}`;

  let nextPrivate = options.secureStorage.getSecret(nextRef);
  let nextPublic: string;
  if (!nextPrivate) {
    const keys = generateDeviceKeyPair();
    nextPrivate = keys.privateKeyPkcs8;
    nextPublic = keys.publicKey;
    options.secureStorage.setSecret(nextRef, nextPrivate);
    const reopened = options.secureStorage.getSecret(nextRef);
    if (reopened !== nextPrivate) {
      throw new Error("Replacement credential could not be reopened; rotation left incomplete.");
    }
  } else {
    nextPublic = publicKeyFromPrivate(nextPrivate);
  }

  const possessionMessage = [
    "polivo-rotate-v1",
    options.tenantId,
    enrollment.cloudDeviceId,
    installation.id,
    previousPublicKey,
    String(enrollment.credentialVersion),
    nextPublic,
    String(nextVersion),
  ].join("\n");
  // Prove possession of the *new* key for the rotation RPC (server verifies signature).
  const possessionSignature = signPossessionMessage(nextPrivate, possessionMessage);

  const response = await fetchImpl(
    new URL("/api/device-enrollment/rotate", options.enrollmentBaseUrl).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        tenantId: options.tenantId,
        deviceId: enrollment.cloudDeviceId,
        installationId: installation.id,
        previousPublicKey,
        previousCredentialVersion: enrollment.credentialVersion,
        newPublicKey: nextPublic,
        newCredentialVersion: nextVersion,
        possessionMessage,
        possessionSignature,
      }),
    },
  );
  const payload = (await response.json()) as {
    credentialVersion?: number;
    stateRevision?: number;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Credential rotation failed.");
  }

  updateHostActivationState(options.database, {
    activationState: "activated",
    credentialRef: nextRef,
    credentialVersion: payload.credentialVersion ?? nextVersion,
    cloudStateRevision: payload.stateRevision ?? enrollment.cloudStateRevision,
    updatedAt: new Date().toISOString(),
  });

  // Retire predecessor only after cloud + local accept the new version.
  options.secureStorage.deleteSecret(enrollment.credentialRef);

  return {
    credentialVersion: payload.credentialVersion ?? nextVersion,
    stateRevision: payload.stateRevision ?? nextVersion,
  };
}
