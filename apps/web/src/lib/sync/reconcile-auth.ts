import {
  buildSyncManifestSummaryPossessionMessage,
  buildSyncProgressPossessionMessage,
  buildSyncReceiptLookupPossessionMessage,
  SYNC_INGEST_SIGNED_AT_SKEW_SECONDS,
} from "@polivo/contracts";

import {
  forbiddenError,
  redactForLog,
  serviceUnavailableError,
  unauthenticatedError,
  validationError,
} from "@/lib/auth/errors";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { verifyEd25519Possession } from "@/lib/device/crypto";

import { sha256HexOfUtf8 } from "./canonical";

export type ReconcileAuthHeaders = {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  signedAt: string;
  bodySha256: string;
  signature: string;
};

export function parseReconcileAuthHeaders(request: Request): ReconcileAuthHeaders {
  const tenantId = request.headers.get("x-polivo-tenant-id");
  const deviceId = request.headers.get("x-polivo-device-id");
  const installationId = request.headers.get("x-polivo-installation-id");
  const credentialVersion = Number(request.headers.get("x-polivo-credential-version"));
  const requestId = request.headers.get("x-polivo-request-id");
  const signedAt = request.headers.get("x-polivo-signed-at");
  const bodySha256 = request.headers.get("x-polivo-body-sha256");
  const signature = request.headers.get("x-polivo-signature");
  if (
    !tenantId ||
    !deviceId ||
    !installationId ||
    !Number.isFinite(credentialVersion) ||
    !requestId ||
    !signedAt ||
    !bodySha256 ||
    !signature
  ) {
    throw validationError("Invalid sync reconciliation authentication headers.");
  }
  return {
    tenantId,
    deviceId,
    installationId,
    credentialVersion,
    requestId,
    signedAt,
    bodySha256,
    signature,
  };
}

export async function verifyHostReconcileRequest(input: {
  rawBodyText: string;
  auth: ReconcileAuthHeaders;
  possessionKind: "progress" | "receipts" | "manifest";
}): Promise<{ publicKey: string }> {
  const computedBodyHash = sha256HexOfUtf8(input.rawBodyText);
  if (computedBodyHash !== input.auth.bodySha256) {
    throw validationError("bodySha256 does not match the request body.");
  }

  const signedAtMs = Date.parse(input.auth.signedAt);
  if (!Number.isFinite(signedAtMs)) {
    throw validationError("signedAt is not a valid timestamp.");
  }
  const skewMs = SYNC_INGEST_SIGNED_AT_SKEW_SECONDS * 1000;
  if (Math.abs(Date.now() - signedAtMs) > skewMs) {
    throw unauthenticatedError("signedAt is outside the allowed skew window.");
  }

  const client = createPrivilegedSupabaseClient();
  const { data: deviceRow, error: deviceError } = await client
    .from("tenant_devices")
    .select(
      "device_id, role, enrollment_state, installation_id, public_key, credential_version, tenant_id",
    )
    .eq("tenant_id", input.auth.tenantId)
    .eq("device_id", input.auth.deviceId)
    .maybeSingle();

  if (deviceError) {
    console.error("sync.reconcile.device_lookup_failed", redactForLog({ message: deviceError.message }));
    throw serviceUnavailableError("Unable to verify host device.");
  }
  if (!deviceRow) {
    throw unauthenticatedError("Host device was not found.");
  }
  if (deviceRow.role !== "host" || deviceRow.enrollment_state !== "activated") {
    throw forbiddenError("Only an activated host may call reconciliation lookups.");
  }
  if (
    deviceRow.installation_id !== input.auth.installationId ||
    deviceRow.credential_version !== input.auth.credentialVersion
  ) {
    throw unauthenticatedError("Host credential identity mismatch.");
  }

  const messageInput = {
    tenantId: input.auth.tenantId,
    deviceId: input.auth.deviceId,
    installationId: input.auth.installationId,
    credentialVersion: input.auth.credentialVersion,
    requestId: input.auth.requestId,
    bodySha256: input.auth.bodySha256,
    signedAt: input.auth.signedAt,
  };
  const message =
    input.possessionKind === "progress"
      ? buildSyncProgressPossessionMessage(messageInput)
      : input.possessionKind === "receipts"
        ? buildSyncReceiptLookupPossessionMessage(messageInput)
        : buildSyncManifestSummaryPossessionMessage(messageInput);

  const verified = verifyEd25519Possession({
    publicKey: deviceRow.public_key,
    message,
    signature: input.auth.signature,
  });
  if (!verified) {
    throw unauthenticatedError("Reconciliation possession signature is invalid.");
  }
  return { publicKey: deviceRow.public_key };
}
