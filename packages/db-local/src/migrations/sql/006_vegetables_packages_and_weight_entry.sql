-- Phase 19 vegetables, package types, and weight-entry catalog foundations.
-- Do not modify migrations 001–005. Categories remain deferred (ADR 0004).
-- No default tare columns on package_types; packaging deductions stay explicit on entries.

ALTER TABLE vegetables ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

CREATE INDEX idx_vegetables_stall_active_name ON vegetables (stall_id, is_active, display_name);

CREATE TABLE package_types (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, short_code),
  UNIQUE (id, stall_id)
);

CREATE INDEX idx_package_types_stall_active_name ON package_types (stall_id, is_active, display_name);
CREATE INDEX idx_package_types_stall_short_code ON package_types (stall_id, short_code);
