import {
  buildConfigAckPossessionMessage,
  buildConfigPullPossessionMessage,
} from "@polivo/contracts";
import { getHostEnrollment, tryGetHostEnrollment, type LocalDatabase } from "@polivo/db-local";

import { signPossessionMessage } from "../security/ed25519.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";
import { HostCredentialConfigurationError, type HostIngestIdentity } from "../sync/signer.js";
import { sha256HexOfUtf8 } from "../sync/canonical.js";

export type SignedConfigRequest = {
  rawBody: string;
  bodySha256: string;
  signedAt: string;
  signature: string;
  headers: Record<string, string>;
};

export type HostConfigSigner = {
  loadIdentity: () => HostIngestIdentity;
  signPullBody: (input: {
    rawBody: string;
    requestId: string;
    signedAt: string;
  }) => SignedConfigRequest;
  signAckBody: (input: {
    rawBody: string;
    requestId: string;
    signedAt: string;
  }) => SignedConfigRequest;
};

export function createHostConfigSigner(input: {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  stallId: string;
  tenantId: string;
}): HostConfigSigner {
  const loadPrivateKey = (): { identity: HostIngestIdentity; privateKey: string } => {
    const host = tryGetHostEnrollment(input.database);
    if (!host || host.activationState !== "activated") {
      throw new HostCredentialConfigurationError(
        "Host is not activated. Complete stall provisioning before enabling configuration sync.",
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

  const sign = (
    kind: "pull" | "ack",
    rawBody: string,
    requestId: string,
    signedAt: string,
  ): SignedConfigRequest => {
    const { identity, privateKey } = loadPrivateKey();
    const bodySha256 = sha256HexOfUtf8(rawBody);
    const messageInput = {
      tenantId: identity.tenantId,
      deviceId: identity.deviceId,
      installationId: identity.installationId,
      credentialVersion: identity.credentialVersion,
      requestId,
      bodySha256,
      signedAt,
    };
    const message =
      kind === "pull"
        ? buildConfigPullPossessionMessage(messageInput)
        : buildConfigAckPossessionMessage(messageInput);
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
        "x-polivo-request-id": requestId,
        "x-polivo-signed-at": signedAt,
        "x-polivo-body-sha256": bodySha256,
        "x-polivo-signature": signature,
      },
    };
  };

  return {
    loadIdentity: () => loadPrivateKey().identity,
    signPullBody: ({ rawBody, requestId, signedAt }) => sign("pull", rawBody, requestId, signedAt),
    signAckBody: ({ rawBody, requestId, signedAt }) => sign("ack", rawBody, requestId, signedAt),
  };
}
