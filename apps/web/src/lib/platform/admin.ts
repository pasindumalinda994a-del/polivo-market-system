import type {
  AdminAuditEvent,
  PlatformDirectoryQuery,
  PlatformStallDirectoryResponse,
  StallAdminProfile,
  UpdateStallProfileRequest,
  UpdateStallProfileResponse,
} from "@polivo/contracts";

import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";
import { mapTenantRpcError } from "@/lib/tenant/rpc-errors";

export async function resolvePlatformAdminAccess(): Promise<boolean> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("get_platform_admin_status" as never, {} as never);
  if (error) {
    throw mapTenantRpcError(error);
  }
  const rows = (data ?? []) as { is_platform_admin: boolean }[];
  return Boolean(rows[0]?.is_platform_admin);
}

export async function listPlatformStallDirectory(
  query: PlatformDirectoryQuery,
): Promise<PlatformStallDirectoryResponse> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("list_platform_stall_directory" as never, {
    p_limit: query.limit,
    p_offset: query.offset,
    p_search: query.search ?? null,
    p_status: query.status ?? null,
    p_tenant_id: null,
  } as never);
  if (error) {
    throw mapTenantRpcError(error);
  }

  const rows = (data ?? []) as Array<{
    tenant_id: string;
    display_name: string;
    market_location: string | null;
    contact: string | null;
    timezone: string;
    status: "active" | "inactive" | "suspended";
    owner_subject: string | null;
    enrollment_status: string;
    last_host_contact_at: string | null;
    last_upload_applied_at: string | null;
    config_published_revision: number | null;
    config_acknowledged_revision: number | null;
    config_delivery_status: string;
    blocker_no_enrolled_host: boolean;
    blocker_host_contact_stale: boolean;
    blocker_upload_blocked: boolean;
    blocker_config_pending: boolean;
    blocker_reconciliation_issue: boolean;
    total_count: number;
  }>;

  return {
    stalls: rows.map((row) => ({
      tenantId: row.tenant_id,
      displayName: row.display_name,
      marketLocation: row.market_location,
      contact: row.contact,
      timezone: row.timezone,
      status: row.status,
      ownerSubject: row.owner_subject,
      enrollmentStatus: row.enrollment_status,
      lastHostContactAt: row.last_host_contact_at,
      lastUploadAppliedAt: row.last_upload_applied_at,
      configPublishedRevision: row.config_published_revision,
      configAcknowledgedRevision: row.config_acknowledged_revision,
      configDeliveryStatus: row.config_delivery_status,
      blockerNoEnrolledHost: row.blocker_no_enrolled_host,
      blockerHostContactStale: row.blocker_host_contact_stale,
      blockerUploadBlocked: row.blocker_upload_blocked,
      blockerConfigPending: row.blocker_config_pending,
      blockerReconciliationIssue: row.blocker_reconciliation_issue,
    })),
    totalCount: rows[0]?.total_count ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

export type PlatformStallDetail = StallAdminProfile & {
  ownerSubject: string | null;
  enrollmentStatus: string;
  lastHostContactAt: string | null;
  lastUploadAppliedAt: string | null;
  configPublishedRevision: number | null;
  configAcknowledgedRevision: number | null;
  configDeliveryStatus: string;
  blockerNoEnrolledHost: boolean;
  blockerHostContactStale: boolean;
  blockerUploadBlocked: boolean;
  blockerConfigPending: boolean;
  blockerReconciliationIssue: boolean;
};

export async function getPlatformStallDetail(tenantId: string): Promise<PlatformStallDetail> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("get_platform_stall_detail" as never, {
    p_tenant_id: tenantId,
  } as never);
  if (error) {
    throw mapTenantRpcError(error);
  }
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  if (!row) {
    throw mapTenantRpcError({ message: "NOT_FOUND" });
  }
  return {
    tenantId: String(row.tenant_id),
    status: row.status as StallAdminProfile["status"],
    displayName: String(row.display_name),
    marketLocation: (row.market_location as string | null) ?? null,
    contact: (row.contact as string | null) ?? null,
    timezone: String(row.timezone),
    profileRevision: Number(row.profile_revision),
    adminNotes: String(row.admin_notes ?? ""),
    updatedAt: String(row.updated_at),
    ownerSubject: (row.owner_subject as string | null) ?? null,
    enrollmentStatus: String(row.enrollment_status),
    lastHostContactAt: (row.last_host_contact_at as string | null) ?? null,
    lastUploadAppliedAt: (row.last_upload_applied_at as string | null) ?? null,
    configPublishedRevision:
      row.config_published_revision === null || row.config_published_revision === undefined
        ? null
        : Number(row.config_published_revision),
    configAcknowledgedRevision:
      row.config_acknowledged_revision === null || row.config_acknowledged_revision === undefined
        ? null
        : Number(row.config_acknowledged_revision),
    configDeliveryStatus: String(row.config_delivery_status),
    blockerNoEnrolledHost: Boolean(row.blocker_no_enrolled_host),
    blockerHostContactStale: Boolean(row.blocker_host_contact_stale),
    blockerUploadBlocked: Boolean(row.blocker_upload_blocked),
    blockerConfigPending: Boolean(row.blocker_config_pending),
    blockerReconciliationIssue: Boolean(row.blocker_reconciliation_issue),
  };
}

export async function listAdminAuditEvents(options: {
  tenantId?: string;
  limit?: number;
}): Promise<AdminAuditEvent[]> {
  const client = createRequestUserSupabaseClient();
  let query = client
    .from("admin_audit_events")
    .select(
      "id, tenant_id, actor_subject, action, target_type, target_id, before_json, after_json, configuration_revision, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  const { data, error } = await query;
  if (error) {
    throw mapTenantRpcError(error);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    actorSubject: String(row.actor_subject),
    action: String(row.action),
    targetType: (row.target_type as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    beforeJson: (row.before_json as Record<string, unknown> | null) ?? null,
    afterJson: (row.after_json as Record<string, unknown> | null) ?? null,
    configurationRevision:
      row.configuration_revision === null || row.configuration_revision === undefined
        ? null
        : Number(row.configuration_revision),
    createdAt: String(row.created_at),
  }));
}
