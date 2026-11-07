import { rotateDeviceCredentialRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { validationError, serviceUnavailableError, redactForLog } from "@/lib/auth/errors";
import { mapTenantRpcError, summarizeRpcErrorForLog } from "@/lib/tenant/rpc-errors";
import { verifyEd25519Possession } from "@/lib/device/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, rotateDeviceCredentialRequestSchema);
    if (
      !verifyEd25519Possession({
        publicKey: body.newPublicKey,
        message: body.possessionMessage,
        signature: body.possessionSignature,
      })
    ) {
      throw validationError("Device possession proof is invalid.");
    }

    const client = createPrivilegedSupabaseClient();
    const { data, error } = await client.rpc("rotate_device_credential", {
      p_tenant_id: body.tenantId,
      p_device_id: body.deviceId,
      p_installation_id: body.installationId,
      p_previous_public_key: body.previousPublicKey,
      p_previous_credential_version: body.previousCredentialVersion,
      p_new_public_key: body.newPublicKey,
      p_new_credential_version: body.newCredentialVersion,
      p_possession_message: body.possessionMessage,
      p_possession_signature: body.possessionSignature,
    });
    if (error) {
      console.error("device.rotate_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
      throw mapTenantRpcError(error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      throw serviceUnavailableError("Credential rotation did not return a result.");
    }
    const result = row as { credential_version: number; state_revision: number };
    return jsonOk({
      credentialVersion: Number(result.credential_version),
      stateRevision: Number(result.state_revision),
    });
  } catch (error) {
    return jsonError(error);
  }
}
