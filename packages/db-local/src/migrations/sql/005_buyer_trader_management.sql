-- Phase 18 buyer/trader management: optimistic concurrency and optional contact fields.
-- Do not modify migrations 001 or 004. Buyers persist on the separate traders table.

ALTER TABLE traders ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);
ALTER TABLE traders ADD COLUMN contact_number TEXT;
ALTER TABLE traders ADD COLUMN locality TEXT;

CREATE INDEX idx_traders_stall_active_name ON traders (stall_id, is_active, display_name);
