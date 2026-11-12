import { z } from "zod";

import {
  catalogDisplayNameSchema,
  catalogRevisionSchema,
  catalogShortCodeSchema,
} from "./vegetables.js";
import { absoluteTimestampSchema, opaqueIdSchema } from "./primitives.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";

export const packageTypeRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  shortCode: catalogShortCodeSchema,
  displayName: catalogDisplayNameSchema,
  isActive: z.boolean(),
  revision: catalogRevisionSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
});

export type PackageTypeRecordDto = z.infer<typeof packageTypeRecordSchema>;

export const createPackageTypeRequestSchema = z.strictObject({
  shortCode: catalogShortCodeSchema,
  displayName: catalogDisplayNameSchema,
});

export type CreatePackageTypeRequest = z.infer<typeof createPackageTypeRequestSchema>;

/**
 * Update approved editable fields.
 * Short code is not editable. No default tare fields in this release.
 */
export const updatePackageTypeRequestSchema = z.strictObject({
  expectedRevision: catalogRevisionSchema,
  displayName: catalogDisplayNameSchema,
});

export type UpdatePackageTypeRequest = z.infer<typeof updatePackageTypeRequestSchema>;

export const packageTypeStatusSchema = z.enum(["active", "inactive"]);

export const changePackageTypeStatusRequestSchema = z.strictObject({
  expectedRevision: catalogRevisionSchema,
  status: packageTypeStatusSchema,
});

export type ChangePackageTypeStatusRequest = z.infer<typeof changePackageTypeStatusRequestSchema>;

export const packageTypeActiveFilterSchema = z
  .enum(["active", "inactive", "all"])
  .default("active");

export const listPackageTypesQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  active: packageTypeActiveFilterSchema,
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(32).optional(),
});

export type ListPackageTypesQuery = z.infer<typeof listPackageTypesQuerySchema>;

export const listPackageTypesResponseSchema =
  createPaginatedResponseSchema(packageTypeRecordSchema);

export type ListPackageTypesResponse = z.infer<typeof listPackageTypesResponseSchema>;

export const PACKAGE_TYPE_EVENT_SCHEMA_VERSION = "1";

export const PACKAGE_TYPE_CREATED_EVENT_TYPE = "polivo.package_type.created";
export const PACKAGE_TYPE_UPDATED_EVENT_TYPE = "polivo.package_type.updated";
export const PACKAGE_TYPE_STATUS_CHANGED_EVENT_TYPE = "polivo.package_type.status_changed";

export const packageTypeSnapshotEventPayloadSchema = z.strictObject({
  packageType: packageTypeRecordSchema,
  stallId: opaqueIdSchema,
});

export type PackageTypeSnapshotEventPayload = z.infer<typeof packageTypeSnapshotEventPayloadSchema>;
