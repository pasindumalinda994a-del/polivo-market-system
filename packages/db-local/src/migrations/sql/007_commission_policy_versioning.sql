-- Phase 20: immutable commission policy versions + single active pointer per stall.
-- Does not seed production rates. Existing commission_band_sets / commission_bands retained.

ALTER TABLE commission_band_sets ADD COLUMN version_number INTEGER;
ALTER TABLE commission_band_sets ADD COLUMN created_by_staff_id TEXT;
ALTER TABLE commission_band_sets ADD COLUMN activated_at TEXT;
ALTER TABLE commission_band_sets ADD COLUMN activated_by_staff_id TEXT;
ALTER TABLE commission_band_sets ADD COLUMN previous_band_set_id TEXT;

-- Existing rows (if any) are not production seeds; assign placeholder version numbers uniquely per stall.
UPDATE commission_band_sets
SET version_number = (
  SELECT COUNT(*)
  FROM commission_band_sets AS earlier
  WHERE earlier.stall_id = commission_band_sets.stall_id
    AND (
      earlier.created_at < commission_band_sets.created_at
      OR (earlier.created_at = commission_band_sets.created_at AND earlier.id <= commission_band_sets.id)
    )
)
WHERE version_number IS NULL;

CREATE UNIQUE INDEX idx_commission_band_sets_stall_version
  ON commission_band_sets (stall_id, version_number);

CREATE TABLE commission_policies (
  stall_id TEXT PRIMARY KEY NOT NULL,
  active_band_set_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (active_band_set_id, stall_id)
    REFERENCES commission_band_sets (id, stall_id) ON DELETE RESTRICT
);

CREATE INDEX idx_commission_policies_active_set
  ON commission_policies (active_band_set_id)
  WHERE active_band_set_id IS NOT NULL;
