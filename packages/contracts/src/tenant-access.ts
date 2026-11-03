import { z } from "zod";

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
  localApplicationStatus: z.literal("unavailable"),
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
