import {
  mapOutboxEventRow,
  type OutboxAckState,
  type OutboxEventRecord,
} from "../mapping/records.js";
import { RepositoryError, type DbExecutor } from "./types.js";

const OUTBOX_SELECT = `SELECT event_id, tenant_id, stall_id, originating_device_id, event_type,
              event_schema_version, payload_json, occurred_at, local_sequence,
              transaction_group_id, delivery_attempts, last_attempt_at, next_retry_at,
              last_error_code, ack_state, acknowledged_at, ack_receipt_json, ack_payload_hash
       FROM sync_outbox`;

export type AppendOutboxEventInput = {
  eventId: string;
  tenantId: string;
  stallId: string;
  originatingDeviceId: string;
  eventType: string;
  eventSchemaVersion: string;
  /** Validated JSON string for the event payload. */
  payloadJson: string;
  occurredAt: string;
  /** Shared across events committed in the same local transaction group. */
  transactionGroupId: string;
};

/**
 * Append a validated outbox event and allocate the next local_sequence for the stall.
 * Must run inside the caller's BEGIN IMMEDIATE transaction so MAX+1 is race-safe.
 */
export function appendOutboxEvent(
  executor: DbExecutor,
  input: AppendOutboxEventInput,
): OutboxEventRecord {
  if (input.payloadJson.length === 0) {
    throw new RepositoryError("Outbox payload_json must not be empty.");
  }
  if (input.transactionGroupId.trim().length === 0) {
    throw new RepositoryError("Outbox transaction_group_id must not be empty.");
  }
  try {
    JSON.parse(input.payloadJson);
  } catch {
    throw new RepositoryError("Outbox payload_json must be valid JSON.");
  }

  const nextRow = executor.db
    .prepare(
      `SELECT COALESCE(MAX(local_sequence), 0) + 1 AS next_sequence
       FROM sync_outbox
       WHERE stall_id = ?`,
    )
    .get(input.stallId) as { next_sequence: number | bigint } | undefined;

  const localSequence =
    typeof nextRow?.next_sequence === "bigint"
      ? Number(nextRow.next_sequence)
      : (nextRow?.next_sequence ?? 1);

  if (!Number.isSafeInteger(localSequence) || localSequence < 1) {
    throw new RepositoryError("Failed to allocate a safe outbox local_sequence.");
  }

  executor.db
    .prepare(
      `INSERT INTO sync_outbox (
         event_id, tenant_id, stall_id, originating_device_id, event_type,
         event_schema_version, payload_json, occurred_at, local_sequence,
         transaction_group_id, delivery_attempts, last_attempt_at, next_retry_at,
         last_error_code, ack_state, acknowledged_at, ack_receipt_json, ack_payload_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, 'pending', NULL, NULL, NULL)`,
    )
    .run(
      input.eventId,
      input.tenantId,
      input.stallId,
      input.originatingDeviceId,
      input.eventType,
      input.eventSchemaVersion,
      input.payloadJson,
      input.occurredAt,
      localSequence,
      input.transactionGroupId,
    );

  return getOutboxEventById(executor, input.eventId);
}

export function getOutboxEventById(executor: DbExecutor, eventId: string): OutboxEventRecord {
  const row = executor.db.prepare(`${OUTBOX_SELECT} WHERE event_id = ?`).get(eventId) as
    Record<string, unknown> | undefined;
  if (!row) {
    throw new RepositoryError(`Outbox event "${eventId}" was not found.`);
  }
  return mapOutboxEventRow(row);
}

export function getMaxOutboxSequence(executor: DbExecutor, stallId: string): number {
  const row = executor.db
    .prepare(
      `SELECT COALESCE(MAX(local_sequence), 0) AS max_sequence
       FROM sync_outbox WHERE stall_id = ?`,
    )
    .get(stallId) as { max_sequence: number | bigint } | undefined;
  const value =
    typeof row?.max_sequence === "bigint" ? Number(row.max_sequence) : (row?.max_sequence ?? 0);
  return Number.isSafeInteger(value) ? value : 0;
}

export type PendingOutboxQuery = {
  stallId: string;
  afterSequence?: number;
  limit?: number;
  /** When set, only rows eligible for retry at-or-before this timestamp. */
  eligibleAt?: string;
};

/** Pending (and retry-eligible failed) events in source order. Blocked rows are excluded. */
export function listPendingOutboxEvents(
  executor: DbExecutor,
  input: PendingOutboxQuery,
): OutboxEventRecord[] {
  const after = input.afterSequence ?? 0;
  const limit = input.limit ?? 200;
  const eligibleAt = input.eligibleAt;
  const rows = (
    eligibleAt
      ? executor.db
          .prepare(
            `${OUTBOX_SELECT}
             WHERE stall_id = ?
               AND local_sequence > ?
               AND ack_state IN ('pending', 'failed')
               AND (next_retry_at IS NULL OR next_retry_at <= ?)
             ORDER BY local_sequence ASC
             LIMIT ?`,
          )
          .all(input.stallId, after, eligibleAt, limit)
      : executor.db
          .prepare(
            `${OUTBOX_SELECT}
             WHERE stall_id = ?
               AND local_sequence > ?
               AND ack_state IN ('pending', 'failed')
             ORDER BY local_sequence ASC
             LIMIT ?`,
          )
          .all(input.stallId, after, limit)
  ) as Record<string, unknown>[];

  return rows.map((row) => mapOutboxEventRow(row));
}

export function countPendingOutboxEvents(executor: DbExecutor, stallId: string): number {
  const row = executor.db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_outbox
       WHERE stall_id = ? AND ack_state IN ('pending', 'failed', 'blocked')`,
    )
    .get(stallId) as { count: number | bigint } | undefined;
  const value = typeof row?.count === "bigint" ? Number(row.count) : (row?.count ?? 0);
  return Number.isSafeInteger(value) ? value : 0;
}

export function getOldestPendingOutboxOccurredAt(
  executor: DbExecutor,
  stallId: string,
): string | null {
  const row = executor.db
    .prepare(
      `SELECT occurred_at
       FROM sync_outbox
       WHERE stall_id = ? AND ack_state IN ('pending', 'failed', 'blocked')
       ORDER BY local_sequence ASC
       LIMIT 1`,
    )
    .get(stallId) as { occurred_at: string } | undefined;
  return row?.occurred_at ?? null;
}

export type RecordOutboxAttemptInput = {
  eventIds: string[];
  attemptedAt: string;
  nextRetryAt?: string | null;
  lastErrorCode?: string | null;
};

export function recordOutboxAttempt(executor: DbExecutor, input: RecordOutboxAttemptInput): void {
  if (input.eventIds.length === 0) {
    return;
  }
  const stmt = executor.db.prepare(
    `UPDATE sync_outbox
     SET delivery_attempts = delivery_attempts + 1,
         last_attempt_at = ?,
         next_retry_at = ?,
         last_error_code = COALESCE(?, last_error_code)
     WHERE event_id = ? AND ack_state IN ('pending', 'failed')`,
  );
  for (const eventId of input.eventIds) {
    stmt.run(input.attemptedAt, input.nextRetryAt ?? null, input.lastErrorCode ?? null, eventId);
  }
}

export type BlockOutboxGroupInput = {
  stallId: string;
  transactionGroupId: string;
  errorCode: string;
  blockedAt: string;
};

export function blockOutboxGroup(executor: DbExecutor, input: BlockOutboxGroupInput): void {
  executor.db
    .prepare(
      `UPDATE sync_outbox
       SET ack_state = 'blocked',
           last_error_code = ?,
           last_attempt_at = ?,
           next_retry_at = NULL
       WHERE stall_id = ?
         AND transaction_group_id = ?
         AND ack_state IN ('pending', 'failed', 'blocked')`,
    )
    .run(input.errorCode, input.blockedAt, input.stallId, input.transactionGroupId);
}

/** Clear blocked/failed retry gates for a manual retry (does not bypass validation). */
export function clearOutboxRetryGateForStall(
  executor: DbExecutor,
  stallId: string,
  now: string,
): void {
  executor.db
    .prepare(
      `UPDATE sync_outbox
       SET next_retry_at = NULL,
           ack_state = CASE WHEN ack_state = 'blocked' THEN 'pending' ELSE ack_state END,
           last_error_code = CASE WHEN ack_state = 'blocked' THEN NULL ELSE last_error_code END
       WHERE stall_id = ?
         AND ack_state IN ('pending', 'failed', 'blocked')`,
    )
    .run(stallId);
  void now;
}

export type AcknowledgeOutboxEventsInput = {
  eventIds: string[];
  acknowledgedAt: string;
  ackReceiptJson: string;
  ackPayloadHash: string | null;
  fenceToken: number;
  stallId: string;
};

/**
 * Mark verified acknowledged events. Caller must already hold a valid lease fence
 * and validate the ack against local event identities.
 */
export function acknowledgeOutboxEvents(
  executor: DbExecutor,
  input: AcknowledgeOutboxEventsInput,
): void {
  if (input.eventIds.length === 0) {
    return;
  }
  const lease = executor.db
    .prepare(`SELECT fence_token FROM sync_worker_lease WHERE stall_id = ?`)
    .get(input.stallId) as { fence_token: number | bigint } | undefined;
  const fence =
    typeof lease?.fence_token === "bigint" ? Number(lease.fence_token) : lease?.fence_token;
  if (fence !== input.fenceToken) {
    throw new RepositoryError("Worker lease fence mismatch; acknowledgement rejected.");
  }

  const stmt = executor.db.prepare(
    `UPDATE sync_outbox
     SET ack_state = 'acknowledged',
         acknowledged_at = ?,
         ack_receipt_json = ?,
         ack_payload_hash = ?,
         next_retry_at = NULL,
         last_error_code = NULL
     WHERE event_id = ?
       AND stall_id = ?
       AND ack_state IN ('pending', 'failed', 'blocked')`,
  );
  for (const eventId of input.eventIds) {
    const result = stmt.run(
      input.acknowledgedAt,
      input.ackReceiptJson,
      input.ackPayloadHash,
      eventId,
      input.stallId,
    );
    if (result.changes !== 1) {
      throw new RepositoryError(`Failed to acknowledge outbox event "${eventId}".`);
    }
  }
}

export type OutboxAckStateUpdate = OutboxAckState;
