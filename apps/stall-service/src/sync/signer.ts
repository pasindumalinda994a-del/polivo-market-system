import { buildIngestPossessionMessage } from "@polivo/contracts";
import {
  getHostEnrollment,
  tryGetHostEnrollment,
  type LocalDatabase,
} from "@polivo/db-local";

import { signPossessionMessage } from "../security/ed25519.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";
import { sha256HexOfUtf8 } from "./canonical.js";

export type HostIngestIdentity = {
  tenantId: string;
  stallId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
};

export type SignedIngestRequest = {
  rawBody: string;
  bodySha256: string;
  signedAt: string;
  signature: string;
  headers: Record<string, string>;
};

export type HostIngestSigner = {
  loadIdentity: () => HostIngestIdentity;
  signBody: (input: {
    rawBody: string;
    batchId: string;
    signedAt: string;
  }) => SignedIngestRequest;
};

export class HostCredentialConfigurationError extends Error {
  readonly code = "HOST_CREDENTIAL_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "HostCredentialConfigurationError";
  }
}

/**
 * Service-side signing facade. Loads the enrolled host key from secure storage
 * and never returns private key material to callers.
 */
export function createHostIngestSigner(input: {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  stallId: string;
  tenantId: string;
}): HostIngestSigner {
  const loadPrivateKey = (): { identity: HostIngestIdentity; privateKey: string } => {
    const host = tryGetHostEnrollment(input.database);
    if (!host || host.activationState !== "activated") {
      throw new HostCredentialConfigurationError(
        "Host is not activated. Complete stall provisioning before enabling sync uploads.",
      );
    }
    if (host.installationId.trim().length === 0) {
      throw new HostCredentialConfigurationError("Host installation identity is missing.");
    }
    const privateKey = input.secureStorage.getSecret(host.credentialRef);
    if (!privateKey) {
      throw new HostCredentialConfigurationError(
        "Host device credential is unavailable. Reopen secure storage under the Windows account used for activation, or re-activate the host.",
      );
    }
    const enrollment = getHostEnrollment(input.database);
    return {
      identity: {
        tenantId: input.tenantId,
        stallId: input.stallId,
        deviceId: enrollment.cloudDeviceId ?? enrollment.hostDeviceId,
        installationId: enrollment.installationId,
        credentialVersion: enrollment.credentialVersion,
      },
      privateKey,
    };
  };

  return {
    loadIdentity: () => loadPrivateKey().identity,
    signBody: ({ rawBody, batchId, signedAt }) => {
      const { identity, privateKey } = loadPrivateKey();
      const bodySha256 = sha256HexOfUtf8(rawBody);
      const message = buildIngestPossessionMessage({
        tenantId: identity.tenantId,
        deviceId: identity.deviceId,
        installationId: identity.installationId,
        credentialVersion: identity.credentialVersion,
        batchId,
        bodySha256,
        signedAt,
      });
      const signature = signPossessionMessage(privateKey, message);
      return {
        rawBody,
        bodySha256,
        signedAt,
        signature,
        headers: {
          "content-type": "application/json",
          "x-polivo-tenant-id": identity.tenantId,
          "x-polivo-device-id": identity.deviceId,
          "x-polivo-installation-id": identity.installationId,
          "x-polivo-credential-version": String(identity.credentialVersion),
          "x-polivo-batch-id": batchId,
          "x-polivo-signed-at": signedAt,
          "x-polivo-body-sha256": bodySha256,
          "x-polivo-signature": signature,
        },
      };
    },
  };
}
