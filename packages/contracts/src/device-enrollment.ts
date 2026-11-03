import { z } from "zod";

import { deviceIdSchema, opaqueIdSchema, tenantIdSchema } from "./primitives.js";

/** Cloud timestamptz transport — accept PostgREST ISO strings without over-constraining. */
const cloudTimestampSchema = z.string().min(1).max(64);

export const DEVICE_ROLES = ["host", "terminal"] as const;
export const DEVICE_ENROLLMENT_STATES = [
  "reserved",
  "redeemed",
  "activated",
  "revoked",
  "waiting_host_confirm",
] as const;
export const DEPLOYMENT_ENVIRONMENTS = ["development", "staging", "production"] as const;

export const deviceRoleSchema = z.enum(DEVICE_ROLES);
export const deviceEnrollmentStateSchema = z.enum(DEVICE_ENROLLMENT_STATES);
export const deploymentEnvironmentSchema = z.enum(DEPLOYMENT_ENVIRONMENTS);

export const authorizeHostEnrollmentRequestSchema = z.object({
  label: z.string().trim().max(128).optional(),
  deploymentEnvironment: deploymentEnvironmentSchema,
});

export const authorizeTerminalEnrollmentRequestSchema = z.object({
  hostDeviceId: deviceIdSchema,
  label: z.string().trim().max(128).optional(),
  deploymentEnvironment: deploymentEnvironmentSchema,
});

export const authorizeEnrollmentResponseSchema = z.object({
  grantId: opaqueIdSchema,
  reservedDeviceId: deviceIdSchema,
  expiresAt: cloudTimestampSchema,
  /** One-time enrollment secret. Shown once; never logged or stored by the server. */
  enrollmentSecret: z.string().min(32).max(256),
});

export const tenantDeviceSummarySchema = z.object({
  deviceId: deviceIdSchema,
  role: deviceRoleSchema,
  label: z.string().nullable(),
  enrollmentState: deviceEnrollmentStateSchema,
  intendedHostDeviceId: deviceIdSchema.nullable(),
  deploymentEnvironment: deploymentEnvironmentSchema,
  stateRevision: z.number().int().positive(),
  createdAt: cloudTimestampSchema,
  updatedAt: cloudTimestampSchema,
  redeemedAt: cloudTimestampSchema.nullable(),
  activatedAt: cloudTimestampSchema.nullable(),
  revokedAt: cloudTimestampSchema.nullable(),
});

export const listTenantDevicesResponseSchema = z.object({
  devices: z.array(tenantDeviceSummarySchema),
});

export const cancelEnrollmentGrantRequestSchema = z.object({
  grantId: opaqueIdSchema,
});

export const revokeTenantDeviceRequestSchema = z.object({
  deviceId: deviceIdSchema,
});

export const revokeTenantDeviceResponseSchema = z.object({
  stateRevision: z.number().int().positive(),
});

export const redeemEnrollmentRequestSchema = z.object({
  enrollmentSecret: z.string().min(32).max(256),
  installationId: opaqueIdSchema,
  publicKey: z.string().min(16).max(512),
  deploymentEnvironment: deploymentEnvironmentSchema,
  possessionMessage: z.string().min(1).max(2048),
  possessionSignature: z.string().min(16).max(1024),
});

export const redeemEnrollmentResponseSchema = z.object({
  tenantId: tenantIdSchema,
  deviceId: deviceIdSchema,
  role: deviceRoleSchema,
  intendedHostDeviceId: deviceIdSchema.nullable(),
  label: z.string().nullable(),
  credentialVersion: z.number().int().positive(),
  stateRevision: z.number().int().positive(),
  enrollmentState: deviceEnrollmentStateSchema,
  stallDisplayName: z.string().min(1).max(128),
});

export const confirmEnrollmentRequestSchema = z.object({
  tenantId: tenantIdSchema,
  deviceId: deviceIdSchema,
  installationId: opaqueIdSchema,
  publicKey: z.string().min(16).max(512),
  credentialVersion: z.number().int().positive(),
  possessionMessage: z.string().min(1).max(2048),
  possessionSignature: z.string().min(16).max(1024),
});

export const confirmEnrollmentResponseSchema = z.object({
  enrollmentState: deviceEnrollmentStateSchema,
  stateRevision: z.number().int().positive(),
});

export const rotateDeviceCredentialRequestSchema = z.object({
  tenantId: tenantIdSchema,
  deviceId: deviceIdSchema,
  installationId: opaqueIdSchema,
  previousPublicKey: z.string().min(16).max(512),
  previousCredentialVersion: z.number().int().positive(),
  newPublicKey: z.string().min(16).max(512),
  newCredentialVersion: z.number().int().positive(),
  possessionMessage: z.string().min(1).max(2048),
  possessionSignature: z.string().min(16).max(1024),
});

export const rotateDeviceCredentialResponseSchema = z.object({
  credentialVersion: z.number().int().positive(),
  stateRevision: z.number().int().positive(),
});

export const hostAcceptTerminalRequestSchema = z.object({
  terminalDeviceId: deviceIdSchema,
  publicKey: z.string().min(16).max(512),
  credentialVersion: z.number().int().positive(),
  label: z.string().max(128).nullable().optional(),
  cloudStateRevision: z.number().int().positive(),
  pairingArtifact: z.string().min(16).max(4096),
  pairingSignature: z.string().min(16).max(1024),
});

export const hostAcceptTerminalResponseSchema = z.object({
  pairingState: z.enum(["pending_host_confirm", "accepted", "revoked"]),
  cloudStateRevision: z.number().int().positive().nullable(),
});

export type AuthorizeHostEnrollmentRequest = z.infer<typeof authorizeHostEnrollmentRequestSchema>;
export type AuthorizeTerminalEnrollmentRequest = z.infer<
  typeof authorizeTerminalEnrollmentRequestSchema
>;
export type AuthorizeEnrollmentResponse = z.infer<typeof authorizeEnrollmentResponseSchema>;
export type TenantDeviceSummary = z.infer<typeof tenantDeviceSummarySchema>;
export type ListTenantDevicesResponse = z.infer<typeof listTenantDevicesResponseSchema>;
export type CancelEnrollmentGrantRequest = z.infer<typeof cancelEnrollmentGrantRequestSchema>;
export type RevokeTenantDeviceRequest = z.infer<typeof revokeTenantDeviceRequestSchema>;
export type RevokeTenantDeviceResponse = z.infer<typeof revokeTenantDeviceResponseSchema>;
export type RedeemEnrollmentRequest = z.infer<typeof redeemEnrollmentRequestSchema>;
export type RedeemEnrollmentResponse = z.infer<typeof redeemEnrollmentResponseSchema>;
export type ConfirmEnrollmentRequest = z.infer<typeof confirmEnrollmentRequestSchema>;
export type ConfirmEnrollmentResponse = z.infer<typeof confirmEnrollmentResponseSchema>;
export type RotateDeviceCredentialRequest = z.infer<typeof rotateDeviceCredentialRequestSchema>;
export type RotateDeviceCredentialResponse = z.infer<typeof rotateDeviceCredentialResponseSchema>;
export type HostAcceptTerminalRequest = z.infer<typeof hostAcceptTerminalRequestSchema>;
export type HostAcceptTerminalResponse = z.infer<typeof hostAcceptTerminalResponseSchema>;
