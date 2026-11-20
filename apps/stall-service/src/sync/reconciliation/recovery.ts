import {
  syncRecoveryJobSchema,
  syncRecoveryPlanSchema,
  type SyncRecoveryActionType,
  type SyncRecoveryJob,
  type SyncRecoveryPlan,
} from "@polivo/contracts";
import {
  appendAuditEvent,
  getRecoveryJobById,
  getRecoveryPlanById,
  insertRecoveryJob,
  insertRecoveryPlan,
  listOutboxGroupsThroughSequence,
  markRecoveryPlanConsumed,
  releaseRecoveryDomainLock,
  tryAcquireRecoveryDomainLock,
  tryGetRecoveryJobByIdempotency,
  tryGetSyncStreamState,
  updateRecoveryJobState,
  type LocalDatabase,
} from "@polivo/db-local";

import type { ConfigWorkerHandle } from "../../config-sync/worker.js";
import type { SyncWorkerHandle } from "../worker.js";
import type { ReconciliationCloudClient } from "./cloud-client.js";
import { sha256HexOfCanonical } from "./hash.js";

const PLAN_TTL_MS = 15 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;

export function createRecoveryPlan(input: {
  database: LocalDatabase;
  stallId: string;
  actionType: SyncRecoveryActionType;
  groupIds?: string[];
  configurationRevision?: number;
  staffId: string;
  deviceId: string;
  createId: () => string;
  now: () => string;
}): SyncRecoveryPlan {
  const createdAt = input.now();
  const expiresAt = new Date(Date.parse(createdAt) + PLAN_TTL_MS).toISOString();
  const stream = tryGetSyncStreamState(input.database, input.stallId);

  let affectedItemCount = 0;
  let eventGroupRange: SyncRecoveryPlan["eventGroupRange"] = null;
  let safetyRationale = "";
  let potentialOutcome = "";
  let requiredCapability: "sync.retry" | "sync.recover" = "sync.recover";
  let targetStreamId: string | null = stream?.sourceStreamId ?? null;
  let targetConfigDomain: "access" | null = null;

  switch (input.actionType) {
    case "retry_upload_worker": {
      requiredCapability = "sync.retry";
      affectedItemCount = 1;
      safetyRationale =
        "Wakes the existing Phase 32 outbox worker without starting a second loop or bypassing integrity blocks.";
      potentialOutcome = "Pending groups resume upload under normal ownership and throttling.";
      break;
    }
    case "replay_original_events":
    case "recover_local_acknowledgement": {
      const groups = listOutboxGroupsThroughSequence(
        input.database,
        input.stallId,
        stream?.localTailSequence ?? 0,
      ).filter((g) =>
        input.groupIds?.length ? input.groupIds.includes(g.transactionGroupId) : g.ackState !== "acknowledged",
      );
      const selected = groups.slice(0, 100);
      affectedItemCount = selected.length;
      eventGroupRange = {
        fromSequence: String(selected[0]?.minSequence ?? 0),
        toSequence: String(selected[selected.length - 1]?.maxSequence ?? 0),
        groupIds: selected.map((g) => g.transactionGroupId),
      };
      safetyRationale =
        input.actionType === "replay_original_events"
          ? "Replays original immutable event identities through normal ingestion; Phase 31 rejects duplicates."
          : "Repairs missing local acknowledgements only from verified matching cloud receipts or normal replay.";
      potentialOutcome =
        input.actionType === "replay_original_events"
          ? "Missing cloud application may complete without new event IDs."
          : "Local acknowledgement advances from verified cloud evidence without new financial operations.";
      break;
    }
    case "refresh_configuration": {
      requiredCapability = "sync.retry";
      targetStreamId = null;
      targetConfigDomain = "access";
      affectedItemCount = 1;
      safetyRationale =
        "Refreshes published access configuration through the Phase 33 worker without extending snapshot expiry.";
      potentialOutcome = "Host downloads the latest published revision if available.";
      break;
    }
    case "retry_configuration_application":
    case "retry_configuration_acknowledgement": {
      targetStreamId = null;
      targetConfigDomain = "access";
      affectedItemCount = 1;
      safetyRationale =
        input.actionType === "retry_configuration_application"
          ? "Retries application of the same validated revision atomically without rolling back to an older revision."
          : "Retries acknowledgement only; does not treat a repeated ack as another application.";
      potentialOutcome =
        input.actionType === "retry_configuration_application"
          ? "Pending revision applies once if still valid."
          : "Cloud receives acknowledgement for an already-applied revision.";
      break;
    }
    default: {
      const _exhaustive: never = input.actionType;
      throw new Error(`Unsupported recovery action: ${_exhaustive}`);
    }
  }

  const expectedStateFingerprint = sha256HexOfCanonical({
    actionType: input.actionType,
    streamId: targetStreamId,
    generation: stream?.streamGeneration ?? null,
    ackCursor: stream?.acknowledgedCursor ?? null,
    localTail: stream?.localTailSequence ?? null,
    groupIds: eventGroupRange?.groupIds ?? [],
    configurationRevision: input.configurationRevision ?? null,
  });

  const planId = input.createId();
  const plan = syncRecoveryPlanSchema.parse({
    planId,
    actionType: input.actionType,
    targetStreamId,
    targetConfigDomain,
    eventGroupRange,
    configurationRevision: input.configurationRevision ?? null,
    expectedStateFingerprint,
    affectedItemCount,
    safetyRationale,
    potentialOutcome,
    requiredCapability,
    createdAt,
    expiresAt,
  });

  insertRecoveryPlan(input.database, {
    id: planId,
    stallId: input.stallId,
    actionType: plan.actionType,
    targetStreamId: plan.targetStreamId,
    targetConfigDomain: plan.targetConfigDomain,
    eventGroupRangeJson: plan.eventGroupRange ? JSON.stringify(plan.eventGroupRange) : null,
    configurationRevision: plan.configurationRevision,
    expectedStateFingerprint: plan.expectedStateFingerprint,
    affectedItemCount: plan.affectedItemCount,
    safetyRationale: plan.safetyRationale,
    potentialOutcome: plan.potentialOutcome,
    requiredCapability: plan.requiredCapability,
    planJson: JSON.stringify(plan),
    createdAt,
    expiresAt,
    createdByStaffId: input.staffId,
    createdByDeviceId: input.deviceId,
  });

  appendAuditEvent(input.database, {
    id: input.createId(),
    stallId: input.stallId,
    actorRef: input.staffId,
    deviceRef: input.deviceId,
    action: "sync.recovery_plan_created",
    targetType: "sync_recovery_plan",
    targetId: planId,
    occurredAt: createdAt,
    changeDetailsJson: JSON.stringify({
      actionType: plan.actionType,
      affectedItemCount: plan.affectedItemCount,
    }),
  });

  return plan;
}

export async function executeRecoveryPlan(input: {
  database: LocalDatabase;
  stallId: string;
  planId: string;
  idempotencyKey: string;
  staffId: string;
  deviceId: string;
  createId: () => string;
  now: () => string;
  syncWorker: SyncWorkerHandle | null;
  configWorker: ConfigWorkerHandle | null;
  cloud: ReconciliationCloudClient;
}): Promise<SyncRecoveryJob> {
  const existing = tryGetRecoveryJobByIdempotency(
    input.database,
    input.stallId,
    input.idempotencyKey,
  );
  if (existing) {
    return syncRecoveryJobSchema.parse({
      jobId: existing.id,
      planId: existing.planId,
      actionType: existing.actionType,
      state: existing.state,
      actorStaffId: existing.actorStaffId,
      deviceId: existing.deviceId,
      scopeDescription: existing.scopeDescription,
      progressMessage: existing.progressMessage,
      resultSummary: existing.resultSummary,
      errorCode: existing.errorCode,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      completedAt: existing.completedAt,
    });
  }

  const planRow = getRecoveryPlanById(input.database, input.planId);
  if (planRow.consumedAt) {
    throw Object.assign(new Error("Recovery plan was already consumed."), {
      code: "PLAN_CONSUMED",
    });
  }
  if (Date.parse(planRow.expiresAt) <= Date.parse(input.now())) {
    throw Object.assign(new Error("Recovery plan has expired."), { code: "PLAN_EXPIRED" });
  }

  const plan = syncRecoveryPlanSchema.parse(JSON.parse(planRow.planJson));
  const stream = tryGetSyncStreamState(input.database, input.stallId);
  const currentFingerprint = sha256HexOfCanonical({
    actionType: plan.actionType,
    streamId: plan.targetStreamId,
    generation: stream?.streamGeneration ?? null,
    ackCursor: stream?.acknowledgedCursor ?? null,
    localTail: stream?.localTailSequence ?? null,
    groupIds: plan.eventGroupRange?.groupIds ?? [],
    configurationRevision: plan.configurationRevision,
  });
  if (currentFingerprint !== plan.expectedStateFingerprint) {
    throw Object.assign(new Error("Recovery plan is stale; relevant state changed."), {
      code: "PLAN_STALE",
    });
  }

  const now = input.now();
  const jobId = input.createId();
  const domainKey = `${plan.actionType}:${plan.targetStreamId ?? plan.targetConfigDomain ?? "default"}`;
  const locked = tryAcquireRecoveryDomainLock(input.database, {
    stallId: input.stallId,
    domainKey,
    jobId,
    acquiredAt: now,
    expiresAt: new Date(Date.parse(now) + LOCK_TTL_MS).toISOString(),
  });
  if (!locked) {
    throw Object.assign(new Error("A conflicting recovery job is already running."), {
      code: "RECOVERY_CONFLICT",
    });
  }

  markRecoveryPlanConsumed(input.database, plan.planId, jobId, now);
  insertRecoveryJob(input.database, {
    id: jobId,
    stallId: input.stallId,
    planId: plan.planId,
    actionType: plan.actionType,
    actorStaffId: input.staffId,
    deviceId: input.deviceId,
    scopeDescription: plan.safetyRationale.slice(0, 500),
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
  });

  appendAuditEvent(input.database, {
    id: input.createId(),
    stallId: input.stallId,
    actorRef: input.staffId,
    deviceRef: input.deviceId,
    action: "sync.recovery_job_started",
    targetType: "sync_recovery_job",
    targetId: jobId,
    occurredAt: now,
    changeDetailsJson: JSON.stringify({ planId: plan.planId, actionType: plan.actionType }),
  });

  updateRecoveryJobState(input.database, {
    id: jobId,
    state: "running",
    progressMessage: "Executing bounded recovery action.",
    updatedAt: input.now(),
  });

  try {
    const resultSummary = await performAction({
      ...input,
      plan,
    });
    const completedAt = input.now();
    const job = updateRecoveryJobState(input.database, {
      id: jobId,
      state: "completed",
      progressMessage: "Completed.",
      resultSummary,
      updatedAt: completedAt,
      completedAt,
    });
    appendAuditEvent(input.database, {
      id: input.createId(),
      stallId: input.stallId,
      actorRef: input.staffId,
      deviceRef: input.deviceId,
      action: "sync.recovery_job_completed",
      targetType: "sync_recovery_job",
      targetId: jobId,
      occurredAt: completedAt,
      changeDetailsJson: JSON.stringify({ resultSummary }),
    });
    releaseRecoveryDomainLock(input.database, input.stallId, domainKey, jobId);
    return toJob(job);
  } catch (error) {
    const failedAt = input.now();
    const message = error instanceof Error ? error.message : "Recovery failed.";
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "RECOVERY_FAILED";
    const job = updateRecoveryJobState(input.database, {
      id: jobId,
      state: code === "OUTCOME_UNCERTAIN" ? "outcome_uncertain" : "failed",
      progressMessage: message,
      resultSummary: message,
      errorCode: code,
      updatedAt: failedAt,
      completedAt: failedAt,
    });
    appendAuditEvent(input.database, {
      id: input.createId(),
      stallId: input.stallId,
      actorRef: input.staffId,
      deviceRef: input.deviceId,
      action: "sync.recovery_job_failed",
      targetType: "sync_recovery_job",
      targetId: jobId,
      occurredAt: failedAt,
      changeDetailsJson: JSON.stringify({ code, message }),
    });
    releaseRecoveryDomainLock(input.database, input.stallId, domainKey, jobId);
    return toJob(job);
  }
}

async function performAction(input: {
  database: LocalDatabase;
  stallId: string;
  plan: SyncRecoveryPlan;
  syncWorker: SyncWorkerHandle | null;
  configWorker: ConfigWorkerHandle | null;
  cloud: ReconciliationCloudClient;
  now: () => string;
}): Promise<string> {
  switch (input.plan.actionType) {
    case "retry_upload_worker": {
      if (!input.syncWorker) {
        throw Object.assign(new Error("Sync worker unavailable."), { code: "WORKER_UNAVAILABLE" });
      }
      const retry = input.syncWorker.requestManualRetry();
      return retry.message ?? (retry.accepted ? "Worker wake accepted." : "Worker wake not accepted.");
    }
    case "refresh_configuration":
    case "retry_configuration_application":
    case "retry_configuration_acknowledgement": {
      if (!input.configWorker) {
        throw Object.assign(new Error("Config worker unavailable."), {
          code: "WORKER_UNAVAILABLE",
        });
      }
      const refresh = input.configWorker.requestManualRefresh();
      return (
        refresh.message ??
        (refresh.accepted ? "Configuration refresh accepted." : "Configuration refresh not accepted.")
      );
    }
    case "replay_original_events": {
      if (!input.syncWorker) {
        throw Object.assign(new Error("Sync worker unavailable."), { code: "WORKER_UNAVAILABLE" });
      }
      // Bounded wake — original identities remain in outbox; worker re-uploads without new IDs.
      const retry = input.syncWorker.requestManualRetry();
      return `Replay requested via existing worker for ${input.plan.eventGroupRange?.groupIds.length ?? 0} group(s). ${retry.message ?? ""}`.trim();
    }
    case "recover_local_acknowledgement": {
      const stream = tryGetSyncStreamState(input.database, input.stallId);
      if (!stream?.sourceStreamId) {
        throw Object.assign(new Error("Stream not configured."), { code: "STREAM_NOT_CONFIGURED" });
      }
      const groupIds = input.plan.eventGroupRange?.groupIds ?? [];
      if (groupIds.length === 0) {
        return "No groups selected for acknowledgement recovery.";
      }
      const receipts = await input.cloud.lookupReceipts({
        sourceStreamId: stream.sourceStreamId,
        streamGeneration: stream.streamGeneration,
        groupIds,
      });
      if (!receipts.ok) {
        throw Object.assign(new Error(receipts.message), { code: receipts.code });
      }
      const localGroups = listOutboxGroupsThroughSequence(
        input.database,
        input.stallId,
        stream.localTailSequence,
      );
      const byId = new Map(localGroups.map((g) => [g.transactionGroupId, g]));
      let verifiedMatches = 0;
      for (const receipt of receipts.result.receipts) {
        const local = byId.get(receipt.transactionGroupId);
        if (!local || local.ackState === "acknowledged") {
          continue;
        }
        const localIds = new Set(local.eventIds);
        const cloudIds = new Set(receipt.eventIds);
        const idsMatch =
          localIds.size === cloudIds.size && [...localIds].every((id) => cloudIds.has(id));
        if (idsMatch) {
          verifiedMatches += 1;
        }
      }
      if (verifiedMatches === 0) {
        return "No matching cloud receipts available for acknowledgement recovery.";
      }
      if (!input.syncWorker) {
        throw Object.assign(new Error("Sync worker unavailable."), { code: "WORKER_UNAVAILABLE" });
      }
      // Advance local ack only through normal worker ingest of original identities
      // (Phase 31 already_applied → validated local acknowledgement). Not a new financial op.
      const retry = input.syncWorker.requestManualRetry();
      return `Verified ${verifiedMatches} cloud receipt(s); worker wake for acknowledgement recovery. ${retry.message ?? ""}`.trim();
    }
    default: {
      const _exhaustive: never = input.plan.actionType;
      throw new Error(`Unsupported action ${_exhaustive}`);
    }
  }
}

function toJob(row: {
  id: string;
  planId: string;
  actionType: string;
  state: SyncRecoveryJob["state"];
  actorStaffId: string;
  deviceId: string;
  scopeDescription: string;
  progressMessage: string | null;
  resultSummary: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}): SyncRecoveryJob {
  return syncRecoveryJobSchema.parse({
    jobId: row.id,
    planId: row.planId,
    actionType: row.actionType,
    state: row.state,
    actorStaffId: row.actorStaffId,
    deviceId: row.deviceId,
    scopeDescription: row.scopeDescription,
    progressMessage: row.progressMessage,
    resultSummary: row.resultSummary,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  });
}

export function cancelRecoveryJob(input: {
  database: LocalDatabase;
  stallId: string;
  jobId: string;
  staffId: string;
  deviceId: string;
  createId: () => string;
  now: () => string;
}): SyncRecoveryJob {
  const row = getRecoveryJobById(input.database, input.jobId);
  if (row.stallId !== input.stallId) {
    throw Object.assign(new Error("Job not found for stall."), { code: "NOT_FOUND" });
  }
  if (row.state === "completed" || row.state === "cancelled") {
    return toJob(row);
  }
  const updated = updateRecoveryJobState(input.database, {
    id: input.jobId,
    state: "cancelled",
    progressMessage: "Cancelled; already committed cloud work is not undone.",
    resultSummary: "Cancellation stops future work only.",
    updatedAt: input.now(),
    completedAt: input.now(),
  });
  appendAuditEvent(input.database, {
    id: input.createId(),
    stallId: input.stallId,
    actorRef: input.staffId,
    deviceRef: input.deviceId,
    action: "sync.recovery_job_cancelled",
    targetType: "sync_recovery_job",
    targetId: input.jobId,
    occurredAt: input.now(),
  });
  return toJob(updated);
}
