/** Base delay (ms) for attempt index 0 after a transient failure. */
export const SYNC_RETRY_BASE_DELAY_MS = 2_000;
/** Documented maximum backoff delay. */
export const SYNC_RETRY_MAX_DELAY_MS = 15 * 60 * 1_000;
/** Honor server retry-after up to this bound. */
export const SYNC_RETRY_SERVER_HINT_MAX_SECONDS = 30 * 60;

export type RetryClock = {
  nowMs: () => number;
  random: () => number;
};

export function computeBackoffDelayMs(
  attemptIndex: number,
  clock: RetryClock,
  serverRetryAfterSeconds?: number | null,
): number {
  if (
    serverRetryAfterSeconds !== undefined &&
    serverRetryAfterSeconds !== null &&
    Number.isFinite(serverRetryAfterSeconds) &&
    serverRetryAfterSeconds >= 0
  ) {
    const capped = Math.min(serverRetryAfterSeconds, SYNC_RETRY_SERVER_HINT_MAX_SECONDS);
    return Math.min(capped * 1000, SYNC_RETRY_MAX_DELAY_MS);
  }

  const exp = Math.min(attemptIndex, 12);
  const raw = SYNC_RETRY_BASE_DELAY_MS * 2 ** exp;
  const capped = Math.min(raw, SYNC_RETRY_MAX_DELAY_MS);
  const jitter = 0.5 + clock.random() * 0.5;
  return Math.floor(capped * jitter);
}

export function nextRetryAtIso(
  attemptIndex: number,
  clock: RetryClock,
  serverRetryAfterSeconds?: number | null,
): string {
  const delay = computeBackoffDelayMs(attemptIndex, clock, serverRetryAfterSeconds);
  return new Date(clock.nowMs() + delay).toISOString();
}

export const BLOCKING_INGEST_OUTCOMES = new Set([
  "sequence_conflict",
  "dependency_conflict",
  "unsupported_event_version",
  "integrity_conflict",
  "authorization_failure",
  "validation_failure",
  "incomplete_group",
]);

export const TRANSIENT_INGEST_OUTCOMES = new Set(["retryable_failure", "rate_limited"]);

export function isBlockingErrorCode(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }
  const normalized = code.toUpperCase();
  return (
    normalized.includes("REVOKED") ||
    normalized.includes("CREDENTIAL") ||
    normalized.includes("SIGNATURE") ||
    normalized.includes("UNSUPPORTED") ||
    normalized.includes("INTEGRITY") ||
    normalized.includes("SEQUENCE") ||
    normalized.includes("GENERATION") ||
    normalized.includes("OVERSIZED") ||
    normalized.includes("DEPENDENCY") ||
    normalized.includes("AUTHORIZATION") ||
    normalized.includes("VALIDATION") ||
    normalized === "HOST_CREDENTIAL_CONFIGURATION" ||
    normalized === "OVERSIZED_TRANSACTION_GROUP" ||
    normalized === "ENRICHMENT_FAILED"
  );
}
