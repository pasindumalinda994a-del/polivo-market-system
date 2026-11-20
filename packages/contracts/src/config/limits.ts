/** Bounded configuration pull/ack limits (Phase 33). */

export const CONFIG_SYNC_MAX_REQUEST_BYTES = 256 * 1024;
export const CONFIG_SYNC_MAX_RESPONSE_BYTES = 512 * 1024;
export const CONFIG_SYNC_MAX_STRING_LENGTH = 8_192;
export const CONFIG_SYNC_MAX_MEMBERSHIPS = 500;
export const CONFIG_SYNC_MAX_DEVICES = 200;
export const CONFIG_SYNC_MAX_PROFILES = 8;

/** Signed-at skew allowed for config possession proofs (seconds). */
export const CONFIG_SYNC_SIGNED_AT_SKEW_SECONDS = 300;
