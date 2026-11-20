import {
  syncDiagnosticExportResponseSchema,
  type SyncDiagnosticExportResponse,
} from "@polivo/contracts";
import {
  appendAuditEvent,
  insertDiagnosticExport,
  listRecentRecoveryJobs,
  tryGetLatestReconciliationRun,
  tryGetSyncStreamState,
  type LocalDatabase,
} from "@polivo/db-local";

import { buildWorkspaceStatus } from "./workspace.js";
import type { ConfigWorkerHandle } from "../../config-sync/worker.js";
import type { SyncWorkerHandle } from "../worker.js";
import { sha256HexOfUtf8 } from "./hash.js";

export function createDiagnosticExport(input: {
  database: LocalDatabase;
  stallId: string;
  staffId: string;
  deviceId: string;
  createId: () => string;
  now: () => string;
  syncWorker: SyncWorkerHandle | null;
  configWorker: ConfigWorkerHandle | null;
  appVersion?: string;
}): SyncDiagnosticExportResponse {
  const createdAt = input.now();
  const expiresAt = new Date(Date.parse(createdAt) + 60 * 60 * 1000).toISOString();
  const stream = tryGetSyncStreamState(input.database, input.stallId);
  const workspace = buildWorkspaceStatus({
    database: input.database,
    stallId: input.stallId,
    syncWorker: input.syncWorker,
    configWorker: input.configWorker,
    now: input.now,
  });
  const latestRun = tryGetLatestReconciliationRun(input.database, input.stallId);
  const jobs = listRecentRecoveryJobs(input.database, input.stallId, 20);

  const bundle = {
    schema: "polivo-sync-diagnostics-v1",
    exportedAt: createdAt,
    applicationVersion: input.appVersion ?? "unknown",
    syncManifestVersion: "sync-manifest-v1",
    stream: {
      sourceStreamId: stream?.sourceStreamId ?? null,
      streamGeneration: stream?.streamGeneration ?? null,
      acknowledgedCursor: stream?.acknowledgedCursor ?? null,
      localTailSequence: stream?.localTailSequence ?? null,
      localTailMeasuredAt: stream?.localTailMeasuredAt ?? null,
    },
    upload: {
      state: workspace.upload.state,
      pendingEventCount: workspace.upload.pendingEventCount,
      blockingErrorCode: workspace.upload.blockingErrorCode,
      blockingGroupId: workspace.upload.blockingGroupId,
      lastUploadAttemptAt: workspace.upload.lastUploadAttemptAt,
      lastAcknowledgedAt: workspace.upload.lastAcknowledgedAt,
    },
    configuration: {
      state: workspace.configuration.state,
      effectiveRevision: workspace.configuration.effectiveRevision,
      pendingAcknowledgement: workspace.configuration.pendingAcknowledgement,
      pendingAckRevision: workspace.configuration.pendingAckRevision,
      snapshotValidUntil: workspace.configuration.snapshotValidUntil,
      blockingErrorCode: workspace.configuration.blockingErrorCode,
    },
    reconciliation: latestRun
      ? {
          runId: latestRun.id,
          state: latestRun.state,
          summaryPhrase: latestRun.summaryPhrase,
          comparableCutoff: latestRun.comparableCutoff,
          safeNextAction: latestRun.safeNextAction,
          completedAt: latestRun.completedAt,
        }
      : null,
    recoveryJobs: jobs.map((job) => ({
      jobId: job.id,
      actionType: job.actionType,
      state: job.state,
      errorCode: job.errorCode,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      resultSummary: job.resultSummary,
    })),
    redaction: {
      excluded: [
        "private_keys",
        "session_secrets",
        "authorization_headers",
        "password_hashes",
        "full_financial_payloads",
        "party_pii",
        "environment_dumps",
      ],
    },
  };

  const contentJson = JSON.stringify(bundle, null, 2);
  const contentSha256 = sha256HexOfUtf8(contentJson);
  const exportId = input.createId();
  const defaultFileName = `polivo-sync-diagnostics-${createdAt.replace(/[:.]/g, "-")}.json`;

  insertDiagnosticExport(input.database, {
    id: exportId,
    stallId: input.stallId,
    defaultFileName,
    contentSha256,
    byteLength: Buffer.byteLength(contentJson, "utf8"),
    contentJson,
    createdByStaffId: input.staffId,
    createdByDeviceId: input.deviceId,
    createOperationId: input.createId(),
    createdAt,
    expiresAt,
  });

  appendAuditEvent(input.database, {
    id: input.createId(),
    stallId: input.stallId,
    actorRef: input.staffId,
    deviceRef: input.deviceId,
    action: "sync.diagnostic_export_created",
    targetType: "sync_diagnostic_export",
    targetId: exportId,
    occurredAt: createdAt,
    changeDetailsJson: JSON.stringify({ contentSha256, byteLength: Buffer.byteLength(contentJson, "utf8") }),
  });

  return syncDiagnosticExportResponseSchema.parse({
    exportId,
    defaultFileName,
    contentType: "application/json",
    contentSha256,
    byteLength: Buffer.byteLength(contentJson, "utf8"),
    createdAt,
    expiresAt,
  });
}
