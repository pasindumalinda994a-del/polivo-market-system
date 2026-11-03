import { BILLING_STAFF_DEFAULT_CAPABILITIES, CASHIER_DEFAULT_CAPABILITIES } from "@polivo/domain";
import type { CreateStallRequest, CreateStallResponse } from "@polivo/contracts";

import { redactForLog, serviceUnavailableError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

import { mapTenantRpcError, summarizeRpcErrorForLog } from "./rpc-errors";
import { hashOnboardingPayload } from "./tokens";

export async function createStallForCurrentUser(
  input: CreateStallRequest,
): Promise<CreateStallResponse> {
  const client = createRequestUserSupabaseClient();
  const payloadHash = hashOnboardingPayload(input);

  const { data, error } = await client.rpc("create_stall_with_owner", {
    p_idempotency_key: input.idempotencyKey,
    p_request_payload_hash: payloadHash,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_market_location: input.marketLocation ?? null,
    p_contact: input.contact ?? null,
    p_billing_staff_capabilities: [...BILLING_STAFF_DEFAULT_CAPABILITIES],
    p_cashier_capabilities: [...CASHIER_DEFAULT_CAPABILITIES],
  });

  if (error) {
    console.error("tenant.onboarding.rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Stall creation did not return a result.");
  }

  const result = row as { tenant_id: string; membership_id: string; replayed: boolean };
  return {
    tenantId: result.tenant_id,
    membershipId: result.membership_id,
    replayed: Boolean(result.replayed),
  };
}
