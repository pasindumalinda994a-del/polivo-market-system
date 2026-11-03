-- Phase 14 host activation and terminal pairing metadata.
-- Credential private keys stay in OS-protected storage; only opaque refs and public verifiers live here.
-- Reuses local_installation and stall_binding from migration 001.

CREATE TABLE host_enrollment (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  host_device_id TEXT NOT NULL UNIQUE,
  installation_id TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  credential_version INTEGER NOT NULL CHECK (credential_version >= 1),
  activation_state TEXT NOT NULL CHECK (
    activation_state IN (
      'pending_credential',
      'redeeming',
      'bound',
      'confirming',
      'activated',
      'failed'
    )
  ),
  pending_operation_id TEXT,
  cloud_device_id TEXT,
  cloud_state_revision INTEGER,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (installation_id) REFERENCES local_installation (id) ON DELETE RESTRICT
);

CREATE TABLE accepted_terminals (
  terminal_device_id TEXT PRIMARY KEY NOT NULL,
  public_key TEXT NOT NULL,
  credential_version INTEGER NOT NULL CHECK (credential_version >= 1),
  label TEXT,
  pairing_state TEXT NOT NULL CHECK (
    pairing_state IN ('pending_host_confirm', 'accepted', 'revoked')
  ),
  cloud_state_revision INTEGER,
  accepted_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_accepted_terminals_pairing_state ON accepted_terminals (pairing_state);
