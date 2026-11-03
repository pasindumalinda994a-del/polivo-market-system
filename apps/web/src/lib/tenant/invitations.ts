import type {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
} from "@polivo/contracts";
import { normalizeCapabilitySet } from "@polivo/domain";
import { auth, currentUser } from "@clerk/nextjs/server";

import { redactForLog, serviceUnavailableError, validationError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

import { mapTenantRpcError, summarizeRpcErrorForLog } from "./rpc-errors";
import {
  type ClerkPrimaryEmailStatus,
  requireVerifiedEmailSessionClaims,
} from "./session-email-claims";
import { generateInvitationToken, hashInvitationToken } from "./tokens";

function primaryEmailStatusFromClerkUser(
  user: Awaited<ReturnType<typeof currentUser>>,
): ClerkPrimaryEmailStatus {
  const primary = user?.primaryEmailAddress;
  if (!primary) {
    return "unknown";
  }
  return primary.verification?.status === "verified" ? "verified" : "unverified";
}

export async function createTenantInvitation(
  tenantId: string,
  input: CreateInvitationRequest,
): Promise<CreateInvitationResponse> {
  const normalized = normalizeCapabilitySet(input.capabilities);
  if (!normalized) {
    throw validationError("One or more permissions are not recognized.");
  }

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const client = createRequestUserSupabaseClient();

  const { data, error } = await client.rpc("create_tenant_invitation", {
    p_tenant_id: tenantId,
    p_email: input.email,
    p_access_role: input.accessRole,
    p_capabilities: normalized,
    p_token_hash: tokenHash,
  });

  if (error) {
    console.error("tenant.invitation.create_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Invitation creation did not return a result.");
  }

  const result = row as { invitation_id: string; expires_at: string };
  return {
    invitationId: result.invitation_id,
    expiresAt: result.expires_at,
    token: rawToken,
    acceptPath: `/invitations/${encodeURIComponent(rawToken)}`,
  };
}

export async function revokeTenantInvitation(
  tenantId: string,
  invitationId: string,
): Promise<void> {
  const client = createRequestUserSupabaseClient();
  const { error } = await client.rpc("revoke_tenant_invitation", {
    p_tenant_id: tenantId,
    p_invitation_id: invitationId,
  });
  if (error) {
    console.error("tenant.invitation.revoke_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
}

export async function acceptTenantInvitation(
  input: AcceptInvitationRequest,
): Promise<AcceptInvitationResponse> {
  const [session, user] = await Promise.all([auth(), currentUser()]);
  requireVerifiedEmailSessionClaims(
    session.sessionClaims as Record<string, unknown> | null | undefined,
    { clerkPrimaryEmailStatus: primaryEmailStatusFromClerkUser(user) },
  );

  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("accept_tenant_invitation", {
    p_token_hash: hashInvitationToken(input.token),
  });

  if (error) {
    console.error("tenant.invitation.accept_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Invitation acceptance did not return a result.");
  }

  const result = row as { tenant_id: string; membership_id: string; access_role: string };
  if (result.access_role !== "billing_staff" && result.access_role !== "cashier") {
    throw serviceUnavailableError("Invitation acceptance returned an unexpected role.");
  }

  return {
    tenantId: result.tenant_id,
    membershipId: result.membership_id,
    accessRole: result.access_role,
  };
}

export type InvitationSummary = {
  invitationId: string;
  emailNormalized: string;
  accessRole: "billing_staff" | "cashier";
  status: string;
  expiresAt: string;
  createdAt: string;
};

export async function listPendingInvitations(tenantId: string): Promise<InvitationSummary[]> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client
    .from("tenant_invitations")
    .select("id, email_normalized, access_role, status, expires_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw mapTenantRpcError(error);
  }

  return (data ?? []).map((row) => ({
    invitationId: row.id as string,
    emailNormalized: row.email_normalized as string,
    accessRole: row.access_role as "billing_staff" | "cashier",
    status: row.status as string,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  }));
}
