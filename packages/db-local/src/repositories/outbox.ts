import { mapOutboxEventRow, type OutboxEventRecord } from "../mapping/records.js";
import { RepositoryError, type DbExecutor } from "./types.js";

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
  // Reject clearly non-JSON strings early; callers should validate against concrete schemas.
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
         delivery_attempts, last_attempt_at, ack_state, acknowledged_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending', NULL)`,
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
    );

  const row = executor.db
    .prepare(
      `SELECT event_id, tenant_id, stall_id, originating_device_id, event_type,
              event_schema_version, payload_json, occurred_at, local_sequence,
              delivery_attempts, last_attempt_at, ack_state, acknowledged_at
       FROM sync_outbox
       WHERE event_id = ?`,
    )
    .get(input.eventId) as Record<string, unknown>;

  return mapOutboxEventRow(row);
}
