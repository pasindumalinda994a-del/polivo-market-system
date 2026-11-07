import { createHash, randomBytes } from "node:crypto";

import { redactForLog, serviceUnavailableError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { mapTenantRpcError, summarizeRpcErrorForLog } from "@/lib/tenant/rpc-errors";

function generateSetupSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashSetupSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export type AuthorizeLocalStaffSetupGrantResult = {
  grantId: string;
  setupGrantSecret: string;
  expiresAt: string;
};

export async function authorizeLocalStaffSetupGrant(
  tenantId: string,
): Promise<AuthorizeLocalStaffSetupGrantResult> {
  const setupGrantSecret = generateSetupSecret();
  const secretDigest = hashSetupSecret(setupGrantSecret);
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc(
    "authorize_local_staff_setup_grant" as never,
    {
      p_tenant_id: tenantId,
      p_secret_digest: secretDigest,
      p_ttl_seconds: 900,
    } as never,
  );
  if (error) {
    console.error(
      "local_staff.setup_grant_authorize_failed",
      redactForLog(summarizeRpcErrorForLog(error)),
    );
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Setup grant authorization returned no row.");
  }
  const record = row as unknown as { grant_id: string; expires_at: string };
  return {
    grantId: record.grant_id,
    setupGrantSecret,
    expiresAt: record.expires_at,
  };
}

export type RedeemLocalStaffSetupGrantResult = {
  grantId: string;
  tenantId: string;
  cloudMembershipId: string;
  ownerDisplayName: string;
  capabilities: string[];
  sourceRevision: number;
};

export async function redeemLocalStaffSetupGrant(input: {
  setupGrantSecret: string;
  tenantId: string;
}): Promise<RedeemLocalStaffSetupGrantResult> {
  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc(
    "redeem_local_staff_setup_grant" as never,
    {
      p_secret_digest: hashSetupSecret(input.setupGrantSecret),
      p_tenant_id: input.tenantId,
    } as never,
  );
  if (error) {
    console.error(
      "local_staff.setup_grant_redeem_failed",
      redactForLog(summarizeRpcErrorForLog(error)),
    );
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Setup grant redeem returned no row.");
  }
  const record = row as unknown as {
    grant_id: string;
    tenant_id: string;
    cloud_membership_id: string;
    owner_display_name: string;
    capabilities: unknown;
    source_revision: number | string;
  };
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((v): v is string => typeof v === "string")
    : [];
  return {
    grantId: record.grant_id,
    tenantId: record.tenant_id,
    cloudMembershipId: record.cloud_membership_id,
    ownerDisplayName: record.owner_display_name,
    capabilities,
    sourceRevision: Number(record.source_revision),
  };
}
