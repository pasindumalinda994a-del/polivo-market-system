import { z } from "zod";

import {
  absoluteTimestampSchema,
  opaqueIdSchema,
  type AbsoluteTimestamp,
  type OpaqueId,
} from "./primitives.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";

/** Proposed party short-code rule (Phase 17): trim, case-preserving, 1–32 chars. */
export const PARTY_SHORT_CODE_MAX_LENGTH = 32;

export const partyShortCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTY_SHORT_CODE_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/,
    "Short code must start with alphanumeric and may include . _ -",
  );

export const farmerDisplayNameSchema = z.string().trim().min(1).max(200);

/** Phone/contact as text — preserves leading zeros; empty after trim rejected when present. */
export const farmerContactNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[0-9+()\-\s.]+$/, "Contact number must be digits and common phone punctuation");

export const farmerLocalitySchema = z.string().trim().min(1).max(200);

export const farmerRevisionSchema = z.number().int().positive();

export const farmerRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  shortCode: partyShortCodeSchema,
  displayName: farmerDisplayNameSchema,
  contactNumber: farmerContactNumberSchema.nullable(),
  locality: farmerLocalitySchema.nullable(),
  isActive: z.boolean(),
  revision: farmerRevisionSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});

export type FarmerRecordDto = z.infer<typeof farmerRecordSchema>;

export const createFarmerRequestSchema = z.strictObject({
  shortCode: partyShortCodeSchema,
  displayName: farmerDisplayNameSchema,
  contactNumber: farmerContactNumberSchema.nullable().optional(),
  locality: farmerLocalitySchema.nullable().optional(),
});

export type CreateFarmerRequest = z.infer<typeof createFarmerRequestSchema>;

/**
 * Update approved editable fields.
 * Omitted optional fields leave the stored value unchanged.
 * Explicit null clears contactNumber / locality.
 */
export const updateFarmerRequestSchema = z
  .strictObject({
    expectedRevision: farmerRevisionSchema,
    displayName: farmerDisplayNameSchema.optional(),
    contactNumber: farmerContactNumberSchema.nullable().optional(),
    locality: farmerLocalitySchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.contactNumber !== undefined ||
      value.locality !== undefined,
    { message: "At least one editable field must be provided" },
  );

export type UpdateFarmerRequest = z.infer<typeof updateFarmerRequestSchema>;

export const farmerStatusSchema = z.enum(["active", "inactive"]);

export const changeFarmerStatusRequestSchema = z.strictObject({
  expectedRevision: farmerRevisionSchema,
  status: farmerStatusSchema,
});

export type ChangeFarmerStatusRequest = z.infer<typeof changeFarmerStatusRequestSchema>;

export const farmerActiveFilterSchema = z.enum(["active", "inactive", "all"]).default("active");

/**
 * Search/list query. Offset pagination uses opaque cursor as a decimal offset string when present.
 */
export const listFarmersQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  active: farmerActiveFilterSchema,
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(32).optional(),
});

export type ListFarmersQuery = z.infer<typeof listFarmersQuerySchema>;

export const listFarmersResponseSchema = createPaginatedResponseSchema(farmerRecordSchema);

export type ListFarmersResponse = z.infer<typeof listFarmersResponseSchema>;

export const FARMER_EVENT_SCHEMA_VERSION = "1";

export const FARMER_CREATED_EVENT_TYPE = "polivo.farmer.created";
export const FARMER_UPDATED_EVENT_TYPE = "polivo.farmer.updated";
export const FARMER_STATUS_CHANGED_EVENT_TYPE = "polivo.farmer.status_changed";

/**
 * Snapshot semantics: payload is the farmer record after the successful mutation.
 * Chosen for master-data sync so consumers can upsert without reconstructing diffs.
 */
export const farmerSnapshotEventPayloadSchema = z.strictObject({
  farmer: farmerRecordSchema,
  stallId: opaqueIdSchema,
});

export type FarmerSnapshotEventPayload = z.infer<typeof farmerSnapshotEventPayloadSchema>;

export type FarmerId = OpaqueId;
export type FarmerCreatedAt = AbsoluteTimestamp;

export { PAGINATION_MAX_LIMIT };
