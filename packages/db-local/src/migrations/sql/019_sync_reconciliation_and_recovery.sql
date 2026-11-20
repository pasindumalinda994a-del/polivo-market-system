-- Phase 34: reconciliation runs, recovery plans/jobs, diagnostic export jobs.
-- Does not mutate financial source tables. No cursor reset helpers.

CREATE TABLE sync_reconciliation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'failed', 'cancelled')),
  scope TEXT NOT NULL,
  source_stream_id TEXT,
  stream_generation INTEGER,
  local_committed_tail INTEGER,
  verified_cloud_cursor INTEGER,
  comparable_cutoff INTEGER,
  manifest_version TEXT,
  definition_version TEXT,
  summary_json TEXT NOT NULL,
  summary_phrase TEXT,
  safe_next_action TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_by_staff_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL
);

CREATE INDEX idx_sync_reconciliation_runs_stall_started
  ON sync_reconciliation_runs (stall_id, started_at DESC);

CREATE TABLE sync_recovery_plans (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'retry_upload_worker',
      'replay_original_events',
      'recover_local_acknowledgement',
      'refresh_configuration',
      'retry_configuration_application',
      'retry_configuration_acknowledgement'
    )
  ),
  target_stream_id TEXT,
  target_config_domain TEXT CHECK (target_config_domain IS NULL OR target_config_domain = 'access'),
  event_group_range_json TEXT,
  configuration_revision INTEGER,
  expected_state_fingerprint TEXT NOT NULL,
  affected_item_count INTEGER NOT NULL CHECK (affected_item_count >= 0),
  safety_rationale TEXT NOT NULL,
  potential_outcome TEXT NOT NULL,
  required_capability TEXT NOT NULL CHECK (
    required_capability IN ('sync.retry', 'sync.recover')
  ),
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by_job_id TEXT
);

CREATE INDEX idx_sync_recovery_plans_stall_created
  ON sync_recovery_plans (stall_id, created_at DESC);

CREATE TABLE sync_recovery_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES sync_recovery_plans (id),
  action_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('requested', 'running', 'completed', 'failed', 'cancelled', 'outcome_uncertain')
  ),
  actor_staff_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  scope_description TEXT NOT NULL,
  progress_message TEXT,
  result_summary TEXT,
  error_code TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (stall_id, idempotency_key)
);

CREATE INDEX idx_sync_recovery_jobs_stall_updated
  ON sync_recovery_jobs (stall_id, updated_at DESC);

CREATE INDEX idx_sync_recovery_jobs_active
  ON sync_recovery_jobs (stall_id, action_type, state);

CREATE TABLE sync_diagnostic_exports (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  default_file_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'application/json'),
  content_sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  content_json TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  create_operation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_sync_diagnostic_exports_stall_created
  ON sync_diagnostic_exports (stall_id, created_at DESC);

CREATE TABLE sync_recovery_domain_locks (
  stall_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (stall_id, domain_key)
);
