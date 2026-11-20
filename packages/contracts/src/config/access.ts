import { z } from "zod";

import {
  absoluteTimestampSchema,
  deviceIdSchema,
  opaqueIdSchema,
  requestIdSchema,
  tenantIdSchema,
} from "../primitives.js";
import {
  capabilitySetSchema,
  membershipStatusSchema,
  operationalProfileRoleSchema,
} from "../tenant-access.js";
import {
  CONFIG_PROTOCOL_VERSION,
  configProtocolVersionSchema,
} from "../versioning.js";
import {
  CONFIG_SYNC_MAX_DEVICES,
  CONFIG_SYNC_MAX_MEMBERSHIPS,
  CONFIG_SYNC_MAX_PROFILES,
  CONFIG_SYNC_MAX_STRING_LENGTH,
} from "./limits.js";
import {
  LOCAL_APPLICATION_STATUSES,
  localApplicationStatusSchema,
  type LocalApplicationStatus,
} from "./status.js";

export { CONFIG_PROTOCOL_VERSION, configProtocolVersionSchema };
export {
  LOCAL_APPLICATION_STATUSES,
  localApplicationStatusSchema,
  type LocalApplicationStatus,
};

/** Access snapshot schema version inside the envelope. */
export const ACCESS_CONFIG_SCHEMA_VERSION = "1" as const;
export const accessConfigSchemaVersionSchema = z.literal(ACCESS_CONFIG_SCHEMA_VERSION);

export const CONFIG_DOMAINS = ["access"] as const;
export const configDomainSchema = z.enum(CONFIG_DOMAINS);
export type ConfigDomain = z.infer<typeof configDomainSchema>;

export const CONFIG_SNAPSHOT_KINDS = ["complete_replacement"] as const;
export const configSnapshotKindSchema = z.enum(CONFIG_SNAPSHOT_KINDS);
export type ConfigSnapshotKind = z.infer<typeof configSnapshotKindSchema>;

export const CONFIG_APPLICATION_RESULTS = [
  "applied",
  "already_applied",
  "rejected",
  "blocked",
] as const;
export const configApplicationResultSchema = z.enum(CONFIG_APPLICATION_RESULTS);
export type ConfigApplicationResult = z.infer<typeof configApplicationResultSchema>;

export const accessRoleProfileSnapshotSchema = z.strictObject({
  profileRole: operationalProfileRoleSchema,
  capabilities: capabilitySetSchema,
  revision: z.number().int().positive(),
  updatedAt: absoluteTimestampSchema,
});

export type AccessRoleProfileSnapshot = z.infer<typeof accessRoleProfileSnapshotSchema>;

export const accessMembershipSnapshotSchema = z.strictObject({
  membershipId: opaqueIdSchema,
  status: membershipStatusSchema,
  accessRole: z.enum(["owner", "billing_staff", "cashier"]),
  capabilities: capabilitySetSchema,
  capabilitiesRevision: z.number().int().positive(),
  updatedAt: absoluteTimestampSchema,
});

export type AccessMembershipSnapshot = z.infer<typeof accessMembershipSnapshotSchema>;

export const accessDeviceSnapshotSchema = z.strictObject({
  deviceId: deviceIdSchema,
  role: z.enum(["host", "terminal"]),
  enrollmentState: z.enum([
    "reserved",
    "redeemed",
    "activated",
    "revoked",
    "superseded",
  ]),
  installationId: opaqueIdSchema.nullable(),
  credentialVersion: z.number().int().positive().nullable(),
  intendedHostDeviceId: deviceIdSchema.nullable(),
  revokedAt: absoluteTimestampSchema.nullable(),
  label: z.string().max(128).nullable(),
});

export type AccessDeviceSnapshot = z.infer<typeof accessDeviceSnapshotSchema>;

export const accessConfigPayloadSchema = z.strictObject({
  profiles: z.array(accessRoleProfileSnapshotSchema).max(CONFIG_SYNC_MAX_PROFILES),
  memberships: z.array(accessMembershipSnapshotSchema).max(CONFIG_SYNC_MAX_MEMBERSHIPS),
  devices: z.array(accessDeviceSnapshotSchema).max(CONFIG_SYNC_MAX_DEVICES),
});

export type AccessConfigPayload = z.infer<typeof accessConfigPayloadSchema>;

/**
 * Complete-replacement access configuration envelope.
 * Trust is authenticated HTTPS + host possession on pull/ack — not a separate
 * server-signed envelope. Cached or relayed copies are not trusted outside the
 * authenticated host pull path.
 */
export const accessConfigEnvelopeSchema = z.strictObject({
  protocolVersion: configProtocolVersionSchema,
  schemaVersion: accessConfigSchemaVersionSchema,
  domain: z.literal("access"),
  snapshotKind: z.literal("complete_replacement"),
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  targetScope: z.literal("stall_host"),
  targetHostDeviceId: deviceIdSchema.nullable().optional(),
  revision: z.number().int().positive(),
  publicationId: opaqueIdSchema,
  issuedAt: absoluteTimestampSchema,
  /** Max offline snapshot age hint (ms). Host applies ADR 0013 production value. */
  maxSnapshotAgeMs: z.number().int().positive(),
  requiredCompatibilityVersion: z.literal(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: accessConfigPayloadSchema,
});

export type AccessConfigEnvelope = z.infer<typeof accessConfigEnvelopeSchema>;

export const configPullRequestBodySchema = z.strictObject({
  protocolVersion: configProtocolVersionSchema,
  requestId: requestIdSchema,
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  domain: configDomainSchema,
  /** Host's currently applied revision; null when never applied. */
  knownRevision: z.number().int().nonnegative().nullable(),
});

export type ConfigPullRequestBody = z.infer<typeof configPullRequestBodySchema>;

export const configAuthHeadersSchema = z.strictObject({
  tenantId: tenantIdSchema,
  deviceId: deviceIdSchema,
  installationId: opaqueIdSchema,
  credentialVersion: z.number().int().positive(),
  requestId: opaqueIdSchema,
  signedAt: absoluteTimestampSchema,
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1).max(256),
});

export type ConfigAuthHeaders = z.infer<typeof configAuthHeadersSchema>;

export const CONFIG_PULL_OUTCOMES = [
  "snapshot",
  "up_to_date",
  "host_revoked",
  "unauthorized",
  "incompatible",
] as const;
export const configPullOutcomeSchema = z.enum(CONFIG_PULL_OUTCOMES);
export type ConfigPullOutcome = z.infer<typeof configPullOutcomeSchema>;

export const configPullResponseSchema = z.strictObject({
  protocolVersion: configProtocolVersionSchema,
  correlationId: requestIdSchema,
  requestId: requestIdSchema,
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  domain: configDomainSchema,
  outcome: configPullOutcomeSchema,
  /** Present when outcome is snapshot. */
  envelope: accessConfigEnvelopeSchema.nullable(),
  publishedRevision: z.number().int().nonnegative().nullable(),
  lastAcknowledgedRevision: z.number().int().nonnegative().nullable(),
  message: z.string().max(CONFIG_SYNC_MAX_STRING_LENGTH).nullable(),
});

export type ConfigPullResponse = z.infer<typeof configPullResponseSchema>;

export const configAckRequestBodySchema = z.strictObject({
  protocolVersion: configProtocolVersionSchema,
  requestId: requestIdSchema,
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  domain: configDomainSchema,
  revision: z.number().int().positive(),
  publicationId: opaqueIdSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: configApplicationResultSchema,
  /** Host-reported wall time; treated as metadata only. */
  appliedAt: absoluteTimestampSchema,
  errorCode: z.string().min(1).max(64).nullable(),
  message: z.string().max(CONFIG_SYNC_MAX_STRING_LENGTH).nullable(),
});

export type ConfigAckRequestBody = z.infer<typeof configAckRequestBodySchema>;

export const configAckResponseSchema = z.strictObject({
  protocolVersion: configProtocolVersionSchema,
  correlationId: requestIdSchema,
  requestId: requestIdSchema,
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  domain: configDomainSchema,
  accepted: z.boolean(),
  publishedRevision: z.number().int().nonnegative().nullable(),
  lastAcknowledgedRevision: z.number().int().nonnegative().nullable(),
  message: z.string().max(CONFIG_SYNC_MAX_STRING_LENGTH).nullable(),
});

export type ConfigAckResponse = z.infer<typeof configAckResponseSchema>;

export const CONFIG_WORKER_STATUS_STATES = [
  "up_to_date",
  "refreshing",
  "waiting_retry",
  "pending_acknowledgement",
  "configuration_required",
  "blocked",
  "expired",
] as const;
export const configWorkerStatusStateSchema = z.enum(CONFIG_WORKER_STATUS_STATES);
export type ConfigWorkerStatusState = z.infer<typeof configWorkerStatusStateSchema>;

export const configWorkerStatusSchema = z.strictObject({
  workerEnabled: z.boolean(),
  sourceReady: z.boolean(),
  state: configWorkerStatusStateSchema,
  domain: configDomainSchema,
  effectiveRevision: z.number().int().nonnegative().nullable(),
  lastSuccessfulRefreshAt: absoluteTimestampSchema.nullable(),
  lastPullAttemptAt: absoluteTimestampSchema.nullable(),
  snapshotValidUntil: absoluteTimestampSchema.nullable(),
  pendingAcknowledgement: z.boolean(),
  pendingAckRevision: z.number().int().positive().nullable(),
  nextRetryAt: absoluteTimestampSchema.nullable(),
  blockingErrorCode: z.string().min(1).max(64).nullable(),
  blockingMessage: z.string().max(500).nullable(),
  configurationMessage: z.string().max(500).nullable(),
});

export type ConfigWorkerStatus = z.infer<typeof configWorkerStatusSchema>;

export const configWorkerRefreshResponseSchema = z.strictObject({
  accepted: z.boolean(),
  status: configWorkerStatusSchema,
  message: z.string().max(500).nullable(),
});

export type ConfigWorkerRefreshResponse = z.infer<typeof configWorkerRefreshResponseSchema>;

/** Owner-facing delivery status for a published access domain. */
export const configDeliveryStatusSchema = z.strictObject({
  domain: configDomainSchema,
  publishedRevision: z.number().int().nonnegative().nullable(),
  lastAcknowledgedRevision: z.number().int().nonnegative().nullable(),
  localApplicationStatus: localApplicationStatusSchema,
  lastAcknowledgementAt: absoluteTimestampSchema.nullable(),
  lastHostDeviceId: deviceIdSchema.nullable(),
  failureCode: z.string().min(1).max(64).nullable(),
  failureMessage: z.string().max(500).nullable(),
});

export type ConfigDeliveryStatus = z.infer<typeof configDeliveryStatusSchema>;
