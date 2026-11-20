import {
  accessConfigEnvelopeSchema,
  accessConfigPayloadSchema,
  CONFIG_PROTOCOL_VERSION,
  CONFIG_SYNC_MAX_REQUEST_BYTES,
  configPullRequestBodySchema,
  configPullResponseSchema,
  type AccessConfigEnvelope,
  type ConfigAuthHeaders,
  type ConfigPullResponse,
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

import { verifyConfigPullPossession } from "./crypto";

function toIso(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

export async function pullAccessConfig(input: {
  rawBodyText: string;
  auth: ConfigAuthHeaders;
}): Promise<ConfigPullResponse> {
  if (Buffer.byteLength(input.rawBodyText, "utf8") > CONFIG_SYNC_MAX_REQUEST_BYTES) {
    throw validationError("Config pull request exceeds maximum encoded size.");
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

  const bodyResult = configPullRequestBodySchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    throw validationError(bodyResult.error.issues[0]?.message ?? "Invalid config pull body.");
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
      "device_id, role, enrollment_state, installation_id, public_key, credential_version, tenant_id, revoked_at",
    )
    .eq("tenant_id", input.auth.tenantId)
    .eq("device_id", input.auth.deviceId)
    .maybeSingle();

  if (deviceError) {
    console.error("config.device_lookup_failed", redactForLog({ message: deviceError.message }));
    throw serviceUnavailableError("Unable to verify host device.");
  }
  if (!deviceRow) {
    throw unauthenticatedError("Host device was not found.");
  }
  if (deviceRow.role !== "host") {
    throw forbiddenError("Only an activated host may pull configuration.");
  }
  if (deviceRow.enrollment_state === "revoked" || deviceRow.revoked_at != null) {
    return configPullResponseSchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      correlationId: `req_${randomUUID().replace(/-/g, "")}`,
      requestId: body.requestId,
      tenantId: body.tenantId,
      stallId: body.stallId,
      domain: "access",
      outcome: "host_revoked",
      envelope: null,
      publishedRevision: null,
      lastAcknowledgedRevision: null,
      message: "Host device is revoked.",
    });
  }
  if (deviceRow.enrollment_state !== "activated") {
    throw forbiddenError("Only an activated host may pull configuration.");
  }
  if (
    deviceRow.installation_id !== input.auth.installationId ||
    deviceRow.credential_version !== input.auth.credentialVersion
  ) {
    throw unauthenticatedError("Host credential identity mismatch.");
  }

  const possession = verifyConfigPullPossession({
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
    "host_pull_access_config" as never,
    {
      p_tenant_id: body.tenantId,
      p_device_id: input.auth.deviceId,
      p_installation_id: input.auth.installationId,
      p_credential_version: input.auth.credentialVersion,
      p_known_revision: body.knownRevision,
    } as never,
  );
  if (error) {
    console.error("config.pull_rpc_failed", redactForLog({ message: error.message }));
    throw serviceUnavailableError("Unable to pull access configuration.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) {
    throw serviceUnavailableError("Config pull returned no result.");
  }

  const outcome = String(row.outcome);
  const correlationId = `req_${randomUUID().replace(/-/g, "")}`;
  const publishedRevision =
    row.published_revision == null ? null : Number(row.published_revision);
  const lastAcknowledgedRevision =
    row.last_acknowledged_revision == null ? null : Number(row.last_acknowledged_revision);

  if (outcome === "host_revoked") {
    return configPullResponseSchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      correlationId,
      requestId: body.requestId,
      tenantId: body.tenantId,
      stallId: body.stallId,
      domain: "access",
      outcome: "host_revoked",
      envelope: null,
      publishedRevision,
      lastAcknowledgedRevision,
      message: row.message == null ? "Host device is revoked." : String(row.message),
    });
  }

  if (outcome === "unauthorized") {
    throw unauthenticatedError(row.message == null ? "Unauthorized." : String(row.message));
  }

  if (outcome === "up_to_date" || outcome !== "snapshot") {
    return configPullResponseSchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      correlationId,
      requestId: body.requestId,
      tenantId: body.tenantId,
      stallId: body.stallId,
      domain: "access",
      outcome: "up_to_date",
      envelope: null,
      publishedRevision,
      lastAcknowledgedRevision,
      message: row.message == null ? null : String(row.message),
    });
  }

  const payloadParsed = accessConfigPayloadSchema.safeParse(row.payload);
  if (!payloadParsed.success) {
    console.error("config.pull_payload_invalid", redactForLog({ issues: payloadParsed.error.issues }));
    throw serviceUnavailableError("Published access payload is invalid.");
  }

  const envelope: AccessConfigEnvelope = accessConfigEnvelopeSchema.parse({
    protocolVersion: CONFIG_PROTOCOL_VERSION,
    schemaVersion: String(row.schema_version ?? "1"),
    domain: "access",
    snapshotKind: "complete_replacement",
    tenantId: body.tenantId,
    stallId: body.stallId,
    targetScope: "stall_host",
    targetHostDeviceId: input.auth.deviceId,
    revision: Number(row.revision),
    publicationId: String(row.publication_id),
    issuedAt: toIso(row.issued_at),
    maxSnapshotAgeMs: Number(row.max_snapshot_age_ms ?? 604800000),
    requiredCompatibilityVersion: Number(row.required_compatibility_version ?? 1),
    payloadHash: String(row.payload_hash),
    payload: payloadParsed.data,
  });

  return configPullResponseSchema.parse({
    protocolVersion: CONFIG_PROTOCOL_VERSION,
    correlationId,
    requestId: body.requestId,
    tenantId: body.tenantId,
    stallId: body.stallId,
    domain: "access",
    outcome: "snapshot",
    envelope,
    publishedRevision,
    lastAcknowledgedRevision,
    message: null,
  });
}
