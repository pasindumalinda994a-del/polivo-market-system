-- Phase 30: operational report export job metadata and report-oriented indexes.
-- Report generation never mutates financial records.
-- Migrations 001–015 remain unchanged.

CREATE TABLE report_export_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  report_type TEXT NOT NULL
    CHECK (report_type IN (
      'sales_summary',
      'sales_detail',
      'vegetable_sales',
      'farmer_activity',
      'buyer_activity',
      'commission',
      'payments',
      'outstanding',
      'vegetable_prices',
      'corrections_reversals'
    )),
  format TEXT NOT NULL CHECK (format IN ('csv', 'pdf')),
  status TEXT NOT NULL
    CHECK (status IN ('preparing', 'ready', 'failed', 'expired')),
  definition_version TEXT NOT NULL,
  snapshot_token TEXT NOT NULL,
  filter_fingerprint TEXT NOT NULL,
  normalized_filters_json TEXT NOT NULL,
  row_count INTEGER,
  content_sha256 TEXT,
  content_bytes BLOB,
  content_type TEXT,
  byte_length INTEGER,
  default_file_name TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  created_by_staff_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  create_operation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ready_at TEXT,
  UNIQUE (stall_id, create_operation_id)
);

CREATE INDEX idx_report_export_jobs_stall_created
  ON report_export_jobs (stall_id, created_at DESC);

CREATE INDEX idx_report_export_jobs_stall_status_expires
  ON report_export_jobs (stall_id, status, expires_at);

-- Report activity queries filter finalized sales by business date within a stall.
CREATE INDEX IF NOT EXISTS idx_sales_stall_status_business_date
  ON sales (stall_id, status, business_date, id);

CREATE INDEX IF NOT EXISTS idx_sale_lines_stall_vegetable
  ON sale_lines (stall_id, vegetable_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_lines_stall_farmer
  ON sale_lines (stall_id, farmer_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_correction_ops_stall_business_date
  ON sale_correction_operations (stall_id, business_date, recorded_at);
