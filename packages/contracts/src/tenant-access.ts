import { z } from "zod";

import { localApplicationStatusSchema } from "./config/status.js";
import { idempotencyKeySchema, opaqueIdSchema, tenantIdSchema } from "./primitives.js";

export const MEMBERSHIP_ACCESS_ROLES = ["owner", "billing_staff", "cashier"] as const;
export const OPERATIONAL_PROFILE_ROLES = ["billing_staff", "cashier"] as const;
export const MEMBERSHIP_STATUSES = ["active", "inactive", "suspended"] as const;

export const membershipAccessRoleSchema = z.enum(MEMBERSHIP_ACCESS_ROLES);
export const operationalProfileRoleSchema = z.enum(OPERATIONAL_PROFILE_ROLES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

/** Capability identifier transport — unknown values are rejected by domain/RPC layers. */
export const capabilityIdSchema = z.string().min(1).max(64);

export const capabilitySetSchema = z.array(capabilityIdSchema).max(64);

export const createStallRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  displayName: z.string().trim().min(1).max(128),
  timezone: z.string().trim().min(1).max(64),
  marketLocation: z.string().trim().max(256).optional(),
  contact: z.string().trim().max(256).optional(),
});

export const createStallResponseSchema = z.object({
  tenantId: tenantIdSchema,
  membershipId: opaqueIdSchema,
  replayed: z.boolean(),
});

export const createInvitationRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  accessRole: operationalProfileRoleSchema,
  capabilities: capabilitySetSchema,
});

export const createInvitationResponseSchema = z.object({
  invitationId: opaqueIdSchema,
  expiresAt: z.string().min(1),
  /** Raw token returned once for copyable link construction. Never stored by the server. */
  token: z.string().min(32).max(256),
  acceptPath: z.string().min(1).max(512),
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(32).max(256),
});

export const acceptInvitationResponseSchema = z.object({
  tenantId: tenantIdSchema,
  membershipId: opaqueIdSchema,
  accessRole: operationalProfileRoleSchema,
});

export const updateMembershipRequestSchema = z
  .object({
    status: membershipStatusSchema.optional(),
    accessRole: operationalProfileRoleSchema.optional(),
    capabilities: capabilitySetSchema.optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.accessRole !== undefined ||
      value.capabilities !== undefined,
    { message: "At least one membership field is required." },
  );

export const updatePermissionProfileRequestSchema = z.object({
  capabilities: capabilitySetSchema,
  expectedRevision: z.number().int().positive(),
  /** Owner must confirm review of selected permissions before save. */
  permissionsReviewed: z.literal(true),
});

export const updatePermissionProfileResponseSchema = z.object({
  revision: z.number().int().positive(),
  cloudSaveStatus: z.literal("saved_to_cloud"),
  /** Delivery observation for the access domain after publication. */
  localApplicationStatus: localApplicationStatusSchema,
  publishedRevision: z.number().int().positive().optional(),
  lastAcknowledgedRevision: z.number().int().nonnegative().nullable().optional(),
});

export const TENANT_LIFECYCLE_STATUSES = ["active", "inactive", "suspended"] as const;
export const tenantLifecycleStatusSchema = z.enum(TENANT_LIFECYCLE_STATUSES);

export const updateStallProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(128),
  timezone: z.string().trim().min(1).max(64),
  marketLocation: z.string().trim().max(256).optional(),
  contact: z.string().trim().max(256).optional(),
  adminNotes: z.string().max(2000).optional(),
  expectedRevision: z.number().int().positive(),
});

export const updateStallProfileResponseSchema = z.object({
  profileRevision: z.number().int().positive(),
  cloudSaveStatus: z.literal("saved_to_cloud"),
});

export const stallAdminProfileSchema = z.object({
  tenantId: tenantIdSchema,
  status: tenantLifecycleStatusSchema,
  displayName: z.string().min(1).max(128),
  marketLocation: z.string().max(256).nullable(),
  contact: z.string().max(256).nullable(),
  timezone: z.string().min(1).max(64),
  profileRevision: z.number().int().positive(),
  adminNotes: z.string().max(2000),
  updatedAt: z.string().min(1),
});

export const platformDirectoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().trim().max(128).optional(),
  status: tenantLifecycleStatusSchema.optional(),
});

export const platformStallDirectoryRowSchema = z.object({
  tenantId: tenantIdSchema,
  displayName: z.string().min(1),
  marketLocation: z.string().nullable(),
  contact: z.string().nullable(),
  timezone: z.string().min(1),
  status: tenantLifecycleStatusSchema,
  ownerSubject: z.string().nullable(),
  enrollmentStatus: z.string().min(1),
  lastHostContactAt: z.string().nullable(),
  lastUploadAppliedAt: z.string().nullable(),
  configPublishedRevision: z.number().int().positive().nullable(),
  configAcknowledgedRevision: z.number().int().nonnegative().nullable(),
  configDeliveryStatus: z.string().min(1),
  blockerNoEnrolledHost: z.boolean(),
  blockerHostContactStale: z.boolean(),
  blockerUploadBlocked: z.boolean(),
  blockerConfigPending: z.boolean(),
  blockerReconciliationIssue: z.boolean(),
});

export const platformStallDirectoryResponseSchema = z.object({
  stalls: z.array(platformStallDirectoryRowSchema),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const adminAuditEventSchema = z.object({
  id: opaqueIdSchema,
  tenantId: tenantIdSchema,
  actorSubject: z.string().min(1),
  action: z.string().min(1).max(128),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  beforeJson: z.record(z.string(), z.unknown()).nullable(),
  afterJson: z.record(z.string(), z.unknown()).nullable(),
  configurationRevision: z.number().int().nullable(),
  createdAt: z.string().min(1),
});

export type CreateStallRequest = z.infer<typeof createStallRequestSchema>;
export type CreateStallResponse = z.infer<typeof createStallResponseSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>;
export type UpdatePermissionProfileRequest = z.infer<typeof updatePermissionProfileRequestSchema>;
export type UpdatePermissionProfileResponse = z.infer<typeof updatePermissionProfileResponseSchema>;
export type UpdateStallProfileRequest = z.infer<typeof updateStallProfileRequestSchema>;
export type UpdateStallProfileResponse = z.infer<typeof updateStallProfileResponseSchema>;
export type StallAdminProfile = z.infer<typeof stallAdminProfileSchema>;
export type PlatformDirectoryQuery = z.infer<typeof platformDirectoryQuerySchema>;
export type PlatformStallDirectoryRow = z.infer<typeof platformStallDirectoryRowSchema>;
export type PlatformStallDirectoryResponse = z.infer<typeof platformStallDirectoryResponseSchema>;
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;
