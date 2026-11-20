import { describe, expect, it } from "vitest";

import {
  BLOCKING_INGEST_OUTCOMES,
  computeBackoffDelayMs,
  isBlockingErrorCode,
  SYNC_RETRY_MAX_DELAY_MS,
} from "./retry.js";

describe("sync retry policy", () => {
  it("applies exponential backoff with jitter under the documented maximum", () => {
    const delay = computeBackoffDelayMs(10, {
      nowMs: () => 0,
      random: () => 1,
    });
    expect(delay).toBeLessThanOrEqual(SYNC_RETRY_MAX_DELAY_MS);
    expect(delay).toBeGreaterThan(0);
  });

  it("honors server retry-after within bounds", () => {
    const delay = computeBackoffDelayMs(0, { nowMs: () => 0, random: () => 0 }, 12);
    expect(delay).toBe(12_000);
  });

  it("classifies blocking outcomes and credential errors", () => {
    expect(BLOCKING_INGEST_OUTCOMES.has("integrity_conflict")).toBe(true);
    expect(isBlockingErrorCode("HOST_CREDENTIAL_CONFIGURATION")).toBe(true);
    expect(isBlockingErrorCode("OVERSIZED_TRANSACTION_GROUP")).toBe(true);
    expect(isBlockingErrorCode("NETWORK_ERROR")).toBe(false);
  });
});
