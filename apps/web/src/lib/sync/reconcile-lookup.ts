import {
  syncCloudProgressResponseSchema,
  syncCloudReceiptLookupRequestSchema,
  syncCloudReceiptLookupResponseSchema,
  type SyncCloudProgressResponse,
  type SyncCloudReceiptLookupResponse,
} from "@polivo/contracts";

import {
  redactForLog,
  serviceUnavailableError,
  validationError,
} from "@/lib/auth/errors";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";

import {
  parseReconcileAuthHeaders,
  verifyHostReconcileRequest,
  type ReconcileAuthHeaders,
} from "./reconcile-auth";

function toIso(value: unknown): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(Date.parse(value)).toISOString();
  }
  return new Date().toISOString();
}

export async function getSyncStreamProgress(input: {
  rawBodyText: string;
  auth: ReconcileAuthHeaders;
}): Promise<SyncCloudProgressResponse> {
  await verifyHostReconcileRequest({
    rawBodyText: input.rawBodyText,
    auth: input.auth,
    possessionKind: "progress",
  });
  let body: { sourceStreamId?: string };
  try {
    body = JSON.parse(input.rawBodyText) as { sourceStreamId?: string };
  } catch {
    throw validationError("Request body must be JSON.");
  }
  if (!body.sourceStreamId) {
    throw validationError("sourceStreamId is required.");
  }

  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc("host_get_sync_stream_progress" as never, {
    p_tenant_id: input.auth.tenantId,
    p_device_id: input.auth.deviceId,
    p_installation_id: input.auth.installationId,
    p_credential_version: input.auth.credentialVersion,
    p_source_stream_id: body.sourceStreamId,
  } as never);

  if (error) {
    console.error("sync.progress_rpc_failed", redactForLog({ message: error.message }));
    throw serviceUnavailableError("Unable to load stream progress.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return syncCloudProgressResponseSchema.parse({
      sourceStreamId: body.sourceStreamId,
      streamGeneration: 1,
      committedCursor: "0",
      observedAt: new Date().toISOString(),
      stallId: input.auth.tenantId,
      deviceId: input.auth.deviceId,
    });
  }
  const record = row as Record<string, unknown>;
  return syncCloudProgressResponseSchema.parse({
    sourceStreamId: String(record.source_stream_id),
    streamGeneration: Number(record.stream_generation),
    committedCursor: String(record.committed_cursor),
    observedAt: toIso(record.observed_at),
    stallId: String(record.stall_id),
    deviceId: String(record.device_id),
  });
}

export async function lookupSyncReceipts(input: {
  rawBodyText: string;
  auth: ReconcileAuthHeaders;
}): Promise<SyncCloudReceiptLookupResponse> {
  await verifyHostReconcileRequest({
    rawBodyText: input.rawBodyText,
    auth: input.auth,
    possessionKind: "receipts",
  });
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBodyText) as unknown;
  } catch {
    throw validationError("Request body must be JSON.");
  }
  const bodyResult = syncCloudReceiptLookupRequestSchema.safeParse(parsedJson);
  if (!bodyResult.success) {
    throw validationError(bodyResult.error.issues[0]?.message ?? "Invalid receipt lookup body.");
  }
  const body = bodyResult.data;
  if (body.requestId !== input.auth.requestId) {
    // Allow mismatch if client regenerated — prefer auth header request id for possession.
  }

  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc("host_lookup_sync_receipts" as never, {
    p_tenant_id: input.auth.tenantId,
    p_device_id: input.auth.deviceId,
    p_installation_id: input.auth.installationId,
    p_credential_version: input.auth.credentialVersion,
    p_source_stream_id: body.sourceStreamId,
    p_stream_generation: body.streamGeneration,
    p_group_ids: body.groupIds ?? null,
    p_from_sequence: body.fromSequence == null ? null : Number(body.fromSequence),
    p_to_sequence: body.toSequence == null ? null : Number(body.toSequence),
    p_limit: body.limit,
  } as never);

  if (error) {
    console.error("sync.receipts_rpc_failed", redactForLog({ message: error.message }));
    throw serviceUnavailableError("Unable to look up sync receipts.");
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const receipts = rows.map((row) => {
    const record = row as Record<string, unknown>;
    const eventIdsRaw = record.event_ids;
    const eventIds = Array.isArray(eventIdsRaw)
      ? eventIdsRaw.map(String)
      : typeof eventIdsRaw === "string"
        ? (JSON.parse(eventIdsRaw) as unknown[]).map(String)
        : [];
    const hashesRaw = record.event_payload_hashes;
    const eventPayloadHashes =
      hashesRaw && typeof hashesRaw === "object" && !Array.isArray(hashesRaw)
        ? Object.fromEntries(
            Object.entries(hashesRaw as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v),
            ]),
          )
        : {};
    return {
      transactionGroupId: String(record.transaction_group_id),
      minSequence: String(record.min_sequence),
      maxSequence: String(record.max_sequence),
      eventIds,
      eventPayloadHashes,
      appliedAt: toIso(record.applied_at),
    };
  });

  return syncCloudReceiptLookupResponseSchema.parse({
    sourceStreamId: body.sourceStreamId,
    streamGeneration: body.streamGeneration,
    observedAt: new Date().toISOString(),
    receipts,
    truncated: receipts.length >= body.limit,
  });
}

export async function getSyncFactSummary(input: {
  rawBodyText: string;
  auth: ReconcileAuthHeaders;
}): Promise<{
  salesCount: number;
  paymentsCount: number;
  ledgerEntriesCount: number;
  allocationCount: number;
  ledgerBalanceSumMinor: string;
  observedAt: string;
}> {
  await verifyHostReconcileRequest({
    rawBodyText: input.rawBodyText,
    auth: input.auth,
    possessionKind: "manifest",
  });
  let body: { sourceStreamId?: string; throughSequence?: string };
  try {
    body = JSON.parse(input.rawBodyText) as {
      sourceStreamId?: string;
      throughSequence?: string;
    };
  } catch {
    throw validationError("Request body must be JSON.");
  }
  if (!body.sourceStreamId || body.throughSequence == null) {
    throw validationError("sourceStreamId and throughSequence are required.");
  }

  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc("host_get_sync_fact_summary" as never, {
    p_tenant_id: input.auth.tenantId,
    p_device_id: input.auth.deviceId,
    p_installation_id: input.auth.installationId,
    p_credential_version: input.auth.credentialVersion,
    p_source_stream_id: body.sourceStreamId,
    p_through_sequence: Number(body.throughSequence),
  } as never);

  if (error) {
    console.error("sync.fact_summary_rpc_failed", redactForLog({ message: error.message }));
    throw serviceUnavailableError("Unable to load fact summary.");
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    salesCount: Number(row?.sales_count ?? 0),
    paymentsCount: Number(row?.payments_count ?? 0),
    ledgerEntriesCount: Number(row?.ledger_entries_count ?? 0),
    allocationCount: Number(row?.allocation_count ?? 0),
    ledgerBalanceSumMinor: String(row?.ledger_balance_sum_minor ?? "0"),
    observedAt: toIso(row?.observed_at),
  };
}

export { parseReconcileAuthHeaders };
