import type {
  ConfigDeliveryStatus,
  UpdatePermissionProfileRequest,
  UpdatePermissionProfileResponse,
} from "@polivo/contracts";
import { normalizeCapabilitySet } from "@polivo/domain";

import { serviceUnavailableError, validationError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

import { mapTenantRpcError } from "./rpc-errors";

export type PermissionProfileSummary = {
  profileRole: "billing_staff" | "cashier";
  capabilities: string[];
  revision: number;
  updatedAt: string;
  updatedBySubject: string;
};

export async function listPermissionProfiles(
  tenantId: string,
): Promise<PermissionProfileSummary[]> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client
    .from("tenant_permission_profiles")
    .select("profile_role, capabilities, revision, updated_at, updated_by_subject")
    .eq("tenant_id", tenantId)
    .order("profile_role", { ascending: true });

  if (error) {
    throw mapTenantRpcError(error);
  }

  return (data ?? []).map((row) => ({
    profileRole: row.profile_role as "billing_staff" | "cashier",
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [],
    revision: Number(row.revision),
    updatedAt: row.updated_at as string,
    updatedBySubject: row.updated_by_subject as string,
  }));
}

export async function getStallSyncCloudVisibility(tenantId: string): Promise<{
  lastHostContactAt: string | null;
  lastAppliedUploadGroupId: string | null;
  lastAppliedUploadAt: string | null;
  committedCloudCursor: { value: string | null; observedAt: string | null } | null;
  pendingPublishedConfigRevision: number | null;
  lastConfigApplicationAckAt: string | null;
  note: string;
}> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("get_stall_sync_cloud_visibility" as never, {
    p_tenant_id: tenantId,
  } as never);

  if (error) {
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      lastHostContactAt: null,
      lastAppliedUploadGroupId: null,
      lastAppliedUploadAt: null,
      committedCloudCursor: null,
      pendingPublishedConfigRevision: null,
      lastConfigApplicationAckAt: null,
      note: "Cloud cannot independently know the latest offline local tail. Values below are cloud-observable only.",
    };
  }
  const record = row as Record<string, unknown>;
  return {
    lastHostContactAt:
      record.last_host_contact_at == null ? null : String(record.last_host_contact_at),
    lastAppliedUploadGroupId:
      record.last_applied_upload_group_id == null
        ? null
        : String(record.last_applied_upload_group_id),
    lastAppliedUploadAt:
      record.last_applied_upload_at == null ? null : String(record.last_applied_upload_at),
    committedCloudCursor: {
      value:
        record.committed_cloud_cursor == null ? null : String(record.committed_cloud_cursor),
      observedAt:
        record.committed_cloud_cursor_observed_at == null
          ? null
          : String(record.committed_cloud_cursor_observed_at),
    },
    pendingPublishedConfigRevision:
      record.pending_published_config_revision == null
        ? null
        : Number(record.pending_published_config_revision),
    lastConfigApplicationAckAt:
      record.last_config_application_ack_at == null
        ? null
        : String(record.last_config_application_ack_at),
    note: "Cloud-observable sync facts only. Host-reported local tails require host contact; do not treat cloud cursor alone as proof of local payloads.",
  };
}

export async function getAccessConfigDeliveryStatus(
  tenantId: string,
): Promise<ConfigDeliveryStatus> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("get_access_config_delivery_status" as never, {
    p_tenant_id: tenantId,
  } as never);

  if (error) {
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      domain: "access",
      publishedRevision: null,
      lastAcknowledgedRevision: null,
      localApplicationStatus: "pending_delivery",
      lastAcknowledgementAt: null,
      lastHostDeviceId: null,
      failureCode: null,
      failureMessage: null,
    };
  }

  const record = row as Record<string, unknown>;
  return {
    domain: "access",
    publishedRevision:
      record.published_revision == null ? null : Number(record.published_revision),
    lastAcknowledgedRevision:
      record.last_acknowledged_revision == null
        ? null
        : Number(record.last_acknowledged_revision),
    localApplicationStatus: (record.local_application_status as ConfigDeliveryStatus["localApplicationStatus"]) ??
      "pending_delivery",
    lastAcknowledgementAt:
      record.last_acknowledgement_at == null
        ? null
        : String(record.last_acknowledgement_at),
    lastHostDeviceId:
      record.last_host_device_id == null ? null : String(record.last_host_device_id),
    failureCode: record.failure_code == null ? null : String(record.failure_code),
    failureMessage: record.failure_message == null ? null : String(record.failure_message),
  };
}

export async function updatePermissionProfile(
  tenantId: string,
  profileRole: "billing_staff" | "cashier",
  input: UpdatePermissionProfileRequest,
): Promise<UpdatePermissionProfileResponse> {
  if (input.permissionsReviewed !== true) {
    throw validationError("Review the selected permissions before saving.");
  }

  const normalized = normalizeCapabilitySet(input.capabilities);
  if (!normalized) {
    throw validationError("One or more permissions are not recognized.");
  }

  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("update_permission_profile", {
    p_tenant_id: tenantId,
    p_profile_role: profileRole,
    p_capabilities: normalized,
    p_expected_revision: input.expectedRevision,
  });

  if (error) {
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Permission update did not return a result.");
  }

  const record = row as { revision: number; published_revision?: number };
  let delivery: ConfigDeliveryStatus | null = null;
  try {
    delivery = await getAccessConfigDeliveryStatus(tenantId);
  } catch {
    delivery = null;
  }

  return {
    revision: Number(record.revision),
    cloudSaveStatus: "saved_to_cloud",
    localApplicationStatus: delivery?.localApplicationStatus ?? "pending_delivery",
    publishedRevision:
      record.published_revision != null
        ? Number(record.published_revision)
        : (delivery?.publishedRevision ?? undefined),
    lastAcknowledgedRevision: delivery?.lastAcknowledgedRevision ?? null,
  };
}
