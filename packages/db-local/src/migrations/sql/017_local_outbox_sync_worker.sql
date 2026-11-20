-- Phase 32: durable outbox delivery metadata, transaction groups, stream cursor, and worker lease.
-- Migrations 001–016 remain unchanged.
-- Historical rows without a group id are backfilled as single-event groups (transaction_group_id = event_id).
-- Pre-017 multi-event commands that should have shared a group are recorded as a bootstrap limitation.

CREATE TABLE sync_outbox_new (
  event_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  originating_device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_schema_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  local_sequence INTEGER NOT NULL,
  transaction_group_id TEXT NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_attempt_at TEXT,
  next_retry_at TEXT,
  last_error_code TEXT,
  ack_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (ack_state IN ('pending', 'acknowledged', 'failed', 'blocked')),
  acknowledged_at TEXT,
  ack_receipt_json TEXT,
  ack_payload_hash TEXT,
  UNIQUE (stall_id, local_sequence)
);

INSERT INTO sync_outbox_new (
  event_id,
  tenant_id,
  stall_id,
  originating_device_id,
  event_type,
  event_schema_version,
  payload_json,
  occurred_at,
  local_sequence,
  transaction_group_id,
  delivery_attempts,
  last_attempt_at,
  next_retry_at,
  last_error_code,
  ack_state,
  acknowledged_at,
  ack_receipt_json,
  ack_payload_hash
)
SELECT
  event_id,
  tenant_id,
  stall_id,
  originating_device_id,
  event_type,
  event_schema_version,
  payload_json,
  occurred_at,
  local_sequence,
  event_id AS transaction_group_id,
  delivery_attempts,
  last_attempt_at,
  NULL AS next_retry_at,
  NULL AS last_error_code,
  ack_state,
  acknowledged_at,
  NULL AS ack_receipt_json,
  NULL AS ack_payload_hash
FROM sync_outbox;

DROP TABLE sync_outbox;
ALTER TABLE sync_outbox_new RENAME TO sync_outbox;

CREATE INDEX idx_sync_outbox_pending ON sync_outbox (ack_state, local_sequence);
CREATE INDEX idx_sync_outbox_group ON sync_outbox (stall_id, transaction_group_id, local_sequence);
CREATE INDEX idx_sync_outbox_retry ON sync_outbox (ack_state, next_retry_at, local_sequence);

-- One row per stall stream (source_stream_id = host installation_id).
CREATE TABLE sync_stream_state (
  stall_id TEXT PRIMARY KEY NOT NULL,
  source_stream_id TEXT NOT NULL,
  stream_generation INTEGER NOT NULL DEFAULT 1 CHECK (stream_generation >= 1),
  acknowledged_cursor INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged_cursor >= 0),
  local_tail_sequence INTEGER NOT NULL DEFAULT 0 CHECK (local_tail_sequence >= 0),
  local_tail_measured_at TEXT,
  last_upload_attempt_at TEXT,
  last_ack_at TEXT,
  next_retry_at TEXT,
  worker_enabled INTEGER NOT NULL DEFAULT 1 CHECK (worker_enabled IN (0, 1)),
  blocking_group_id TEXT,
  blocking_event_id TEXT,
  blocking_error_code TEXT,
  blocking_message TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);

-- Durable lease so overlapping service processes cannot both advance delivery state.
CREATE TABLE sync_worker_lease (
  stall_id TEXT PRIMARY KEY NOT NULL,
  owner_token TEXT NOT NULL,
  fence_token INTEGER NOT NULL DEFAULT 1 CHECK (fence_token >= 1),
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
