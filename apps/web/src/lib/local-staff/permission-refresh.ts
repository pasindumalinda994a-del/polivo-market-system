import { createHash, randomBytes } from "node:crypto";

import { redactForLog, serviceUnavailableError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { mapTenantRpcError, summarizeRpcErrorForLog } from "@/lib/tenant/rpc-errors";

function generateRefreshSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashRefreshSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export type AuthorizeLocalStaffPermissionRefreshResult = {
  grantId: string;
  refreshGrantSecret: string;
  expiresAt: string;
};

export async function authorizeLocalStaffPermissionRefresh(input: {
  tenantId: string;
  membershipId: string;
}): Promise<AuthorizeLocalStaffPermissionRefreshResult> {
  const refreshGrantSecret = generateRefreshSecret();
  const secretDigest = hashRefreshSecret(refreshGrantSecret);
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc(
    "authorize_local_staff_permission_refresh" as never,
    {
      p_tenant_id: input.tenantId,
      p_target_membership_id: input.membershipId,
      p_secret_digest: secretDigest,
      p_ttl_seconds: 900,
    } as never,
  );
  if (error) {
    console.error(
      "local_staff.permission_refresh_authorize_failed",
      redactForLog(summarizeRpcErrorForLog(error)),
    );
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Permission refresh authorization returned no row.");
  }
  const record = row as unknown as { grant_id: string; expires_at: string };
  return {
    grantId: record.grant_id,
    refreshGrantSecret,
    expiresAt: record.expires_at,
  };
}

export type RedeemLocalStaffPermissionRefreshResult = {
  grantId: string;
  tenantId: string;
  cloudMembershipId: string;
  capabilities: string[];
  sourceRevision: number;
};

export async function redeemLocalStaffPermissionRefresh(input: {
  refreshGrantSecret: string;
  tenantId: string;
  expectedMembershipId?: string;
}): Promise<RedeemLocalStaffPermissionRefreshResult> {
  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc(
    "redeem_local_staff_permission_refresh" as never,
    {
      p_secret_digest: hashRefreshSecret(input.refreshGrantSecret),
      p_tenant_id: input.tenantId,
      p_expected_membership_id: input.expectedMembershipId ?? null,
    } as never,
  );
  if (error) {
    console.error(
      "local_staff.permission_refresh_redeem_failed",
      redactForLog(summarizeRpcErrorForLog(error)),
    );
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Permission refresh redeem returned no row.");
  }
  const record = row as unknown as {
    grant_id: string;
    tenant_id: string;
    cloud_membership_id: string;
    capabilities: unknown;
    source_revision: number | string;
  };
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((v): v is string => typeof v === "string")
    : [];
  const sourceRevision = Number(record.source_revision);
  if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
    throw serviceUnavailableError("Permission refresh redeem returned an invalid revision.");
  }
  return {
    grantId: record.grant_id,
    tenantId: record.tenant_id,
    cloudMembershipId: record.cloud_membership_id,
    capabilities,
    sourceRevision,
  };
}
