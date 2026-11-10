import { z } from "zod";

import { farmerDisplayNameSchema, farmerRevisionSchema, partyShortCodeSchema } from "./farmers.js";
import { absoluteTimestampSchema, opaqueIdSchema } from "./primitives.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";

/** Catalog short codes reuse the Proposed party short-code charset (Phase 17). */
export const catalogShortCodeSchema = partyShortCodeSchema;
export const catalogDisplayNameSchema = farmerDisplayNameSchema;
export const catalogRevisionSchema = farmerRevisionSchema;

export const vegetableRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  shortCode: catalogShortCodeSchema,
  displayName: catalogDisplayNameSchema,
  isActive: z.boolean(),
  revision: catalogRevisionSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});

export type VegetableRecordDto = z.infer<typeof vegetableRecordSchema>;

export const createVegetableRequestSchema = z.strictObject({
  shortCode: catalogShortCodeSchema,
  displayName: catalogDisplayNameSchema,
});

export type CreateVegetableRequest = z.infer<typeof createVegetableRequestSchema>;

/**
 * Update approved editable fields.
 * Short code is not editable.
 */
export const updateVegetableRequestSchema = z.strictObject({
  expectedRevision: catalogRevisionSchema,
  displayName: catalogDisplayNameSchema,
});

export type UpdateVegetableRequest = z.infer<typeof updateVegetableRequestSchema>;

export const vegetableStatusSchema = z.enum(["active", "inactive"]);

export const changeVegetableStatusRequestSchema = z.strictObject({
  expectedRevision: catalogRevisionSchema,
  status: vegetableStatusSchema,
});

export type ChangeVegetableStatusRequest = z.infer<typeof changeVegetableStatusRequestSchema>;

export const vegetableActiveFilterSchema = z.enum(["active", "inactive", "all"]).default("active");

export const listVegetablesQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  active: vegetableActiveFilterSchema,
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(32).optional(),
});

export type ListVegetablesQuery = z.infer<typeof listVegetablesQuerySchema>;

export const listVegetablesResponseSchema = createPaginatedResponseSchema(vegetableRecordSchema);

export type ListVegetablesResponse = z.infer<typeof listVegetablesResponseSchema>;

export const VEGETABLE_EVENT_SCHEMA_VERSION = "1";

export const VEGETABLE_CREATED_EVENT_TYPE = "polivo.vegetable.created";
export const VEGETABLE_UPDATED_EVENT_TYPE = "polivo.vegetable.updated";
export const VEGETABLE_STATUS_CHANGED_EVENT_TYPE = "polivo.vegetable.status_changed";

export const vegetableSnapshotEventPayloadSchema = z.strictObject({
  vegetable: vegetableRecordSchema,
  stallId: opaqueIdSchema,
});

export type VegetableSnapshotEventPayload = z.infer<typeof vegetableSnapshotEventPayloadSchema>;
