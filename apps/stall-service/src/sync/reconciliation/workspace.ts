import {
  syncWorkspaceStatusSchema,
  type SyncPendingBlockedItem,
  type SyncReconciliationRunSummary,
  type SyncWorkspaceStatus,
} from "@polivo/contracts";
import {
  classifyDeliveryObservation,
} from "@polivo/domain";
import {
  listPendingBlockedOutboxGroups,
  tryGetLatestReconciliationRun,
  type LocalDatabase,
} from "@polivo/db-local";

import { buildConfigWorkerStatus } from "../../config-sync/status.js";
import type { ConfigWorkerHandle } from "../../config-sync/worker.js";
import type { SyncWorkerHandle } from "../worker.js";

export function buildWorkspaceStatus(input: {
  database: LocalDatabase;
  stallId: string;
  syncWorker: SyncWorkerHandle | null;
  configWorker: ConfigWorkerHandle | null;
  now: () => string;
  verifiedCloudCursor?: { value: string | null; observedAt: string | null } | null;
}): SyncWorkspaceStatus {
  const upload = input.syncWorker
    ? input.syncWorker.getStatus()
    : {
        workerEnabled: false,
        sourceReady: false,
        state: "configuration_required" as const,
        pendingEventCount: 0,
        pendingGroupCount: 0,
        oldestPendingOccurredAt: null,
        lastUploadAttemptAt: null,
        lastAcknowledgedAt: null,
        acknowledgedCursor: "0",
        localTailSequence: "0",
        localTailMeasuredAt: null,
        nextRetryAt: null,
        blockingErrorCode: null,
        blockingGroupId: null,
        blockingMessage: null,
        sourceStreamId: null,
        streamGeneration: null,
        configurationMessage: "Sync worker is not available.",
      };

  const configuration = input.configWorker
    ? input.configWorker.getStatus()
    : buildConfigWorkerStatus({
        database: input.database,
        workerEnabled: false,
        sourceReady: false,
        refreshing: false,
        configurationMessage: "Configuration worker is not available.",
        nextRetryAt: null,
      });

  const pending = listPendingBlockedOutboxGroups(input.database, input.stallId, 100);
  const pendingBlocked: SyncPendingBlockedItem[] = pending.map((item) => {
    const category = classifyDeliveryObservation({
      localAcked: false,
      cloudReceiptPresent: false,
      localPendingUpload: !item.blocked,
      payloadHashMatches: null,
      streamGenerationMismatch: false,
      remoteUnavailable: false,
    });
    return {
      transactionGroupId: item.transactionGroupId,
      eventType: item.eventType,
      sourceReference: item.sourceReference,
      recordedAt: item.recordedAt,
      attemptCount: item.attemptCount,
      errorCategory: item.blocked ? "different_immutable_payload" : category,
      errorCode: item.errorCode,
      nextEligibleRetryAt: item.nextEligibleRetryAt,
      recommendedAction: item.blocked ? null : "retry_upload_worker",
      blocked: item.blocked,
    };
  });

  const latest = tryGetLatestReconciliationRun(input.database, input.stallId);
  let reconciliation: SyncReconciliationRunSummary | null = null;
  if (latest?.summaryJson) {
    try {
      reconciliation = JSON.parse(latest.summaryJson) as SyncReconciliationRunSummary;
    } catch {
      reconciliation = null;
    }
  }

  const accessSnapshotExpired = configuration.state === "expired";
  const hasUnresolvedIntegrityConflict =
    Boolean(upload.blockingErrorCode) ||
    Boolean(
      reconciliation?.mismatches.some(
        (m) =>
          m.category === "different_immutable_payload" ||
          m.category === "stream_generation_conflict",
      ),
    );

  const overallHealthy =
    !accessSnapshotExpired &&
    !hasUnresolvedIntegrityConflict &&
    upload.state !== "blocked" &&
    configuration.state !== "blocked" &&
    (reconciliation == null ||
      reconciliation.mismatches.every((m) => m.category === "expected_upload_backlog"));

  return syncWorkspaceStatusSchema.parse({
    upload: {
      ...upload,
      verifiedCloudCursor: input.verifiedCloudCursor
        ? {
            value: input.verifiedCloudCursor.value,
            observedAt: input.verifiedCloudCursor.observedAt,
          }
        : undefined,
      firstBlockingGroupId: upload.blockingGroupId,
      firstBlockingErrorCode: upload.blockingErrorCode,
    },
    configuration: {
      ...configuration,
      publishedRevision: null,
      publishedRevisionObservedAt: null,
      downloadedRevision: configuration.effectiveRevision,
      cloudAcknowledgedRevision: null,
      cloudAcknowledgedRevisionObservedAt: null,
    },
    reconciliation,
    pendingBlocked,
    localObservedAt: input.now(),
    hasUnresolvedIntegrityConflict,
    accessSnapshotExpired,
    overallHealthy,
  });
}
