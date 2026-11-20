import { RepositoryError, type DbExecutor } from "./types.js";

export type SyncReconciliationRunRecord = {
  id: string;
  stallId: string;
  requestId: string;
  state: "running" | "completed" | "failed" | "cancelled";
  scope: string;
  sourceStreamId: string | null;
  streamGeneration: number | null;
  localCommittedTail: number | null;
  verifiedCloudCursor: number | null;
  comparableCutoff: number | null;
  manifestVersion: string | null;
  definitionVersion: string | null;
  summaryJson: string;
  summaryPhrase: string | null;
  safeNextAction: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdByStaffId: string;
  createdByDeviceId: string;
};

export type SyncRecoveryPlanRecord = {
  id: string;
  stallId: string;
  actionType: string;
  targetStreamId: string | null;
  targetConfigDomain: string | null;
  eventGroupRangeJson: string | null;
  configurationRevision: number | null;
  expectedStateFingerprint: string;
  affectedItemCount: number;
  safetyRationale: string;
  potentialOutcome: string;
  requiredCapability: string;
  planJson: string;
  createdAt: string;
  expiresAt: string;
  createdByStaffId: string;
  createdByDeviceId: string;
  consumedAt: string | null;
  consumedByJobId: string | null;
};

export type SyncRecoveryJobRecord = {
  id: string;
  stallId: string;
  planId: string;
  actionType: string;
  state: "requested" | "running" | "completed" | "failed" | "cancelled" | "outcome_uncertain";
  actorStaffId: string;
  deviceId: string;
  scopeDescription: string;
  progressMessage: string | null;
  resultSummary: string | null;
  errorCode: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SyncDiagnosticExportRecord = {
  id: string;
  stallId: string;
  defaultFileName: string;
  contentType: string;
  contentSha256: string;
  byteLength: number;
  contentJson: string;
  createdByStaffId: string;
  createdByDeviceId: string;
  createOperationId: string;
  createdAt: string;
  expiresAt: string;
};

export type PendingOutboxGroupSummary = {
  transactionGroupId: string;
  eventType: string;
  sourceReference: string;
  recordedAt: string;
  attemptCount: number;
  errorCode: string | null;
  nextEligibleRetryAt: string | null;
  blocked: boolean;
  minSequence: number;
  maxSequence: number;
  eventIds: string[];
};

function mapRun(row: Record<string, unknown>): SyncReconciliationRunRecord {
  return {
    id: String(row["id"]),
    stallId: String(row["stall_id"]),
    requestId: String(row["request_id"]),
    state: String(row["state"]) as SyncReconciliationRunRecord["state"],
    scope: String(row["scope"]),
    sourceStreamId: row["source_stream_id"] == null ? null : String(row["source_stream_id"]),
    streamGeneration: row["stream_generation"] == null ? null : Number(row["stream_generation"]),
    localCommittedTail:
      row["local_committed_tail"] == null ? null : Number(row["local_committed_tail"]),
    verifiedCloudCursor:
      row["verified_cloud_cursor"] == null ? null : Number(row["verified_cloud_cursor"]),
    comparableCutoff: row["comparable_cutoff"] == null ? null : Number(row["comparable_cutoff"]),
    manifestVersion: row["manifest_version"] == null ? null : String(row["manifest_version"]),
    definitionVersion: row["definition_version"] == null ? null : String(row["definition_version"]),
    summaryJson: String(row["summary_json"]),
    summaryPhrase: row["summary_phrase"] == null ? null : String(row["summary_phrase"]),
    safeNextAction: row["safe_next_action"] == null ? null : String(row["safe_next_action"]),
    errorCode: row["error_code"] == null ? null : String(row["error_code"]),
    errorMessage: row["error_message"] == null ? null : String(row["error_message"]),
    startedAt: String(row["started_at"]),
    completedAt: row["completed_at"] == null ? null : String(row["completed_at"]),
    createdByStaffId: String(row["created_by_staff_id"]),
    createdByDeviceId: String(row["created_by_device_id"]),
  };
}

function mapPlan(row: Record<string, unknown>): SyncRecoveryPlanRecord {
  return {
    id: String(row["id"]),
    stallId: String(row["stall_id"]),
    actionType: String(row["action_type"]),
    targetStreamId: row["target_stream_id"] == null ? null : String(row["target_stream_id"]),
    targetConfigDomain:
      row["target_config_domain"] == null ? null : String(row["target_config_domain"]),
    eventGroupRangeJson:
      row["event_group_range_json"] == null ? null : String(row["event_group_range_json"]),
    configurationRevision:
      row["configuration_revision"] == null ? null : Number(row["configuration_revision"]),
    expectedStateFingerprint: String(row["expected_state_fingerprint"]),
    affectedItemCount: Number(row["affected_item_count"]),
    safetyRationale: String(row["safety_rationale"]),
    potentialOutcome: String(row["potential_outcome"]),
    requiredCapability: String(row["required_capability"]),
    planJson: String(row["plan_json"]),
    createdAt: String(row["created_at"]),
    expiresAt: String(row["expires_at"]),
    createdByStaffId: String(row["created_by_staff_id"]),
    createdByDeviceId: String(row["created_by_device_id"]),
    consumedAt: row["consumed_at"] == null ? null : String(row["consumed_at"]),
    consumedByJobId: row["consumed_by_job_id"] == null ? null : String(row["consumed_by_job_id"]),
  };
}

function mapJob(row: Record<string, unknown>): SyncRecoveryJobRecord {
  return {
    id: String(row["id"]),
    stallId: String(row["stall_id"]),
    planId: String(row["plan_id"]),
    actionType: String(row["action_type"]),
    state: String(row["state"]) as SyncRecoveryJobRecord["state"],
    actorStaffId: String(row["actor_staff_id"]),
    deviceId: String(row["device_id"]),
    scopeDescription: String(row["scope_description"]),
    progressMessage: row["progress_message"] == null ? null : String(row["progress_message"]),
    resultSummary: row["result_summary"] == null ? null : String(row["result_summary"]),
    errorCode: row["error_code"] == null ? null : String(row["error_code"]),
    idempotencyKey: String(row["idempotency_key"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    completedAt: row["completed_at"] == null ? null : String(row["completed_at"]),
  };
}

function mapExport(row: Record<string, unknown>): SyncDiagnosticExportRecord {
  return {
    id: String(row["id"]),
    stallId: String(row["stall_id"]),
    defaultFileName: String(row["default_file_name"]),
    contentType: String(row["content_type"]),
    contentSha256: String(row["content_sha256"]),
    byteLength: Number(row["byte_length"]),
    contentJson: String(row["content_json"]),
    createdByStaffId: String(row["created_by_staff_id"]),
    createdByDeviceId: String(row["created_by_device_id"]),
    createOperationId: String(row["create_operation_id"]),
    createdAt: String(row["created_at"]),
    expiresAt: String(row["expires_at"]),
  };
}

export function insertReconciliationRun(
  executor: DbExecutor,
  input: {
    id: string;
    stallId: string;
    requestId: string;
    scope: string;
    startedAt: string;
    createdByStaffId: string;
    createdByDeviceId: string;
  },
): SyncReconciliationRunRecord {
  executor.db
    .prepare(
      `INSERT INTO sync_reconciliation_runs (
         id, stall_id, request_id, state, scope, summary_json,
         started_at, created_by_staff_id, created_by_device_id
       ) VALUES (?, ?, ?, 'running', ?, '{}', ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.requestId,
      input.scope,
      input.startedAt,
      input.createdByStaffId,
      input.createdByDeviceId,
    );
  return getReconciliationRunById(executor, input.id);
}

export function completeReconciliationRun(
  executor: DbExecutor,
  input: {
    id: string;
    state: "completed" | "failed" | "cancelled";
    sourceStreamId: string | null;
    streamGeneration: number | null;
    localCommittedTail: number | null;
    verifiedCloudCursor: number | null;
    comparableCutoff: number | null;
    manifestVersion: string | null;
    definitionVersion: string | null;
    summaryJson: string;
    summaryPhrase: string | null;
    safeNextAction: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    completedAt: string;
  },
): SyncReconciliationRunRecord {
  executor.db
    .prepare(
      `UPDATE sync_reconciliation_runs
       SET state = ?,
           source_stream_id = ?,
           stream_generation = ?,
           local_committed_tail = ?,
           verified_cloud_cursor = ?,
           comparable_cutoff = ?,
           manifest_version = ?,
           definition_version = ?,
           summary_json = ?,
           summary_phrase = ?,
           safe_next_action = ?,
           error_code = ?,
           error_message = ?,
           completed_at = ?
       WHERE id = ?`,
    )
    .run(
      input.state,
      input.sourceStreamId,
      input.streamGeneration,
      input.localCommittedTail,
      input.verifiedCloudCursor,
      input.comparableCutoff,
      input.manifestVersion,
      input.definitionVersion,
      input.summaryJson,
      input.summaryPhrase,
      input.safeNextAction,
      input.errorCode,
      input.errorMessage,
      input.completedAt,
      input.id,
    );
  return getReconciliationRunById(executor, input.id);
}

export function getReconciliationRunById(
  executor: DbExecutor,
  id: string,
): SyncReconciliationRunRecord {
  const row = executor.db.prepare(`SELECT * FROM sync_reconciliation_runs WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!row) {
    throw new RepositoryError(`Reconciliation run "${id}" was not found.`);
  }
  return mapRun(row);
}

export function tryGetLatestReconciliationRun(
  executor: DbExecutor,
  stallId: string,
): SyncReconciliationRunRecord | null {
  const row = executor.db
    .prepare(
      `SELECT * FROM sync_reconciliation_runs
       WHERE stall_id = ?
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get(stallId) as Record<string, unknown> | undefined;
  return row ? mapRun(row) : null;
}

export function insertRecoveryPlan(
  executor: DbExecutor,
  input: {
    id: string;
    stallId: string;
    actionType: string;
    targetStreamId: string | null;
    targetConfigDomain: string | null;
    eventGroupRangeJson: string | null;
    configurationRevision: number | null;
    expectedStateFingerprint: string;
    affectedItemCount: number;
    safetyRationale: string;
    potentialOutcome: string;
    requiredCapability: string;
    planJson: string;
    createdAt: string;
    expiresAt: string;
    createdByStaffId: string;
    createdByDeviceId: string;
  },
): SyncRecoveryPlanRecord {
  executor.db
    .prepare(
      `INSERT INTO sync_recovery_plans (
         id, stall_id, action_type, target_stream_id, target_config_domain,
         event_group_range_json, configuration_revision, expected_state_fingerprint,
         affected_item_count, safety_rationale, potential_outcome, required_capability,
         plan_json, created_at, expires_at, created_by_staff_id, created_by_device_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.actionType,
      input.targetStreamId,
      input.targetConfigDomain,
      input.eventGroupRangeJson,
      input.configurationRevision,
      input.expectedStateFingerprint,
      input.affectedItemCount,
      input.safetyRationale,
      input.potentialOutcome,
      input.requiredCapability,
      input.planJson,
      input.createdAt,
      input.expiresAt,
      input.createdByStaffId,
      input.createdByDeviceId,
    );
  return getRecoveryPlanById(executor, input.id);
}

export function getRecoveryPlanById(executor: DbExecutor, id: string): SyncRecoveryPlanRecord {
  const row = executor.db.prepare(`SELECT * FROM sync_recovery_plans WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!row) {
    throw new RepositoryError(`Recovery plan "${id}" was not found.`);
  }
  return mapPlan(row);
}

export function markRecoveryPlanConsumed(
  executor: DbExecutor,
  planId: string,
  jobId: string,
  consumedAt: string,
): void {
  const result = executor.db
    .prepare(
      `UPDATE sync_recovery_plans
       SET consumed_at = ?, consumed_by_job_id = ?
       WHERE id = ? AND consumed_at IS NULL`,
    )
    .run(consumedAt, jobId, planId);
  if (result.changes !== 1) {
    throw new RepositoryError("Recovery plan was already consumed or missing.");
  }
}

export function tryGetRecoveryJobByIdempotency(
  executor: DbExecutor,
  stallId: string,
  idempotencyKey: string,
): SyncRecoveryJobRecord | null {
  const row = executor.db
    .prepare(`SELECT * FROM sync_recovery_jobs WHERE stall_id = ? AND idempotency_key = ?`)
    .get(stallId, idempotencyKey) as Record<string, unknown> | undefined;
  return row ? mapJob(row) : null;
}

export function insertRecoveryJob(
  executor: DbExecutor,
  input: {
    id: string;
    stallId: string;
    planId: string;
    actionType: string;
    actorStaffId: string;
    deviceId: string;
    scopeDescription: string;
    idempotencyKey: string;
    createdAt: string;
  },
): SyncRecoveryJobRecord {
  executor.db
    .prepare(
      `INSERT INTO sync_recovery_jobs (
         id, stall_id, plan_id, action_type, state, actor_staff_id, device_id,
         scope_description, idempotency_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.planId,
      input.actionType,
      input.actorStaffId,
      input.deviceId,
      input.scopeDescription,
      input.idempotencyKey,
      input.createdAt,
      input.createdAt,
    );
  return getRecoveryJobById(executor, input.id);
}

export function getRecoveryJobById(executor: DbExecutor, id: string): SyncRecoveryJobRecord {
  const row = executor.db.prepare(`SELECT * FROM sync_recovery_jobs WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!row) {
    throw new RepositoryError(`Recovery job "${id}" was not found.`);
  }
  return mapJob(row);
}

export function updateRecoveryJobState(
  executor: DbExecutor,
  input: {
    id: string;
    state: SyncRecoveryJobRecord["state"];
    progressMessage?: string | null;
    resultSummary?: string | null;
    errorCode?: string | null;
    updatedAt: string;
    completedAt?: string | null;
  },
): SyncRecoveryJobRecord {
  executor.db
    .prepare(
      `UPDATE sync_recovery_jobs
       SET state = ?,
           progress_message = COALESCE(?, progress_message),
           result_summary = COALESCE(?, result_summary),
           error_code = COALESCE(?, error_code),
           updated_at = ?,
           completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
    )
    .run(
      input.state,
      input.progressMessage ?? null,
      input.resultSummary ?? null,
      input.errorCode ?? null,
      input.updatedAt,
      input.completedAt ?? null,
      input.id,
    );
  return getRecoveryJobById(executor, input.id);
}

export function listRecentRecoveryJobs(
  executor: DbExecutor,
  stallId: string,
  limit = 20,
): SyncRecoveryJobRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT * FROM sync_recovery_jobs
       WHERE stall_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(stallId, limit) as Record<string, unknown>[];
  return rows.map(mapJob);
}

export function tryAcquireRecoveryDomainLock(
  executor: DbExecutor,
  input: {
    stallId: string;
    domainKey: string;
    jobId: string;
    acquiredAt: string;
    expiresAt: string;
  },
): boolean {
  const existing = executor.db
    .prepare(
      `SELECT job_id, expires_at FROM sync_recovery_domain_locks
       WHERE stall_id = ? AND domain_key = ?`,
    )
    .get(input.stallId, input.domainKey) as { job_id: string; expires_at: string } | undefined;

  if (existing && existing.expires_at > input.acquiredAt && existing.job_id !== input.jobId) {
    return false;
  }

  executor.db
    .prepare(
      `INSERT INTO sync_recovery_domain_locks (stall_id, domain_key, job_id, acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(stall_id, domain_key) DO UPDATE SET
         job_id = excluded.job_id,
         acquired_at = excluded.acquired_at,
         expires_at = excluded.expires_at`,
    )
    .run(input.stallId, input.domainKey, input.jobId, input.acquiredAt, input.expiresAt);
  return true;
}

export function releaseRecoveryDomainLock(
  executor: DbExecutor,
  stallId: string,
  domainKey: string,
  jobId: string,
): void {
  executor.db
    .prepare(
      `DELETE FROM sync_recovery_domain_locks
       WHERE stall_id = ? AND domain_key = ? AND job_id = ?`,
    )
    .run(stallId, domainKey, jobId);
}

export function insertDiagnosticExport(
  executor: DbExecutor,
  input: {
    id: string;
    stallId: string;
    defaultFileName: string;
    contentSha256: string;
    byteLength: number;
    contentJson: string;
    createdByStaffId: string;
    createdByDeviceId: string;
    createOperationId: string;
    createdAt: string;
    expiresAt: string;
  },
): SyncDiagnosticExportRecord {
  executor.db
    .prepare(
      `INSERT INTO sync_diagnostic_exports (
         id, stall_id, default_file_name, content_type, content_sha256, byte_length,
         content_json, created_by_staff_id, created_by_device_id, create_operation_id,
         created_at, expires_at
       ) VALUES (?, ?, ?, 'application/json', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.defaultFileName,
      input.contentSha256,
      input.byteLength,
      input.contentJson,
      input.createdByStaffId,
      input.createdByDeviceId,
      input.createOperationId,
      input.createdAt,
      input.expiresAt,
    );
  return getDiagnosticExportById(executor, input.id);
}

export function getDiagnosticExportById(
  executor: DbExecutor,
  id: string,
): SyncDiagnosticExportRecord {
  const row = executor.db.prepare(`SELECT * FROM sync_diagnostic_exports WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!row) {
    throw new RepositoryError(`Diagnostic export "${id}" was not found.`);
  }
  return mapExport(row);
}

/** Safe pending/blocked group summaries — no financial payloads. */
export function listPendingBlockedOutboxGroups(
  executor: DbExecutor,
  stallId: string,
  limit = 50,
): PendingOutboxGroupSummary[] {
  const rows = executor.db
    .prepare(
      `SELECT transaction_group_id,
              MIN(event_type) AS event_type,
              MIN(occurred_at) AS recorded_at,
              MAX(delivery_attempts) AS attempt_count,
              MAX(last_error_code) AS error_code,
              MIN(next_retry_at) AS next_retry_at,
              MAX(CASE WHEN ack_state = 'blocked' THEN 1 ELSE 0 END) AS blocked,
              MIN(local_sequence) AS min_sequence,
              MAX(local_sequence) AS max_sequence,
              GROUP_CONCAT(event_id) AS event_ids
       FROM sync_outbox
       WHERE stall_id = ?
         AND ack_state IN ('pending', 'failed', 'blocked')
       GROUP BY transaction_group_id
       ORDER BY MIN(local_sequence) ASC
       LIMIT ?`,
    )
    .all(stallId, limit) as Record<string, unknown>[];

  return rows.map((row) => {
    const groupId = String(row["transaction_group_id"]);
    const eventType = String(row["event_type"] ?? "unknown");
    return {
      transactionGroupId: groupId,
      eventType,
      sourceReference: `group:${groupId}`,
      recordedAt: String(row["recorded_at"]),
      attemptCount: Number(row["attempt_count"] ?? 0),
      errorCode: row["error_code"] == null ? null : String(row["error_code"]),
      nextEligibleRetryAt: row["next_retry_at"] == null ? null : String(row["next_retry_at"]),
      blocked: Number(row["blocked"] ?? 0) === 1,
      minSequence: Number(row["min_sequence"]),
      maxSequence: Number(row["max_sequence"]),
      eventIds: String(row["event_ids"] ?? "")
        .split(",")
        .filter((id) => id.length > 0),
    };
  });
}

export function listOutboxGroupsThroughSequence(
  executor: DbExecutor,
  stallId: string,
  throughSequence: number,
): Array<{
  transactionGroupId: string;
  minSequence: number;
  maxSequence: number;
  eventIds: string[];
  eventType: string;
  ackState: string;
  payloadHashes: Array<{ eventId: string; payloadJson: string; localSequence: number }>;
}> {
  const rows = executor.db
    .prepare(
      `SELECT event_id, transaction_group_id, event_type, local_sequence, ack_state, payload_json
       FROM sync_outbox
       WHERE stall_id = ? AND local_sequence <= ?
       ORDER BY local_sequence ASC`,
    )
    .all(stallId, throughSequence) as Record<string, unknown>[];

  const byGroup = new Map<
    string,
    {
      transactionGroupId: string;
      minSequence: number;
      maxSequence: number;
      eventIds: string[];
      eventType: string;
      ackState: string;
      payloadHashes: Array<{ eventId: string; payloadJson: string; localSequence: number }>;
    }
  >();

  for (const row of rows) {
    const groupId = String(row["transaction_group_id"]);
    const seq = Number(row["local_sequence"]);
    const existing = byGroup.get(groupId);
    const eventId = String(row["event_id"]);
    if (!existing) {
      byGroup.set(groupId, {
        transactionGroupId: groupId,
        minSequence: seq,
        maxSequence: seq,
        eventIds: [eventId],
        eventType: String(row["event_type"]),
        ackState: String(row["ack_state"]),
        payloadHashes: [
          {
            eventId,
            payloadJson: String(row["payload_json"]),
            localSequence: seq,
          },
        ],
      });
    } else {
      existing.minSequence = Math.min(existing.minSequence, seq);
      existing.maxSequence = Math.max(existing.maxSequence, seq);
      existing.eventIds.push(eventId);
      existing.payloadHashes.push({
        eventId,
        payloadJson: String(row["payload_json"]),
        localSequence: seq,
      });
      if (String(row["ack_state"]) === "blocked") {
        existing.ackState = "blocked";
      } else if (existing.ackState !== "blocked" && String(row["ack_state"]) !== "acknowledged") {
        existing.ackState = String(row["ack_state"]);
      }
    }
  }

  return [...byGroup.values()];
}
