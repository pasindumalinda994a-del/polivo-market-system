import type {
  AuthorizeEnrollmentResponse,
  AuthorizeHostEnrollmentRequest,
  AuthorizeTerminalEnrollmentRequest,
  ConfirmEnrollmentRequest,
  ConfirmEnrollmentResponse,
  ListTenantDevicesResponse,
  RedeemEnrollmentRequest,
  RedeemEnrollmentResponse,
  RevokeTenantDeviceResponse,
  TenantDeviceSummary,
} from "@polivo/contracts";

import { redactForLog, serviceUnavailableError, validationError } from "@/lib/auth/errors";
import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";
import { createPrivilegedSupabaseClient } from "@/lib/auth/supabase-privileged";
import { mapTenantRpcError, summarizeRpcErrorForLog } from "@/lib/tenant/rpc-errors";

import {
  buildConfirmPossessionMessage,
  buildRedeemPossessionMessage,
  generateEnrollmentSecret,
  hashEnrollmentSecret,
  verifyEd25519Possession,
} from "./crypto";

function mapDeviceRow(row: {
  device_id: string;
  role: TenantDeviceSummary["role"];
  label: string | null;
  enrollment_state: TenantDeviceSummary["enrollmentState"];
  intended_host_device_id: string | null;
  deployment_environment: TenantDeviceSummary["deploymentEnvironment"];
  state_revision: number;
  created_at: string;
  updated_at: string;
  redeemed_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
}): TenantDeviceSummary {
  return {
    deviceId: row.device_id,
    role: row.role,
    label: row.label,
    enrollmentState: row.enrollment_state,
    intendedHostDeviceId: row.intended_host_device_id,
    deploymentEnvironment: row.deployment_environment,
    stateRevision: Number(row.state_revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    redeemedAt: row.redeemed_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
  };
}

export async function listTenantDevices(tenantId: string): Promise<ListTenantDevicesResponse> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("list_tenant_devices", { p_tenant_id: tenantId });
  if (error) {
    console.error("device.list_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
  const rows = Array.isArray(data) ? data : [];
  return { devices: rows.map((row) => mapDeviceRow(row as Parameters<typeof mapDeviceRow>[0])) };
}

export async function authorizeHostEnrollment(
  tenantId: string,
  input: AuthorizeHostEnrollmentRequest,
): Promise<AuthorizeEnrollmentResponse> {
  const enrollmentSecret = generateEnrollmentSecret();
  const secretDigest = hashEnrollmentSecret(enrollmentSecret);
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("authorize_host_enrollment", {
    p_tenant_id: tenantId,
    p_secret_digest: secretDigest,
    p_deployment_environment: input.deploymentEnvironment,
    p_label: input.label ?? null,
  });
  if (error) {
    console.error("device.host.authorize_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Host authorization did not return a result.");
  }
  const result = row as {
    grant_id: string;
    reserved_device_id: string;
    expires_at: string;
  };
  return {
    grantId: result.grant_id,
    reservedDeviceId: result.reserved_device_id,
    expiresAt: result.expires_at,
    enrollmentSecret,
  };
}

export async function authorizeTerminalEnrollment(
  tenantId: string,
  input: AuthorizeTerminalEnrollmentRequest,
): Promise<AuthorizeEnrollmentResponse> {
  const enrollmentSecret = generateEnrollmentSecret();
  const secretDigest = hashEnrollmentSecret(enrollmentSecret);
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("authorize_terminal_enrollment", {
    p_tenant_id: tenantId,
    p_host_device_id: input.hostDeviceId,
    p_secret_digest: secretDigest,
    p_deployment_environment: input.deploymentEnvironment,
    p_label: input.label ?? null,
  });
  if (error) {
    console.error(
      "device.terminal.authorize_rpc_failed",
      redactForLog(summarizeRpcErrorForLog(error)),
    );
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Terminal authorization did not return a result.");
  }
  const result = row as {
    grant_id: string;
    reserved_device_id: string;
    expires_at: string;
  };
  return {
    grantId: result.grant_id,
    reservedDeviceId: result.reserved_device_id,
    expiresAt: result.expires_at,
    enrollmentSecret,
  };
}

export async function cancelEnrollmentGrant(tenantId: string, grantId: string): Promise<void> {
  const client = createRequestUserSupabaseClient();
  const { error } = await client.rpc("cancel_device_enrollment_grant", {
    p_tenant_id: tenantId,
    p_grant_id: grantId,
  });
  if (error) {
    console.error("device.grant.cancel_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
}

export async function revokeTenantDevice(
  tenantId: string,
  deviceId: string,
): Promise<RevokeTenantDeviceResponse> {
  const client = createRequestUserSupabaseClient();
  const { data, error } = await client.rpc("revoke_tenant_device", {
    p_tenant_id: tenantId,
    p_device_id: deviceId,
  });
  if (error) {
    console.error("device.revoke_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Device revocation did not return a result.");
  }
  return { stateRevision: Number((row as { state_revision: number }).state_revision) };
}

export async function redeemEnrollmentGrant(
  input: RedeemEnrollmentRequest,
): Promise<RedeemEnrollmentResponse> {
  const expectedMessage = buildRedeemPossessionMessage({
    installationId: input.installationId,
    publicKey: input.publicKey,
    deploymentEnvironment: input.deploymentEnvironment,
    expectedRole: input.expectedRole,
  });
  if (input.possessionMessage !== expectedMessage) {
    throw validationError("Possession message does not match the expected enrollment proof.");
  }
  if (
    !verifyEd25519Possession({
      publicKey: input.publicKey,
      message: input.possessionMessage,
      signature: input.possessionSignature,
    })
  ) {
    throw validationError("Device possession proof is invalid.");
  }

  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc("redeem_device_enrollment_grant", {
    p_secret_digest: hashEnrollmentSecret(input.enrollmentSecret),
    p_installation_id: input.installationId,
    p_public_key: input.publicKey,
    p_deployment_environment: input.deploymentEnvironment,
    p_expected_role: input.expectedRole,
    p_possession_message: input.possessionMessage,
    p_possession_signature: input.possessionSignature,
  });
  if (error) {
    console.error("device.redeem_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Enrollment redeem did not return a result.");
  }
  const result = row as {
    tenant_id: string;
    device_id: string;
    role: RedeemEnrollmentResponse["role"];
    intended_host_device_id: string | null;
    label: string | null;
    credential_version: number;
    state_revision: number;
    enrollment_state: RedeemEnrollmentResponse["enrollmentState"];
    stall_display_name: string;
  };
  return {
    tenantId: result.tenant_id,
    deviceId: result.device_id,
    role: result.role,
    intendedHostDeviceId: result.intended_host_device_id,
    label: result.label,
    credentialVersion: Number(result.credential_version),
    stateRevision: Number(result.state_revision),
    enrollmentState: result.enrollment_state,
    stallDisplayName: result.stall_display_name,
  };
}

export async function confirmDeviceEnrollment(
  input: ConfirmEnrollmentRequest,
): Promise<ConfirmEnrollmentResponse> {
  const expectedMessage = buildConfirmPossessionMessage({
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    installationId: input.installationId,
    publicKey: input.publicKey,
    credentialVersion: input.credentialVersion,
  });
  if (input.possessionMessage !== expectedMessage) {
    throw validationError("Possession message does not match the expected confirmation proof.");
  }
  if (
    !verifyEd25519Possession({
      publicKey: input.publicKey,
      message: input.possessionMessage,
      signature: input.possessionSignature,
    })
  ) {
    throw validationError("Device possession proof is invalid.");
  }

  const client = createPrivilegedSupabaseClient();
  const { data, error } = await client.rpc("confirm_device_enrollment", {
    p_tenant_id: input.tenantId,
    p_device_id: input.deviceId,
    p_installation_id: input.installationId,
    p_public_key: input.publicKey,
    p_credential_version: input.credentialVersion,
    p_possession_message: input.possessionMessage,
    p_possession_signature: input.possessionSignature,
  });
  if (error) {
    console.error("device.confirm_rpc_failed", redactForLog(summarizeRpcErrorForLog(error)));
    throw mapTenantRpcError(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw serviceUnavailableError("Enrollment confirm did not return a result.");
  }
  const result = row as {
    enrollment_state: ConfirmEnrollmentResponse["enrollmentState"];
    state_revision: number;
  };
  return {
    enrollmentState: result.enrollment_state,
    stateRevision: Number(result.state_revision),
  };
}
