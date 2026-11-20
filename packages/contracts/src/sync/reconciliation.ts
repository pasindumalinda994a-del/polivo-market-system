import { z } from "zod";

import { absoluteTimestampSchema, opaqueIdSchema, requestIdSchema } from "../primitives.js";
import { syncSequenceStringSchema } from "./ingest.js";
import { syncWorkerStatusSchema } from "./status.js";
import { configWorkerStatusSchema } from "../config/access.js";

/** Canonical manifest version for Phase 34 sync comparison. */
export const SYNC_MANIFEST_VERSION = "sync-manifest-v1" as const;
export const syncManifestVersionSchema = z.literal(SYNC_MANIFEST_VERSION);
export type SyncManifestVersion = z.infer<typeof syncManifestVersionSchema>;

export const SYNC_RECONCILIATION_DEFINITION_VERSION = "sync-reconcile-defs-v1" as const;
export const syncReconciliationDefinitionVersionSchema = z.literal(
  SYNC_RECONCILIATION_DEFINITION_VERSION,
);

export const SYNC_MISMATCH_CATEGORIES = [
  "expected_upload_backlog",
  "missing_cloud_receipt",
  "missing_local_acknowledgement",
  "missing_cloud_fact",
  "different_immutable_payload",
  "missing_relationship",
  "stale_projection",
  "unsupported_comparison_version",
  "incomplete_source_history",
  "stream_generation_conflict",
  "configuration_application_pending",
  "configuration_acknowledgement_pending",
  "access_snapshot_expired",
  "remote_state_unavailable",
] as const;
export const syncMismatchCategorySchema = z.enum(SYNC_MISMATCH_CATEGORIES);
export type SyncMismatchCategory = z.infer<typeof syncMismatchCategorySchema>;

export const SYNC_COMPARISON_CHECK_KINDS = ["delivery", "data", "reporting"] as const;
export const syncComparisonCheckKindSchema = z.enum(SYNC_COMPARISON_CHECK_KINDS);
export type SyncComparisonCheckKind = z.infer<typeof syncComparisonCheckKindSchema>;

export const SYNC_COMPARISON_COMPLETENESS = ["complete", "limited", "inconclusive"] as const;
export const syncComparisonCompletenessSchema = z.enum(SYNC_COMPARISON_COMPLETENESS);
export type SyncComparisonCompleteness = z.infer<typeof syncComparisonCompletenessSchema>;

export const SYNC_RECONCILIATION_DOMAINS = [
  "opening_balances",
  "sales_and_lines",
  "commission_snapshots",
  "buyer_farmer_bill_links",
  "ledger_entries",
  "payments",
  "allocations_and_releases",
  "corrections_and_reversals",
  "reporting_totals",
] as const;
export const syncReconciliationDomainSchema = z.enum(SYNC_RECONCILIATION_DOMAINS);
export type SyncReconciliationDomain = z.infer<typeof syncReconciliationDomainSchema>;

export const SYNC_RECOVERY_ACTION_TYPES = [
  "retry_upload_worker",
  "replay_original_events",
  "recover_local_acknowledgement",
  "refresh_configuration",
  "retry_configuration_application",
  "retry_configuration_acknowledgement",
] as const;
export const syncRecoveryActionTypeSchema = z.enum(SYNC_RECOVERY_ACTION_TYPES);
export type SyncRecoveryActionType = z.infer<typeof syncRecoveryActionTypeSchema>;

export const SYNC_RECOVERY_JOB_STATES = [
  "requested",
  "running",
  "completed",
  "failed",
  "cancelled",
  "outcome_uncertain",
] as const;
export const syncRecoveryJobStateSchema = z.enum(SYNC_RECOVERY_JOB_STATES);
export type SyncRecoveryJobState = z.infer<typeof syncRecoveryJobStateSchema>;

export const SYNC_RECONCILIATION_RUN_STATES = [
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export const syncReconciliationRunStateSchema = z.enum(SYNC_RECONCILIATION_RUN_STATES);
export type SyncReconciliationRunState = z.infer<typeof syncReconciliationRunStateSchema>;

export const syncObservedRemoteValueSchema = z.strictObject({
  value: z.string().max(128).nullable(),
  observedAt: absoluteTimestampSchema.nullable(),
});
export type SyncObservedRemoteValue = z.infer<typeof syncObservedRemoteValueSchema>;

export const syncOperationalUploadStatusSchema = syncWorkerStatusSchema.extend({
  verifiedCloudCursor: syncObservedRemoteValueSchema.optional(),
  firstBlockingGroupId: opaqueIdSchema.nullable().optional(),
  firstBlockingErrorCode: z.string().min(1).max(64).nullable().optional(),
});
export type SyncOperationalUploadStatus = z.infer<typeof syncOperationalUploadStatusSchema>;

export const syncConfigurationAccessStatusSchema = configWorkerStatusSchema.extend({
  publishedRevision: z.number().int().nonnegative().nullable().optional(),
  publishedRevisionObservedAt: absoluteTimestampSchema.nullable().optional(),
  downloadedRevision: z.number().int().nonnegative().nullable().optional(),
  cloudAcknowledgedRevision: z.number().int().nonnegative().nullable().optional(),
  cloudAcknowledgedRevisionObservedAt: absoluteTimestampSchema.nullable().optional(),
});
export type SyncConfigurationAccessStatus = z.infer<typeof syncConfigurationAccessStatusSchema>;

export const syncMismatchSummaryItemSchema = z.strictObject({
  category: syncMismatchCategorySchema,
  checkKind: syncComparisonCheckKindSchema,
  domain: syncReconciliationDomainSchema.nullable(),
  observed: z.string().max(500),
  scopeDescription: z.string().max(500),
  affectsLocalOperation: z.boolean(),
  automaticRetryAppropriate: z.boolean(),
  availableAction: syncRecoveryActionTypeSchema.nullable(),
  supportWorkflowRequired: z.boolean(),
});
export type SyncMismatchSummaryItem = z.infer<typeof syncMismatchSummaryItemSchema>;

export const syncReconciliationCutoffSchema = z.strictObject({
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  localCommittedTail: syncSequenceStringSchema,
  verifiedCloudCursor: syncSequenceStringSchema.nullable(),
  comparableCutoff: syncSequenceStringSchema,
  manifestVersion: syncManifestVersionSchema,
  definitionVersion: syncReconciliationDefinitionVersionSchema,
});
export type SyncReconciliationCutoff = z.infer<typeof syncReconciliationCutoffSchema>;

export const syncDomainComparisonResultSchema = z.strictObject({
  domain: syncReconciliationDomainSchema,
  checkKind: syncComparisonCheckKindSchema,
  completeness: syncComparisonCompletenessSchema,
  matched: z.boolean(),
  localCount: z.number().int().nonnegative().nullable(),
  cloudCount: z.number().int().nonnegative().nullable(),
  localManifestHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  cloudManifestHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  inconclusiveReason: z.string().max(500).nullable(),
  differences: z.array(z.string().max(500)).max(50),
});
export type SyncDomainComparisonResult = z.infer<typeof syncDomainComparisonResultSchema>;

export const syncReconciliationRunSummarySchema = z.strictObject({
  runId: opaqueIdSchema,
  state: syncReconciliationRunStateSchema,
  scope: z.string().max(200),
  cutoff: syncReconciliationCutoffSchema.nullable(),
  startedAt: absoluteTimestampSchema,
  completedAt: absoluteTimestampSchema.nullable(),
  matchedDomains: z.array(syncReconciliationDomainSchema),
  incompleteDomainWarnings: z.array(z.string().max(500)),
  mismatches: z.array(syncMismatchSummaryItemSchema),
  domainResults: z.array(syncDomainComparisonResultSchema),
  safeNextAction: syncRecoveryActionTypeSchema.nullable(),
  summaryPhrase: z.string().max(500),
});
export type SyncReconciliationRunSummary = z.infer<typeof syncReconciliationRunSummarySchema>;

export const syncPendingBlockedItemSchema = z.strictObject({
  transactionGroupId: opaqueIdSchema,
  eventType: z.string().min(1).max(128),
  sourceReference: z.string().max(200),
  recordedAt: absoluteTimestampSchema,
  attemptCount: z.number().int().nonnegative(),
  errorCategory: syncMismatchCategorySchema.nullable(),
  errorCode: z.string().min(1).max(64).nullable(),
  nextEligibleRetryAt: absoluteTimestampSchema.nullable(),
  recommendedAction: syncRecoveryActionTypeSchema.nullable(),
  blocked: z.boolean(),
});
export type SyncPendingBlockedItem = z.infer<typeof syncPendingBlockedItemSchema>;

export const syncWorkspaceStatusSchema = z.strictObject({
  upload: syncOperationalUploadStatusSchema,
  configuration: syncConfigurationAccessStatusSchema,
  reconciliation: syncReconciliationRunSummarySchema.nullable(),
  pendingBlocked: z.array(syncPendingBlockedItemSchema).max(100),
  localObservedAt: absoluteTimestampSchema,
  hasUnresolvedIntegrityConflict: z.boolean(),
  accessSnapshotExpired: z.boolean(),
  overallHealthy: z.boolean(),
});
export type SyncWorkspaceStatus = z.infer<typeof syncWorkspaceStatusSchema>;

export const syncReconciliationRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  includeReporting: z.boolean().default(true),
  maxGroups: z.number().int().positive().max(500).default(200),
});
export type SyncReconciliationRequest = z.infer<typeof syncReconciliationRequestSchema>;

export const syncReconciliationResponseSchema = z.strictObject({
  run: syncReconciliationRunSummarySchema,
});
export type SyncReconciliationResponse = z.infer<typeof syncReconciliationResponseSchema>;

export const syncRecoveryPlanSchema = z.strictObject({
  planId: opaqueIdSchema,
  actionType: syncRecoveryActionTypeSchema,
  targetStreamId: opaqueIdSchema.nullable(),
  targetConfigDomain: z.literal("access").nullable(),
  eventGroupRange: z
    .strictObject({
      fromSequence: syncSequenceStringSchema,
      toSequence: syncSequenceStringSchema,
      groupIds: z.array(opaqueIdSchema).max(100),
    })
    .nullable(),
  configurationRevision: z.number().int().positive().nullable(),
  expectedStateFingerprint: z.string().min(1).max(128),
  affectedItemCount: z.number().int().nonnegative(),
  safetyRationale: z.string().min(1).max(1000),
  potentialOutcome: z.string().min(1).max(1000),
  requiredCapability: z.enum([
    "sync.retry",
    "sync.recover",
  ]),
  createdAt: absoluteTimestampSchema,
  expiresAt: absoluteTimestampSchema,
});
export type SyncRecoveryPlan = z.infer<typeof syncRecoveryPlanSchema>;

export const syncRecoveryPlanRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  actionType: syncRecoveryActionTypeSchema,
  groupIds: z.array(opaqueIdSchema).max(100).optional(),
  configurationRevision: z.number().int().positive().optional(),
});
export type SyncRecoveryPlanRequest = z.infer<typeof syncRecoveryPlanRequestSchema>;

export const syncRecoveryPlanResponseSchema = z.strictObject({
  plan: syncRecoveryPlanSchema,
});
export type SyncRecoveryPlanResponse = z.infer<typeof syncRecoveryPlanResponseSchema>;

export const syncRecoveryExecuteRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  planId: opaqueIdSchema,
  idempotencyKey: opaqueIdSchema,
  confirm: z.literal(true),
});
export type SyncRecoveryExecuteRequest = z.infer<typeof syncRecoveryExecuteRequestSchema>;

export const syncRecoveryJobSchema = z.strictObject({
  jobId: opaqueIdSchema,
  planId: opaqueIdSchema,
  actionType: syncRecoveryActionTypeSchema,
  state: syncRecoveryJobStateSchema,
  actorStaffId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  scopeDescription: z.string().max(500),
  progressMessage: z.string().max(500).nullable(),
  resultSummary: z.string().max(1000).nullable(),
  errorCode: z.string().min(1).max(64).nullable(),
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
  completedAt: absoluteTimestampSchema.nullable(),
});
export type SyncRecoveryJob = z.infer<typeof syncRecoveryJobSchema>;

export const syncRecoveryExecuteResponseSchema = z.strictObject({
  job: syncRecoveryJobSchema,
  workspace: syncWorkspaceStatusSchema.optional(),
});
export type SyncRecoveryExecuteResponse = z.infer<typeof syncRecoveryExecuteResponseSchema>;

export const syncRecoveryCancelRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  jobId: opaqueIdSchema,
});
export type SyncRecoveryCancelRequest = z.infer<typeof syncRecoveryCancelRequestSchema>;

export const syncRecoveryCancelResponseSchema = z.strictObject({
  job: syncRecoveryJobSchema,
});
export type SyncRecoveryCancelResponse = z.infer<typeof syncRecoveryCancelResponseSchema>;

export const syncDiagnosticExportRequestSchema = z.strictObject({
  requestId: requestIdSchema,
});
export type SyncDiagnosticExportRequest = z.infer<typeof syncDiagnosticExportRequestSchema>;

export const syncDiagnosticExportResponseSchema = z.strictObject({
  exportId: opaqueIdSchema,
  defaultFileName: z.string().min(1).max(200),
  contentType: z.literal("application/json"),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  createdAt: absoluteTimestampSchema,
  expiresAt: absoluteTimestampSchema,
});
export type SyncDiagnosticExportResponse = z.infer<typeof syncDiagnosticExportResponseSchema>;

/** Host-authenticated cloud stream progress (read). */
export const syncCloudProgressResponseSchema = z.strictObject({
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  committedCursor: syncSequenceStringSchema,
  observedAt: absoluteTimestampSchema,
  stallId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
});
export type SyncCloudProgressResponse = z.infer<typeof syncCloudProgressResponseSchema>;

export const syncCloudReceiptLookupRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  groupIds: z.array(opaqueIdSchema).min(1).max(100).optional(),
  fromSequence: syncSequenceStringSchema.optional(),
  toSequence: syncSequenceStringSchema.optional(),
  limit: z.number().int().positive().max(200).default(100),
});
export type SyncCloudReceiptLookupRequest = z.infer<typeof syncCloudReceiptLookupRequestSchema>;

export const syncCloudReceiptSchema = z.strictObject({
  transactionGroupId: opaqueIdSchema,
  minSequence: syncSequenceStringSchema,
  maxSequence: syncSequenceStringSchema,
  eventIds: z.array(opaqueIdSchema),
  eventPayloadHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  appliedAt: absoluteTimestampSchema,
});
export type SyncCloudReceipt = z.infer<typeof syncCloudReceiptSchema>;

export const syncCloudReceiptLookupResponseSchema = z.strictObject({
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  observedAt: absoluteTimestampSchema,
  receipts: z.array(syncCloudReceiptSchema),
  truncated: z.boolean(),
});
export type SyncCloudReceiptLookupResponse = z.infer<typeof syncCloudReceiptLookupResponseSchema>;

/** Owner-facing cloud-observable sync visibility (no local authority claims). */
export const syncOwnerCloudVisibilitySchema = z.strictObject({
  lastHostContactAt: absoluteTimestampSchema.nullable(),
  lastAppliedUploadGroupId: opaqueIdSchema.nullable(),
  lastAppliedUploadAt: absoluteTimestampSchema.nullable(),
  reportedLocalTail: syncObservedRemoteValueSchema.nullable(),
  committedCloudCursor: syncObservedRemoteValueSchema.nullable(),
  lastConfigApplicationAckAt: absoluteTimestampSchema.nullable(),
  pendingPublishedConfigRevision: z.number().int().nonnegative().nullable(),
  note: z.string().max(500),
});
export type SyncOwnerCloudVisibility = z.infer<typeof syncOwnerCloudVisibilitySchema>;
