-- Phase 17 farmer management: optimistic concurrency and optional contact fields.
-- Do not modify migration 001. Traders remain unchanged until Phase 18.

ALTER TABLE farmers ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);
ALTER TABLE farmers ADD COLUMN contact_number TEXT;
ALTER TABLE farmers ADD COLUMN locality TEXT;

CREATE INDEX idx_farmers_stall_active_name ON farmers (stall_id, is_active, display_name);
