/**
 * Canonical ingest possession message (UTF-8). Host signs this exact payload.
 * Shared by cloud verifier and local upload worker — do not diverge.
 */
export function buildIngestPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
  batchId: string;
  bodySha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-ingest-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    String(input.credentialVersion),
    input.batchId,
    input.bodySha256,
    input.signedAt,
  ].join("\n");
}
