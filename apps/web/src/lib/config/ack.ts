import {
  CONFIG_PROTOCOL_VERSION,
  CONFIG_SYNC_MAX_REQUEST_BYTES,
  configAckRequestBodySchema,
  configAckResponseSchema,
  type ConfigAckResponse,
  type ConfigAuthHeaders,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  forbiddenError,
  redactForLog,
  serviceUnavailableError,
  unauthenticatedError,
  validationError,
} from "@/lib/auth/errors";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { sha256HexOfUtf8 } from "@/lib/sync/canonical";

import { verifyConfigAckPossession } from "./crypto";

export async function acknowledgeAccessConfig(input: {
  rawBodyText: string;
  auth: ConfigAuthHeaders;
}): Promise<ConfigAckResponse> {
  if (Buffer.byteLength(input.rawBodyText, "utf8") > CONFIG_SYNC_MAX_REQUEST_BYTES) {
    throw validationError("Config acknowledgement exceeds maximum encoded size.");
  }

  const computedBodyHash = sha256HexOfUtf8(input.rawBodyText);
  if (computedBodyHash !== input.auth.bodySha256) {
    throw validationError("bodySha256 does not match the request body.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBodyText) as unknown;
  } catch {
    throw validationError("Request body must be JSON.");
  }

  const bodyResult = configAckRequestBodySchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    throw validationError(bodyResult.error.issues[0]?.message ?? "Invalid config ack body.");
  }
  const body = bodyResult.data;

  if (body.requestId !== input.auth.requestId) {
    throw validationError("auth.requestId must match body.requestId.");
  }
  if (body.tenantId !== input.auth.tenantId) {
    throw forbiddenError("tenantId does not match authenticated host.");
  }
  if (body.stallId !== body.tenantId) {
    throw forbiddenError("stallId must match the authorized stall binding.");
  }
  if (body.domain !== "access") {
    throw validationError("Unsupported configuration domain.");
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
    console.error("config.ack_device_lookup_failed", redactForLog({ message: deviceError.message }));
    throw serviceUnavailableError("Unable to verify host device.");
  }
  if (!deviceRow) {
    throw unauthenticatedError("Host device was not found.");
  }
  if (deviceRow.role !== "host" || deviceRow.enrollment_state !== "activated") {
    throw forbiddenError("Only an activated host may acknowledge configuration.");
  }
  if (
    deviceRow.installation_id !== input.auth.installationId ||
    deviceRow.credential_version !== input.auth.credentialVersion
  ) {
    throw unauthenticatedError("Host credential identity mismatch.");
  }

  const possession = verifyConfigAckPossession({
    publicKey: deviceRow.public_key,
    tenantId: input.auth.tenantId,
    deviceId: input.auth.deviceId,
    installationId: input.auth.installationId,
    credentialVersion: input.auth.credentialVersion,
    requestId: input.auth.requestId,
    bodySha256: input.auth.bodySha256,
    signedAt: input.auth.signedAt,
    signature: input.auth.signature,
  });
  if (!possession.ok) {
    throw unauthenticatedError(possession.reason);
  }

  const { data, error } = await client.rpc(
    "host_ack_access_config" as never,
    {
      p_tenant_id: body.tenantId,
      p_device_id: input.auth.deviceId,
      p_installation_id: input.auth.installationId,
      p_credential_version: input.auth.credentialVersion,
      p_revision: body.revision,
      p_publication_id: body.publicationId,
      p_payload_hash: body.payloadHash,
      p_result: body.result,
      p_applied_at: body.appliedAt,
      p_error_code: body.errorCode,
      p_message: body.message,
    } as never,
  );
  if (error) {
    console.error("config.ack_rpc_failed", redactForLog({ message: error.message }));
    throw serviceUnavailableError("Unable to record configuration acknowledgement.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) {
    throw serviceUnavailableError("Config acknowledgement returned no result.");
  }

  return configAckResponseSchema.parse({
    protocolVersion: CONFIG_PROTOCOL_VERSION,
    correlationId: `req_${randomUUID().replace(/-/g, "")}`,
    requestId: body.requestId,
    tenantId: body.tenantId,
    stallId: body.stallId,
    domain: "access",
    accepted: Boolean(row.accepted),
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    lastAcknowledgedRevision:
      row.last_acknowledged_revision == null ? null : Number(row.last_acknowledged_revision),
    message: row.message == null ? null : String(row.message),
  });
}
