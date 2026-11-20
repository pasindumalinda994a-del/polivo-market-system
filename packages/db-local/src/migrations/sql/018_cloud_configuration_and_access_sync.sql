-- Phase 33: local effective access configuration, received snapshots, and pending acknowledgements.
-- Does not mutate financial, commission, or printer tables.

CREATE TABLE config_domain_state (
  domain TEXT PRIMARY KEY NOT NULL CHECK (domain IN ('access')),
  effective_revision INTEGER,
  publication_id TEXT,
  payload_hash TEXT,
  issued_at TEXT,
  max_snapshot_age_ms INTEGER,
  last_successful_refresh_at TEXT,
  last_pull_attempt_at TEXT,
  pending_ack INTEGER NOT NULL DEFAULT 0 CHECK (pending_ack IN (0, 1)),
  pending_ack_revision INTEGER,
  pending_ack_publication_id TEXT,
  pending_ack_payload_hash TEXT,
  pending_ack_result TEXT CHECK (
    pending_ack_result IS NULL
    OR pending_ack_result IN ('applied', 'already_applied', 'rejected', 'blocked')
  ),
  pending_ack_error_code TEXT,
  pending_ack_message TEXT,
  pending_ack_applied_at TEXT,
  block_error_code TEXT,
  block_message TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO config_domain_state (domain, updated_at)
VALUES ('access', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE config_received_snapshots (
  domain TEXT NOT NULL CHECK (domain IN ('access')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  publication_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  max_snapshot_age_ms INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  applied_at TEXT,
  PRIMARY KEY (domain, revision)
);

CREATE UNIQUE INDEX idx_config_received_publication
  ON config_received_snapshots (domain, publication_id);

CREATE TABLE config_application_audit (
  id TEXT PRIMARY KEY NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('access')),
  revision INTEGER NOT NULL,
  publication_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('applied', 'already_applied', 'rejected', 'blocked')),
  error_code TEXT,
  message TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX idx_config_application_audit_domain
  ON config_application_audit (domain, recorded_at DESC);
