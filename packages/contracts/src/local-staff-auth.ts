import { z } from "zod";

import { capabilityIdSchema } from "./tenant-access.js";
import { absoluteTimestampSchema, deviceIdSchema, opaqueIdSchema } from "./primitives.js";

export const staffCodeSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "Staff code must be alphanumeric with . _ -");

export const deviceProofSchema = z.strictObject({
  deviceId: deviceIdSchema,
  signedAt: absoluteTimestampSchema,
  signature: z.string().min(1).max(512),
});

export const localStaffSignInRequestSchema = z.strictObject({
  staffCode: staffCodeSchema,
  secret: z.string().min(4).max(256),
  deviceProof: deviceProofSchema,
});

export const localStaffSignInResponseSchema = z.strictObject({
  sessionSecret: z.string().min(1).max(256),
  sessionId: opaqueIdSchema,
  staffId: opaqueIdSchema,
  deviceId: deviceIdSchema,
  displayName: z.string().min(1).max(200),
  authorityVerifiedAt: absoluteTimestampSchema,
  absoluteExpiresAt: absoluteTimestampSchema,
});

export const localStaffSessionResponseSchema = z.strictObject({
  sessionId: opaqueIdSchema,
  staffId: opaqueIdSchema,
  staffCode: staffCodeSchema,
  displayName: z.string().min(1).max(200),
  deviceId: deviceIdSchema,
  capabilities: z.array(capabilityIdSchema),
  authorityVerifiedAt: absoluteTimestampSchema,
  issuedAt: absoluteTimestampSchema,
  absoluteExpiresAt: absoluteTimestampSchema,
  lastActivityAt: absoluteTimestampSchema,
});

export const localStaffSignOutRequestSchema = z.strictObject({
  deviceProof: deviceProofSchema,
});

export const localStaffSignOutResponseSchema = z.strictObject({
  signedOut: z.literal(true),
});

export const localStaffSetupOwnerRequestSchema = z.strictObject({
  staffCode: staffCodeSchema,
  secret: z.string().min(4).max(256),
  displayName: z.string().min(1).max(200).optional(),
  /** Opaque one-time setup grant secret from the owner web console (not a device enrollment grant). */
  setupGrantSecret: z.string().min(32).max(512),
});

export const localStaffSetupOwnerResponseSchema = z.strictObject({
  staffId: opaqueIdSchema,
});

export const redeemLocalStaffSetupGrantRequestSchema = z.strictObject({
  setupGrantSecret: z.string().min(32).max(512),
  tenantId: opaqueIdSchema,
});

export const redeemLocalStaffSetupGrantResponseSchema = z.strictObject({
  grantId: opaqueIdSchema,
  tenantId: opaqueIdSchema,
  cloudMembershipId: opaqueIdSchema,
  ownerDisplayName: z.string().min(1).max(200),
  capabilities: z.array(capabilityIdSchema),
  sourceRevision: z.number().int().positive(),
});

export const authorizeLocalStaffSetupGrantResponseSchema = z.strictObject({
  grantId: opaqueIdSchema,
  setupGrantSecret: z.string().min(32).max(512),
  expiresAt: absoluteTimestampSchema,
});

export const authorizeLocalStaffPermissionRefreshRequestSchema = z.strictObject({
  membershipId: opaqueIdSchema,
});

export const authorizeLocalStaffPermissionRefreshResponseSchema = z.strictObject({
  grantId: opaqueIdSchema,
  refreshGrantSecret: z.string().min(32).max(512),
  expiresAt: absoluteTimestampSchema,
});

export const redeemLocalStaffPermissionRefreshRequestSchema = z.strictObject({
  refreshGrantSecret: z.string().min(32).max(512),
  tenantId: opaqueIdSchema,
  /** Optional: host local staff cloud_membership_id must match the grant target. */
  expectedMembershipId: opaqueIdSchema.optional(),
});

export const redeemLocalStaffPermissionRefreshResponseSchema = z.strictObject({
  grantId: opaqueIdSchema,
  tenantId: opaqueIdSchema,
  cloudMembershipId: opaqueIdSchema,
  capabilities: z.array(capabilityIdSchema),
  sourceRevision: z.number().int().positive(),
});

export type DeviceProofPayload = z.infer<typeof deviceProofSchema>;
export type LocalStaffSignInRequest = z.infer<typeof localStaffSignInRequestSchema>;
export type LocalStaffSignInResponse = z.infer<typeof localStaffSignInResponseSchema>;
export type LocalStaffSessionResponse = z.infer<typeof localStaffSessionResponseSchema>;
export type LocalStaffSignOutRequest = z.infer<typeof localStaffSignOutRequestSchema>;
export type LocalStaffSignOutResponse = z.infer<typeof localStaffSignOutResponseSchema>;
export type LocalStaffSetupOwnerRequest = z.infer<typeof localStaffSetupOwnerRequestSchema>;
export type LocalStaffSetupOwnerResponse = z.infer<typeof localStaffSetupOwnerResponseSchema>;
