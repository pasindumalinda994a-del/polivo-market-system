import {
  SYNC_INGEST_MAX_REQUEST_BYTES,
  SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_STREAM,
  SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_TENANT,
  SYNC_INGEST_RATE_LIMIT_WINDOW_SECONDS,
  SYNC_PROTOCOL_VERSION,
  syncIngestRequestBodySchema,
  syncIngestResponseSchema,
  type SyncIngestGroupOutcome,
  type SyncIngestRequestBody,
  type SyncIngestResponse,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import {
  forbiddenError,
  rateLimitedError,
  redactForLog,
  serviceUnavailableError,
  unauthenticatedError,
  validationError,
} from "@/lib/auth/errors";

import { sha256HexOfCanonicalJson, sha256HexOfUtf8 } from "./canonical";
import { verifyIngestPossession } from "./crypto";
import { validateIngestEventPayload } from "./validate-payload";

export type IngestAuthInput = {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  batchId: string;
  signedAt: string;
  bodySha256: string;
  signature: string;
};

type ApplyGroupResult = {
  outcome: SyncIngestGroupOutcome["outcome"];
  errorCode: string | null;
  message: string | null;
  retryable: boolean;
  acknowledgedEventIds: string[];
  committedCursor: string | null;
  nextExpectedSequence?: string | null;
  retryAfterSeconds?: number | null;
};

function mapOutcome(raw: Record<string, unknown>): ApplyGroupResult {
  const acknowledged = Array.isArray(raw.acknowledgedEventIds)
    ? (raw.acknowledgedEventIds as unknown[]).map(String)
    : [];
  return {
    outcome: String(raw.outcome) as ApplyGroupResult["outcome"],
    errorCode: raw.errorCode == null ? null : String(raw.errorCode),
    message: raw.message == null ? null : String(raw.message),
    retryable: Boolean(raw.retryable),
    acknowledgedEventIds: acknowledged,
    committedCursor: raw.committedCursor == null ? null : String(raw.committedCursor),
    nextExpectedSequence:
      raw.nextExpectedSequence == null ? null : String(raw.nextExpectedSequence),
    retryAfterSeconds:
      raw.retryAfterSeconds == null ? null : Number(raw.retryAfterSeconds),
  };
}

async function enforceRateLimits(input: {
  tenantId: string;
  sourceStreamId: string;
}): Promise<void> {
  const client = createPrivilegedSupabaseClient();
  const streamBucket = `stream:${input.tenantId}:${input.sourceStreamId}`;
  const tenantBucket = `tenant:${input.tenantId}`;

  for (const [bucket, max] of [
    [streamBucket, SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_STREAM],
    [tenantBucket, SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_TENANT],
  ] as const) {
    const { data, error } = await client.rpc(
      "check_sync_ingest_rate_limit" as never,
      {
        p_bucket_key: bucket,
        p_window_seconds: SYNC_INGEST_RATE_LIMIT_WINDOW_SECONDS,
        p_max_requests: max,
      } as never,
    );
    if (error) {
      console.error("sync.rate_limit_rpc_failed", redactForLog({ message: error.message }));
      throw serviceUnavailableError("Ingest rate-limit check failed.");
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && (row as { allowed?: boolean }).allowed === false) {
      throw rateLimitedError("Ingest rate limit exceeded.");
    }
  }
}

export async function ingestSyncBatch(input: {
  rawBodyText: string;
  auth: IngestAuthInput;
}): Promise<SyncIngestResponse> {
  if (Buffer.byteLength(input.rawBodyText, "utf8") > SYNC_INGEST_MAX_REQUEST_BYTES) {
    throw validationError("Ingest request exceeds maximum encoded size.");
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

  const bodyResult = syncIngestRequestBodySchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    throw validationError(bodyResult.error.issues[0]?.message ?? "Invalid ingest body.");
  }
  const body: SyncIngestRequestBody = bodyResult.data;

  if (body.batchId !== input.auth.batchId) {
    throw validationError("auth.batchId must match body.batchId.");
  }
  if (body.tenantId !== input.auth.tenantId) {
    throw forbiddenError("tenantId does not match authenticated host.");
  }
  if (body.stallId !== body.tenantId) {
    throw forbiddenError("stallId must match the authorized stall binding.");
  }
  if (body.sourceStream.sourceStreamId !== input.auth.installationId) {
    throw forbiddenError("sourceStreamId must equal installation_id.");
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
    console.error("sync.device_lookup_failed", redactForLog({ message: deviceError.message }));
    throw serviceUnavailableError("Unable to verify host device.");
  }
  if (!deviceRow) {
    throw unauthenticatedError("Host device was not found.");
  }
  if (deviceRow.role !== "host" || deviceRow.enrollment_state !== "activated") {
    throw forbiddenError("Only an activated host may upload sync events.");
  }
  if (
    deviceRow.installation_id !== input.auth.installationId ||
    deviceRow.credential_version !== input.auth.credentialVersion
  ) {
    throw unauthenticatedError("Host credential identity mismatch.");
  }

  const possession = verifyIngestPossession({
    publicKey: deviceRow.public_key,
    tenantId: input.auth.tenantId,
    deviceId: input.auth.deviceId,
    installationId: input.auth.installationId,
    credentialVersion: input.auth.credentialVersion,
    batchId: input.auth.batchId,
    bodySha256: input.auth.bodySha256,
    signedAt: input.auth.signedAt,
    signature: input.auth.signature,
  });
  if (!possession.ok) {
    throw unauthenticatedError(possession.reason);
  }

  await enforceRateLimits({
    tenantId: body.tenantId,
    sourceStreamId: body.sourceStream.sourceStreamId,
  });

  const correlationId = `req_${randomUUID().replace(/-/g, "")}`;
  const groupOutcomes: SyncIngestGroupOutcome[] = [];
  let committedCursor = "0";
  let nextExpectedSequence = "1";
  let stop = false;

  for (const group of body.groups) {
    if (stop) {
      groupOutcomes.push({
        transactionGroupId: group.transactionGroupId,
        outcome: "sequence_conflict",
        acknowledgedEventIds: [],
        errorCode: "STOPPED_AFTER_FAILURE",
        message: "Earlier group failed; remaining groups were not applied.",
        retryable: false,
      });
      continue;
    }

    const eventHashes: Record<string, string> = {};
    let precheckFailed: SyncIngestGroupOutcome | null = null;

    for (const event of group.events) {
      if (event.transactionGroupId !== group.transactionGroupId) {
        precheckFailed = {
          transactionGroupId: group.transactionGroupId,
          outcome: "incomplete_group",
          acknowledgedEventIds: [],
          errorCode: "GROUP_ID_MISMATCH",
          message: "Event transactionGroupId mismatch.",
          retryable: false,
        };
        break;
      }
      const payloadFailure = validateIngestEventPayload(event);
      if (payloadFailure) {
        precheckFailed = {
          transactionGroupId: group.transactionGroupId,
          outcome: payloadFailure.code,
          acknowledgedEventIds: [],
          errorCode: payloadFailure.code.toUpperCase(),
          message: payloadFailure.message,
          retryable: false,
        };
        break;
      }
      eventHashes[event.eventId] = sha256HexOfCanonicalJson(event.payload);
    }

    if (precheckFailed) {
      groupOutcomes.push(precheckFailed);
      stop = true;
      continue;
    }

    const { data, error } = await client.rpc(
      "apply_sync_ingestion_group" as never,
      {
        p_tenant_id: body.tenantId,
        p_stall_id: body.stallId,
        p_device_id: input.auth.deviceId,
        p_installation_id: input.auth.installationId,
        p_credential_version: input.auth.credentialVersion,
        p_source_stream_id: body.sourceStream.sourceStreamId,
        p_stream_generation: body.sourceStream.streamGeneration,
        p_transaction_group_id: group.transactionGroupId,
        p_events: group.events,
        p_event_hashes: eventHashes,
      } as never,
    );

    if (error) {
      console.error(
        "sync.apply_rpc_failed",
        redactForLog({
          correlationId,
          code: error.code,
          message: error.message,
        }),
      );
      groupOutcomes.push({
        transactionGroupId: group.transactionGroupId,
        outcome: "retryable_failure",
        acknowledgedEventIds: [],
        errorCode: "APPLY_RPC_FAILED",
        message: "Transactional apply failed; retry later.",
        retryable: true,
      });
      stop = true;
      continue;
    }

    const mapped = mapOutcome((data ?? {}) as Record<string, unknown>);
    if (mapped.committedCursor != null) {
      committedCursor = mapped.committedCursor;
    }
    if (mapped.nextExpectedSequence != null) {
      nextExpectedSequence = mapped.nextExpectedSequence;
    } else if (mapped.committedCursor != null) {
      nextExpectedSequence = String(BigInt(mapped.committedCursor) + BigInt(1));
    }

    groupOutcomes.push({
      transactionGroupId: group.transactionGroupId,
      outcome: mapped.outcome,
      acknowledgedEventIds: mapped.acknowledgedEventIds,
      errorCode: mapped.errorCode,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(mapped.retryAfterSeconds != null
        ? { retryAfterSeconds: mapped.retryAfterSeconds }
        : {}),
    });

    if (mapped.outcome !== "applied" && mapped.outcome !== "already_applied") {
      stop = true;
    }
  }

  const allGroupsAccepted = groupOutcomes.every(
    (outcome) => outcome.outcome === "applied" || outcome.outcome === "already_applied",
  );

  console.info(
    "sync.ingest.completed",
    redactForLog({
      correlationId,
      tenantId: body.tenantId,
      sourceStreamId: body.sourceStream.sourceStreamId,
      batchId: body.batchId,
      groups: groupOutcomes.length,
      accepted: allGroupsAccepted,
      committedCursor,
    }),
  );

  return syncIngestResponseSchema.parse({
    protocolVersion: SYNC_PROTOCOL_VERSION,
    correlationId,
    batchId: body.batchId,
    tenantId: body.tenantId,
    stallId: body.stallId,
    sourceStreamId: body.sourceStream.sourceStreamId,
    streamGeneration: body.sourceStream.streamGeneration,
    committedCursor,
    nextExpectedSequence,
    groupOutcomes,
    allGroupsAccepted,
  });
}
