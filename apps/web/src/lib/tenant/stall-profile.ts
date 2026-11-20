import type {
  StallAdminProfile,
  UpdateStallProfileRequest,
  UpdateStallProfileResponse,
} from "@polivo/contracts";

import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

import { mapTenantRpcError } from "./rpc-errors";

export async function getStallAdminProfile(tenantId: string): Promise<StallAdminProfile> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("get_stall_admin_profile" as never, {
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
  };
}

export async function updateStallAdminProfile(
  tenantId: string,
  input: UpdateStallProfileRequest,
): Promise<UpdateStallProfileResponse> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("update_stall_profile" as never, {
    p_tenant_id: tenantId,
    p_expected_revision: input.expectedRevision,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_market_location: input.marketLocation ?? null,
    p_contact: input.contact ?? null,
    p_admin_notes: input.adminNotes ?? "",
  } as never);
  if (error) {
    throw mapTenantRpcError(error);
  }
  const row = ((data ?? []) as Array<{ profile_revision: number }>)[0];
  if (!row) {
    throw mapTenantRpcError({ message: "NOT_FOUND" });
  }
  return {
    profileRevision: Number(row.profile_revision),
    cloudSaveStatus: "saved_to_cloud",
  };
}
