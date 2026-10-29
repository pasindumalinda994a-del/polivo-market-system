import { z } from "zod";

/**
 * Initial local stall-service API contract version.
 * Distinct from application release versions and database migration versions.
 */
export const LOCAL_API_CONTRACT_VERSION = "1" as const;

/**
 * Initial synchronization protocol version.
 * Distinct from local API contract version and individual event schema versions.
 */
export const SYNC_PROTOCOL_VERSION = "1" as const;

export const localApiContractVersionSchema = z.literal(LOCAL_API_CONTRACT_VERSION);
export const syncProtocolVersionSchema = z.literal(SYNC_PROTOCOL_VERSION);

export type LocalApiContractVersion = z.infer<typeof localApiContractVersionSchema>;
export type SyncProtocolVersion = z.infer<typeof syncProtocolVersionSchema>;

/**
 * Unknown or incompatible protocol versions must fail validation.
 * Negotiation and upgrade workflows are implemented with the relevant APIs later.
 */
export const localApiContractVersionHeaderSchema = localApiContractVersionSchema;
export const syncProtocolVersionFieldSchema = syncProtocolVersionSchema;
