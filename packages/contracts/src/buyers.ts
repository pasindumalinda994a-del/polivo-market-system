import { z } from "zod";

import {
  farmerContactNumberSchema,
  farmerDisplayNameSchema,
  farmerLocalitySchema,
  farmerRevisionSchema,
  partyShortCodeSchema,
} from "./farmers.js";
import { absoluteTimestampSchema, opaqueIdSchema } from "./primitives.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";

export const buyerRecordSchema = z.strictObject({
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

export type BuyerRecordDto = z.infer<typeof buyerRecordSchema>;

export const createBuyerRequestSchema = z.strictObject({
  shortCode: partyShortCodeSchema,
  displayName: farmerDisplayNameSchema,
  contactNumber: farmerContactNumberSchema.nullable().optional(),
  locality: farmerLocalitySchema.nullable().optional(),
});

export type CreateBuyerRequest = z.infer<typeof createBuyerRequestSchema>;

/**
 * Update approved editable fields.
 * Omitted optional fields leave the stored value unchanged.
 * Explicit null clears contactNumber / locality.
 * Short code is not editable.
 */
export const updateBuyerRequestSchema = z
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

export type UpdateBuyerRequest = z.infer<typeof updateBuyerRequestSchema>;

export const buyerStatusSchema = z.enum(["active", "inactive"]);

export const changeBuyerStatusRequestSchema = z.strictObject({
  expectedRevision: farmerRevisionSchema,
  status: buyerStatusSchema,
});

export type ChangeBuyerStatusRequest = z.infer<typeof changeBuyerStatusRequestSchema>;

export const buyerActiveFilterSchema = z.enum(["active", "inactive", "all"]).default("active");

export const listBuyersQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  active: buyerActiveFilterSchema,
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(32).optional(),
});

export type ListBuyersQuery = z.infer<typeof listBuyersQuerySchema>;

export const listBuyersResponseSchema = createPaginatedResponseSchema(buyerRecordSchema);

export type ListBuyersResponse = z.infer<typeof listBuyersResponseSchema>;

export const BUYER_EVENT_SCHEMA_VERSION = "1";

export const BUYER_CREATED_EVENT_TYPE = "polivo.buyer.created";
export const BUYER_UPDATED_EVENT_TYPE = "polivo.buyer.updated";
export const BUYER_STATUS_CHANGED_EVENT_TYPE = "polivo.buyer.status_changed";

/**
 * Snapshot of the buyer record after a successful mutation.
 * The row is stored in the local traders table; farmer records are not included.
 */
export const buyerSnapshotEventPayloadSchema = z.strictObject({
  buyer: buyerRecordSchema,
  stallId: opaqueIdSchema,
});

export type BuyerSnapshotEventPayload = z.infer<typeof buyerSnapshotEventPayloadSchema>;
