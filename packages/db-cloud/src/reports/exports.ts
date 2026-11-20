import { CloudReportError } from "./errors.js";
import type { UserReportingClient } from "./rpc.js";
import { mapReportExportJobRow } from "./mappers.js";
import type { InsertReportExportJobInput, ReportExportJobRecord } from "./types.js";

export async function insertReportExportJob(
  client: UserReportingClient,
  input: InsertReportExportJobInput,
): Promise<ReportExportJobRecord> {
  const normalizedFiltersJson =
    typeof input.normalizedFiltersJson === "string"
      ? input.normalizedFiltersJson
      : JSON.stringify(input.normalizedFiltersJson);

  const { error } = await client.from("report_export_jobs").insert({
    tenant_id: input.tenantId,
    id: input.id,
    stall_id: input.stallId,
    report_type: input.reportType,
    format: input.format,
    status: input.status,
    definition_version: input.definitionVersion,
    snapshot_token: input.snapshotToken,
    filter_fingerprint: input.filterFingerprint,
    normalized_filters_json: JSON.parse(normalizedFiltersJson) as Record<string, unknown>,
    row_count: input.rowCount,
    content_sha256: input.contentSha256,
    content_bytes: input.contentBytes,
    content_type: input.contentType,
    byte_length: input.byteLength,
    default_file_name: input.defaultFileName,
    failure_code: input.failureCode,
    failure_message: input.failureMessage,
    created_by_subject: input.createdBySubject,
    create_operation_id: input.createOperationId,
    created_at: input.createdAt,
    expires_at: input.expiresAt,
    ready_at: input.readyAt,
  });

  if (error !== null) {
    throw new CloudReportError(`insertReportExportJob: ${error.message}`);
  }

  const loaded = await getReportExportJobById(client, input.tenantId, input.stallId, input.id);
  if (loaded === null) {
    throw new CloudReportError("Failed to load report export job after insert.");
  }
  return loaded;
}

export async function getReportExportJobById(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  jobId: string,
): Promise<ReportExportJobRecord | null> {
  const { data, error } = await client
    .from("report_export_jobs")
    .select(
      "id, stall_id, report_type, format, status, definition_version, snapshot_token, filter_fingerprint, normalized_filters_json, row_count, content_sha256, content_type, byte_length, default_file_name, failure_code, failure_message, created_by_subject, create_operation_id, created_at, expires_at, ready_at",
    )
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", jobId)
    .maybeSingle();

  if (error !== null) {
    throw new CloudReportError(`getReportExportJobById: ${error.message}`);
  }
  return data === null ? null : mapReportExportJobRow(data as Record<string, unknown>);
}

export async function getReportExportJobByCreateOperationId(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  createOperationId: string,
): Promise<ReportExportJobRecord | null> {
  const { data, error } = await client
    .from("report_export_jobs")
    .select(
      "id, stall_id, report_type, format, status, definition_version, snapshot_token, filter_fingerprint, normalized_filters_json, row_count, content_sha256, content_type, byte_length, default_file_name, failure_code, failure_message, created_by_subject, create_operation_id, created_at, expires_at, ready_at",
    )
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("create_operation_id", createOperationId)
    .maybeSingle();

  if (error !== null) {
    throw new CloudReportError(`getReportExportJobByCreateOperationId: ${error.message}`);
  }
  return data === null ? null : mapReportExportJobRow(data as Record<string, unknown>);
}

export async function getReportExportJobContent(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  jobId: string,
): Promise<Uint8Array | null> {
  const { data, error } = await client
    .from("report_export_jobs")
    .select("content_bytes")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", jobId)
    .maybeSingle();

  if (error !== null) {
    throw new CloudReportError(`getReportExportJobContent: ${error.message}`);
  }
  if (data === null || data.content_bytes === null || data.content_bytes === undefined) {
    return null;
  }
  if (data.content_bytes instanceof Uint8Array) {
    return data.content_bytes;
  }
  if (typeof data.content_bytes === "string") {
    return Uint8Array.from(Buffer.from(data.content_bytes, "base64"));
  }
  return null;
}

export async function markReportExportJobExpired(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  jobId: string,
): Promise<void> {
  const { error } = await client
    .from("report_export_jobs")
    .update({ status: "expired", content_bytes: null })
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", jobId)
    .eq("status", "ready");

  if (error !== null) {
    throw new CloudReportError(`markReportExportJobExpired: ${error.message}`);
  }
}
