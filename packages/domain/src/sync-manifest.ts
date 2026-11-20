/**
 * Deterministic JSON canonicalization for sync manifests (Phase 34).
 * Rules: sorted object keys; arrays preserve order; numbers as JSON numbers;
 * timestamps as ISO-8601 strings; null preserved; undefined omitted.
 */
export function canonicalizeForSyncManifest(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      out[k] = sortKeys(v);
    }
    return out;
  }
  throw new Error("Unsupported value for sync manifest canonicalization.");
}

export const DOMAIN_SYNC_MANIFEST_VERSION = "sync-manifest-v1" as const;

export type SyncManifestChunk = {
  chunkIndex: number;
  recordCount: number;
  contentHash: string;
};

export type SyncManifestSummary = {
  manifestVersion: typeof DOMAIN_SYNC_MANIFEST_VERSION;
  domain: string;
  recordCount: number;
  rootHash: string;
  chunks: SyncManifestChunk[];
};

/** Build a chunked manifest from already-hashed ordered record digests. */
export function buildChunkedManifest(input: {
  domain: string;
  recordDigests: string[];
  chunkSize?: number;
  hashHex: (utf8: string) => string;
}): SyncManifestSummary {
  const chunkSize = input.chunkSize ?? 50;
  const chunks: SyncManifestChunk[] = [];
  for (let i = 0; i < input.recordDigests.length; i += chunkSize) {
    const slice = input.recordDigests.slice(i, i + chunkSize);
    const chunkMaterial = canonicalizeForSyncManifest({
      manifestVersion: DOMAIN_SYNC_MANIFEST_VERSION,
      digests: slice,
    });
    chunks.push({
      chunkIndex: chunks.length,
      recordCount: slice.length,
      contentHash: input.hashHex(chunkMaterial),
    });
  }
  const rootMaterial = canonicalizeForSyncManifest({
    manifestVersion: DOMAIN_SYNC_MANIFEST_VERSION,
    domain: input.domain,
    recordCount: input.recordDigests.length,
    chunks: chunks.map((c) => ({ i: c.chunkIndex, n: c.recordCount, h: c.contentHash })),
  });
  return {
    manifestVersion: DOMAIN_SYNC_MANIFEST_VERSION,
    domain: input.domain,
    recordCount: input.recordDigests.length,
    rootHash: input.hashHex(rootMaterial),
    chunks,
  };
}

export type DeliveryMismatchCategory =
  | "expected_upload_backlog"
  | "missing_cloud_receipt"
  | "missing_local_acknowledgement"
  | "different_immutable_payload"
  | "stream_generation_conflict"
  | "remote_state_unavailable";

export function classifyDeliveryObservation(input: {
  localAcked: boolean;
  cloudReceiptPresent: boolean;
  localPendingUpload: boolean;
  payloadHashMatches: boolean | null;
  streamGenerationMismatch: boolean;
  remoteUnavailable: boolean;
}): DeliveryMismatchCategory | null {
  if (input.remoteUnavailable) {
    return "remote_state_unavailable";
  }
  if (input.streamGenerationMismatch) {
    return "stream_generation_conflict";
  }
  if (input.localPendingUpload && !input.cloudReceiptPresent) {
    return "expected_upload_backlog";
  }
  if (!input.localPendingUpload && !input.cloudReceiptPresent && input.localAcked === false) {
    return "missing_cloud_receipt";
  }
  if (input.cloudReceiptPresent && !input.localAcked) {
    return "missing_local_acknowledgement";
  }
  if (input.payloadHashMatches === false) {
    return "different_immutable_payload";
  }
  return null;
}

/** Exact money/count difference line — no rounding tolerance. */
export function formatExactDifference(input: {
  label: string;
  local: string | number | null;
  cloud: string | number | null;
}): string {
  return `${input.label}: local=${String(input.local)} cloud=${String(input.cloud)}`;
}
