import {
  mapSyncStreamStateRow,
  mapSyncWorkerLeaseRow,
  type SyncStreamStateRecord,
  type SyncWorkerLeaseRecord,
} from "../mapping/records.js";
import { RepositoryError, type DbExecutor } from "./types.js";

const STREAM_SELECT = `SELECT stall_id, source_stream_id, stream_generation, acknowledged_cursor,
              local_tail_sequence, local_tail_measured_at, last_upload_attempt_at, last_ack_at,
              next_retry_at, worker_enabled, blocking_group_id, blocking_event_id,
              blocking_error_code, blocking_message, last_error_code, updated_at
       FROM sync_stream_state`;

const LEASE_SELECT = `SELECT stall_id, owner_token, fence_token, acquired_at, expires_at, updated_at
       FROM sync_worker_lease`;

export function tryGetSyncStreamState(
  executor: DbExecutor,
  stallId: string,
): SyncStreamStateRecord | null {
  const row = executor.db.prepare(`${STREAM_SELECT} WHERE stall_id = ?`).get(stallId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSyncStreamStateRow(row) : null;
}

export function getSyncStreamState(executor: DbExecutor, stallId: string): SyncStreamStateRecord {
  const state = tryGetSyncStreamState(executor, stallId);
  if (!state) {
    throw new RepositoryError(`Sync stream state for stall "${stallId}" was not found.`);
  }
  return state;
}

export type EnsureSyncStreamStateInput = {
  stallId: string;
  sourceStreamId: string;
  streamGeneration?: number;
  updatedAt: string;
};

export function ensureSyncStreamState(
  executor: DbExecutor,
  input: EnsureSyncStreamStateInput,
): SyncStreamStateRecord {
  const existing = tryGetSyncStreamState(executor, input.stallId);
  if (existing) {
    if (existing.sourceStreamId !== input.sourceStreamId) {
      throw new RepositoryError(
        "Local sync stream identity does not match the enrolled host installation.",
      );
    }
    return existing;
  }

  executor.db
    .prepare(
      `INSERT INTO sync_stream_state (
         stall_id, source_stream_id, stream_generation, acknowledged_cursor,
         local_tail_sequence, local_tail_measured_at, last_upload_attempt_at, last_ack_at,
         next_retry_at, worker_enabled, blocking_group_id, blocking_event_id,
         blocking_error_code, blocking_message, last_error_code, updated_at
       ) VALUES (?, ?, ?, 0, 0, NULL, NULL, NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, ?)`,
    )
    .run(
      input.stallId,
      input.sourceStreamId,
      input.streamGeneration ?? 1,
      input.updatedAt,
    );

  return getSyncStreamState(executor, input.stallId);
}

export type UpdateSyncStreamProgressInput = {
  stallId: string;
  fenceToken: number;
  acknowledgedCursor: number;
  localTailSequence: number;
  localTailMeasuredAt: string;
  lastUploadAttemptAt?: string | null;
  lastAckAt?: string | null;
  nextRetryAt?: string | null;
  clearBlocking?: boolean;
  lastErrorCode?: string | null;
  updatedAt: string;
};

function assertLeaseFence(executor: DbExecutor, stallId: string, fenceToken: number): void {
  const lease = executor.db
    .prepare(`SELECT fence_token FROM sync_worker_lease WHERE stall_id = ?`)
    .get(stallId) as { fence_token: number | bigint } | undefined;
  const fence =
    typeof lease?.fence_token === "bigint" ? Number(lease.fence_token) : lease?.fence_token;
  if (fence !== fenceToken) {
    throw new RepositoryError("Worker lease fence mismatch; stream progress update rejected.");
  }
}

export function updateSyncStreamProgress(
  executor: DbExecutor,
  input: UpdateSyncStreamProgressInput,
): SyncStreamStateRecord {
  assertLeaseFence(executor, input.stallId, input.fenceToken);

  if (input.clearBlocking) {
    executor.db
      .prepare(
        `UPDATE sync_stream_state
         SET acknowledged_cursor = ?,
             local_tail_sequence = ?,
             local_tail_measured_at = ?,
             last_upload_attempt_at = COALESCE(?, last_upload_attempt_at),
             last_ack_at = COALESCE(?, last_ack_at),
             next_retry_at = ?,
             blocking_group_id = NULL,
             blocking_event_id = NULL,
             blocking_error_code = NULL,
             blocking_message = NULL,
             last_error_code = ?,
             updated_at = ?
         WHERE stall_id = ?`,
      )
      .run(
        input.acknowledgedCursor,
        input.localTailSequence,
        input.localTailMeasuredAt,
        input.lastUploadAttemptAt ?? null,
        input.lastAckAt ?? null,
        input.nextRetryAt ?? null,
        input.lastErrorCode ?? null,
        input.updatedAt,
        input.stallId,
      );
  } else {
    executor.db
      .prepare(
        `UPDATE sync_stream_state
         SET acknowledged_cursor = ?,
             local_tail_sequence = ?,
             local_tail_measured_at = ?,
             last_upload_attempt_at = COALESCE(?, last_upload_attempt_at),
             last_ack_at = COALESCE(?, last_ack_at),
             next_retry_at = ?,
             last_error_code = ?,
             updated_at = ?
         WHERE stall_id = ?`,
      )
      .run(
        input.acknowledgedCursor,
        input.localTailSequence,
        input.localTailMeasuredAt,
        input.lastUploadAttemptAt ?? null,
        input.lastAckAt ?? null,
        input.nextRetryAt ?? null,
        input.lastErrorCode ?? null,
        input.updatedAt,
        input.stallId,
      );
  }

  return getSyncStreamState(executor, input.stallId);
}

export type SetSyncStreamBlockedInput = {
  stallId: string;
  fenceToken: number;
  blockingGroupId: string;
  blockingEventId: string | null;
  blockingErrorCode: string;
  blockingMessage: string | null;
  lastUploadAttemptAt: string;
  updatedAt: string;
};

export function setSyncStreamBlocked(
  executor: DbExecutor,
  input: SetSyncStreamBlockedInput,
): SyncStreamStateRecord {
  assertLeaseFence(executor, input.stallId, input.fenceToken);
  executor.db
    .prepare(
      `UPDATE sync_stream_state
       SET blocking_group_id = ?,
           blocking_event_id = ?,
           blocking_error_code = ?,
           blocking_message = ?,
           last_error_code = ?,
           last_upload_attempt_at = ?,
           next_retry_at = NULL,
           updated_at = ?
       WHERE stall_id = ?`,
    )
    .run(
      input.blockingGroupId,
      input.blockingEventId,
      input.blockingErrorCode,
      input.blockingMessage,
      input.blockingErrorCode,
      input.lastUploadAttemptAt,
      input.updatedAt,
      input.stallId,
    );
  return getSyncStreamState(executor, input.stallId);
}

export type SetSyncStreamRetryInput = {
  stallId: string;
  fenceToken: number;
  nextRetryAt: string;
  lastErrorCode: string | null;
  lastUploadAttemptAt: string;
  updatedAt: string;
};

export function setSyncStreamRetry(
  executor: DbExecutor,
  input: SetSyncStreamRetryInput,
): SyncStreamStateRecord {
  assertLeaseFence(executor, input.stallId, input.fenceToken);
  executor.db
    .prepare(
      `UPDATE sync_stream_state
       SET next_retry_at = ?,
           last_error_code = ?,
           last_upload_attempt_at = ?,
           updated_at = ?
       WHERE stall_id = ?`,
    )
    .run(
      input.nextRetryAt,
      input.lastErrorCode,
      input.lastUploadAttemptAt,
      input.updatedAt,
      input.stallId,
    );
  return getSyncStreamState(executor, input.stallId);
}

export function clearSyncStreamBlockingForManualRetry(
  executor: DbExecutor,
  stallId: string,
  updatedAt: string,
): SyncStreamStateRecord {
  executor.db
    .prepare(
      `UPDATE sync_stream_state
       SET blocking_group_id = NULL,
           blocking_event_id = NULL,
           blocking_error_code = NULL,
           blocking_message = NULL,
           next_retry_at = NULL,
           last_error_code = NULL,
           updated_at = ?
       WHERE stall_id = ?`,
    )
    .run(updatedAt, stallId);
  return getSyncStreamState(executor, stallId);
}

export function tryGetSyncWorkerLease(
  executor: DbExecutor,
  stallId: string,
): SyncWorkerLeaseRecord | null {
  const row = executor.db.prepare(`${LEASE_SELECT} WHERE stall_id = ?`).get(stallId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSyncWorkerLeaseRow(row) : null;
}

export type AcquireSyncWorkerLeaseInput = {
  stallId: string;
  ownerToken: string;
  now: string;
  expiresAt: string;
};

export type AcquireSyncWorkerLeaseResult =
  | { acquired: true; lease: SyncWorkerLeaseRecord }
  | { acquired: false; lease: SyncWorkerLeaseRecord | null };

/**
 * Acquire or renew a lease. An expired lease can be stolen with a bumped fence token.
 * An active foreign lease cannot be overwritten.
 */
export function acquireSyncWorkerLease(
  executor: DbExecutor,
  input: AcquireSyncWorkerLeaseInput,
): AcquireSyncWorkerLeaseResult {
  const existing = tryGetSyncWorkerLease(executor, input.stallId);
  const nowMs = Date.parse(input.now);

  if (!existing) {
    executor.db
      .prepare(
        `INSERT INTO sync_worker_lease (
           stall_id, owner_token, fence_token, acquired_at, expires_at, updated_at
         ) VALUES (?, ?, 1, ?, ?, ?)`,
      )
      .run(input.stallId, input.ownerToken, input.now, input.expiresAt, input.now);
    return { acquired: true, lease: tryGetSyncWorkerLease(executor, input.stallId)! };
  }

  if (existing.ownerToken === input.ownerToken) {
    executor.db
      .prepare(
        `UPDATE sync_worker_lease
         SET expires_at = ?, updated_at = ?
         WHERE stall_id = ? AND owner_token = ? AND fence_token = ?`,
      )
      .run(
        input.expiresAt,
        input.now,
        input.stallId,
        input.ownerToken,
        existing.fenceToken,
      );
    return { acquired: true, lease: tryGetSyncWorkerLease(executor, input.stallId)! };
  }

  const expiresMs = Date.parse(existing.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || nowMs < expiresMs) {
    return { acquired: false, lease: existing };
  }

  const nextFence = existing.fenceToken + 1;
  executor.db
    .prepare(
      `UPDATE sync_worker_lease
       SET owner_token = ?, fence_token = ?, acquired_at = ?, expires_at = ?, updated_at = ?
       WHERE stall_id = ? AND fence_token = ?`,
    )
    .run(
      input.ownerToken,
      nextFence,
      input.now,
      input.expiresAt,
      input.now,
      input.stallId,
      existing.fenceToken,
    );

  const leased = tryGetSyncWorkerLease(executor, input.stallId);
  if (!leased || leased.ownerToken !== input.ownerToken) {
    return { acquired: false, lease: leased };
  }
  return { acquired: true, lease: leased };
}

export function releaseSyncWorkerLease(
  executor: DbExecutor,
  stallId: string,
  ownerToken: string,
  now: string,
): void {
  executor.db
    .prepare(
      `UPDATE sync_worker_lease
       SET expires_at = ?, updated_at = ?
       WHERE stall_id = ? AND owner_token = ?`,
    )
    .run(now, now, stallId, ownerToken);
}
