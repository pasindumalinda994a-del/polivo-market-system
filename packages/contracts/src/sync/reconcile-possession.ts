/**
 * Canonical possession messages for Phase 34 host-authenticated sync read APIs.
 * Shared by cloud verifier and stall-service client — do not diverge.
 */

export function buildSyncProgressPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-sync-progress-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.requestId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}

export function buildSyncReceiptLookupPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-sync-receipts-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.requestId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}

export function buildSyncManifestSummaryPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-sync-manifest-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.requestId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}
