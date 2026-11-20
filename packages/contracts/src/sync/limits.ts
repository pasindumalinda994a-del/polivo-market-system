/** Bounded ingest request limits (Phase 31). */

export const SYNC_INGEST_MAX_REQUEST_BYTES = 512 * 1024;
export const SYNC_INGEST_MAX_EVENTS = 100;
export const SYNC_INGEST_MAX_GROUPS = 40;
export const SYNC_INGEST_MAX_EVENTS_PER_GROUP = 32;
export const SYNC_INGEST_MAX_STRING_LENGTH = 8_192;
export const SYNC_INGEST_MAX_PAYLOAD_DEPTH = 12;
export const SYNC_INGEST_MAX_NESTED_ARRAY_LENGTH = 500;

/** Durable rate-limit windows (server-enforced). */
export const SYNC_INGEST_RATE_LIMIT_WINDOW_SECONDS = 60;
export const SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_STREAM = 30;
export const SYNC_INGEST_RATE_LIMIT_MAX_REQUESTS_PER_TENANT = 60;

/** Signed-at skew allowed for ingest possession proofs. */
export const SYNC_INGEST_SIGNED_AT_SKEW_SECONDS = 300;
