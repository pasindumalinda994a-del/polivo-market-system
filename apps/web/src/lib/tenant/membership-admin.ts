import type { UpdateMembershipRequest } from "@polivo/contracts";
import { normalizeCapabilitySet } from "@polivo/domain";

import { validationError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

import { mapTenantRpcError } from "./rpc-errors";

export type TenantMemberSummary = {
  membershipId: string;
  externalSubject: string;
  status: "active" | "inactive" | "suspended";
  accessRole: "owner" | "billing_staff" | "cashier";
  capabilities: string[];
  updatedAt: string;
};

export async function listTenantMembers(tenantId: string): Promise<TenantMemberSummary[]> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client
    .from("tenant_memberships")
    .select("id, external_subject, status, access_role, capabilities, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    throw mapTenantRpcError(error);
  }

  return (data ?? []).map((row) => ({
    membershipId: row.id as string,
    externalSubject: row.external_subject as string,
    status: row.status as TenantMemberSummary["status"],
    accessRole: row.access_role as TenantMemberSummary["accessRole"],
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [],
    updatedAt: row.updated_at as string,
  }));
}

export async function updateTenantMembership(
  tenantId: string,
  membershipId: string,
  input: UpdateMembershipRequest,
): Promise<void> {
  let capabilities: string[] | null = null;
  if (input.capabilities !== undefined) {
    const normalized = normalizeCapabilitySet(input.capabilities);
    if (!normalized) {
      throw validationError("One or more permissions are not recognized.");
    }
    capabilities = normalized;
  }

  const client = createRequestUserSupabaseClient();
  const { error } = await client.rpc("update_membership_access", {
    p_tenant_id: tenantId,
    p_membership_id: membershipId,
    p_status: input.status ?? null,
    p_access_role: input.accessRole ?? null,
    p_capabilities: capabilities,
  });

  if (error) {
    throw mapTenantRpcError(error);
  }
}
