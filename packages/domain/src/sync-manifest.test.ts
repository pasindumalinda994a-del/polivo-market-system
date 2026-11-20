import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildChunkedManifest,
  canonicalizeForSyncManifest,
  classifyDeliveryObservation,
  formatExactDifference,
} from "./sync-manifest.js";

function hashHex(utf8: string): string {
  return createHash("sha256").update(utf8, "utf8").digest("hex");
}

describe("sync manifest helpers", () => {
  it("canonicalizes with sorted keys and preserves null", () => {
    expect(canonicalizeForSyncManifest({ b: 1, a: null })).toBe(
      canonicalizeForSyncManifest({ a: null, b: 1 }),
    );
    expect(canonicalizeForSyncManifest({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("builds deterministic chunked manifests", () => {
    const digests = ["aa", "bb", "cc"].map((s) => hashHex(s));
    const a = buildChunkedManifest({
      domain: "payments",
      recordDigests: digests,
      chunkSize: 2,
      hashHex,
    });
    const b = buildChunkedManifest({
      domain: "payments",
      recordDigests: digests,
      chunkSize: 2,
      hashHex,
    });
    expect(a.rootHash).toBe(b.rootHash);
    expect(a.recordCount).toBe(3);
    expect(a.chunks).toHaveLength(2);
  });

  it("classifies delivery observations without calling network failures mismatches", () => {
    expect(
      classifyDeliveryObservation({
        localAcked: false,
        cloudReceiptPresent: false,
        localPendingUpload: true,
        payloadHashMatches: null,
        streamGenerationMismatch: false,
        remoteUnavailable: false,
      }),
    ).toBe("expected_upload_backlog");
    expect(
      classifyDeliveryObservation({
        localAcked: false,
        cloudReceiptPresent: true,
        localPendingUpload: false,
        payloadHashMatches: true,
        streamGenerationMismatch: false,
        remoteUnavailable: false,
      }),
    ).toBe("missing_local_acknowledgement");
    expect(
      classifyDeliveryObservation({
        localAcked: true,
        cloudReceiptPresent: false,
        localPendingUpload: false,
        payloadHashMatches: null,
        streamGenerationMismatch: false,
        remoteUnavailable: true,
      }),
    ).toBe("remote_state_unavailable");
  });

  it("formats exact differences without tolerance", () => {
    expect(formatExactDifference({ label: "balance", local: 100, cloud: 99 })).toBe(
      "balance: local=100 cloud=99",
    );
  });
});
