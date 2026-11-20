import { configWorkerStatusSchema, type ConfigWorkerStatus } from "@polivo/contracts";
import { getConfigDomainState, type LocalDatabase } from "@polivo/db-local";

export function buildConfigWorkerStatus(input: {
  database: LocalDatabase;
  workerEnabled: boolean;
  sourceReady: boolean;
  refreshing: boolean;
  configurationMessage: string | null;
  nextRetryAt: string | null;
}): ConfigWorkerStatus {
  const state = getConfigDomainState(input.database, "access");
  let workerState: ConfigWorkerStatus["state"] = "up_to_date";
  let snapshotValidUntil: string | null = null;

  if (state.issuedAt != null && state.maxSnapshotAgeMs != null) {
    const issuedMs = Date.parse(state.issuedAt);
    if (Number.isFinite(issuedMs)) {
      snapshotValidUntil = new Date(issuedMs + state.maxSnapshotAgeMs).toISOString();
      if (Date.now() >= issuedMs + state.maxSnapshotAgeMs) {
        workerState = "expired";
      }
    }
  }

  if (!input.sourceReady || input.configurationMessage) {
    workerState = "configuration_required";
  } else if (state.blockErrorCode) {
    workerState = "blocked";
  } else if (input.refreshing) {
    workerState = "refreshing";
  } else if (state.pendingAck) {
    workerState = "pending_acknowledgement";
  } else if (input.nextRetryAt) {
    workerState = "waiting_retry";
  }

  return configWorkerStatusSchema.parse({
    workerEnabled: input.workerEnabled,
    sourceReady: input.sourceReady,
    state: workerState,
    domain: "access",
    effectiveRevision: state.effectiveRevision,
    lastSuccessfulRefreshAt: state.lastSuccessfulRefreshAt,
    lastPullAttemptAt: state.lastPullAttemptAt,
    snapshotValidUntil,
    pendingAcknowledgement: state.pendingAck,
    pendingAckRevision: state.pendingAckRevision,
    nextRetryAt: input.nextRetryAt,
    blockingErrorCode: state.blockErrorCode,
    blockingMessage: state.blockMessage,
    configurationMessage: input.configurationMessage,
  });
}
