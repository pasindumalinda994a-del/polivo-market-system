-- Phase 15 local staff identities, credentials, capability snapshots, and sessions.
-- Secrets are stored only as adaptive verifiers; never plaintext.
-- Credential and session verifiers must not appear in financial outbox payloads.

CREATE TABLE local_staff (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  staff_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  is_local_owner INTEGER NOT NULL CHECK (is_local_owner IN (0, 1)),
  cloud_membership_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT,
  UNIQUE (tenant_id, staff_code)
);

CREATE UNIQUE INDEX idx_local_staff_single_owner
  ON local_staff (tenant_id)
  WHERE is_local_owner = 1;

CREATE INDEX idx_local_staff_tenant_status ON local_staff (tenant_id, status);

CREATE TABLE local_staff_credentials (
  staff_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  verifier_format TEXT NOT NULL CHECK (verifier_format = 'scrypt$v1'),
  credential_revision INTEGER NOT NULL CHECK (credential_revision >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES local_staff (id) ON DELETE RESTRICT
);

CREATE TABLE local_staff_capability_snapshots (
  staff_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  authority_verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES local_staff (id) ON DELETE RESTRICT
);

CREATE INDEX idx_local_staff_snapshots_verified
  ON local_staff_capability_snapshots (authority_verified_at);

CREATE TABLE local_staff_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  -- SHA-256 hex digest of the high-entropy session secret (not a password hash).
  verifier TEXT NOT NULL,
  credential_revision INTEGER NOT NULL CHECK (credential_revision >= 1),
  issued_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (staff_id) REFERENCES local_staff (id) ON DELETE RESTRICT
);

CREATE INDEX idx_local_staff_sessions_staff ON local_staff_sessions (staff_id);
CREATE INDEX idx_local_staff_sessions_device ON local_staff_sessions (device_id);
CREATE UNIQUE INDEX idx_local_staff_sessions_verifier ON local_staff_sessions (verifier);

CREATE TABLE local_staff_login_attempts (
  device_id TEXT NOT NULL,
  staff_code TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, staff_code)
);

CREATE TABLE local_security_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT,
  stall_id TEXT,
  actor_ref TEXT,
  device_ref TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  occurred_at TEXT NOT NULL,
  correlation_ref TEXT,
  details_json TEXT
);

CREATE INDEX idx_local_security_audit_occurred
  ON local_security_audit_events (occurred_at);
