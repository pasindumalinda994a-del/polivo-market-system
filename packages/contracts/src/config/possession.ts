/**
 * Canonical config pull possession message (UTF-8). Host signs this exact payload.
 * Shared by cloud verifier and local config worker — do not diverge.
 */
export function buildConfigPullPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-config-pull-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.requestId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}

/**
 * Canonical config acknowledgement possession message (UTF-8).
 */
export function buildConfigAckPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  requestId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-config-ack-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.requestId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}
