import {
  syncWorkerStatusSchema,
  type SyncWorkerStatus,
  type SyncWorkerStatusState,
} from "@polivo/contracts";
import {
  countPendingOutboxEvents,
  getMaxOutboxSequence,
  getOldestPendingOutboxOccurredAt,
  tryGetSyncStreamState,
  type LocalDatabase,
} from "@polivo/db-local";

export function buildSyncWorkerStatus(input: {
  database: LocalDatabase;
  stallId: string;
  workerEnabled: boolean;
  sourceReady: boolean;
  uploading: boolean;
  configurationMessage: string | null;
}): SyncWorkerStatus {
  const stream = tryGetSyncStreamState(input.database, input.stallId);
  const pendingEventCount = countPendingOutboxEvents(input.database, input.stallId);
  const oldestPendingOccurredAt = getOldestPendingOutboxOccurredAt(
    input.database,
    input.stallId,
  );
  const localTail =
    stream?.localTailSequence ?? getMaxOutboxSequence(input.database, input.stallId);
  const acknowledgedCursor = stream?.acknowledgedCursor ?? 0;

  let state: SyncWorkerStatusState;
  if (input.configurationMessage || !input.sourceReady) {
    state = "configuration_required";
  } else if (!input.workerEnabled || stream?.workerEnabled === false) {
    state = "paused";
  } else if (stream?.blockingErrorCode) {
    state = "blocked";
  } else if (input.uploading) {
    state = "uploading";
  } else if (stream?.nextRetryAt && Date.parse(stream.nextRetryAt) > Date.now()) {
    state = "waiting_retry";
  } else if (pendingEventCount === 0 && acknowledgedCursor >= localTail) {
    state = "up_to_date";
  } else if (pendingEventCount > 0) {
    state = stream?.nextRetryAt ? "waiting_retry" : "uploading";
  } else {
    state = "up_to_date";
  }

  // Distinct pending groups approximate: use pending events as upper bound when stream blocked.
  const pendingGroupCount = pendingEventCount;

  return syncWorkerStatusSchema.parse({
    workerEnabled: input.workerEnabled && (stream?.workerEnabled ?? true),
    sourceReady: input.sourceReady,
    state,
    pendingEventCount,
    pendingGroupCount,
    oldestPendingOccurredAt,
    lastUploadAttemptAt: stream?.lastUploadAttemptAt ?? null,
    lastAcknowledgedAt: stream?.lastAckAt ?? null,
    acknowledgedCursor: String(acknowledgedCursor),
    localTailSequence: String(localTail),
    localTailMeasuredAt: stream?.localTailMeasuredAt ?? null,
    nextRetryAt: stream?.nextRetryAt ?? null,
    blockingErrorCode: stream?.blockingErrorCode ?? null,
    blockingGroupId: stream?.blockingGroupId ?? null,
    blockingMessage: stream?.blockingMessage ?? null,
    sourceStreamId: stream?.sourceStreamId ?? null,
    streamGeneration: stream?.streamGeneration ?? null,
    configurationMessage: input.configurationMessage,
  });
}
