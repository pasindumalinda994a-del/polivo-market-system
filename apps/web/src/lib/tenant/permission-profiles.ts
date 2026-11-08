import type {
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

  return {
    revision: Number((row as { revision: number }).revision),
    cloudSaveStatus: "saved_to_cloud",
    localApplicationStatus: "unavailable",
  };
}
