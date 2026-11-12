-- Phase 29: durable print jobs and attempts for bills, receipts, and statements.
-- Printing never mutates issued bill financial columns.
-- Migrations 001–014 remain unchanged.

-- Operator-maintained stall identity for print headers (not cloud tenant sync).
CREATE TABLE stall_print_identity (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  display_name TEXT NOT NULL,
  address TEXT,
  updated_at TEXT NOT NULL
);

-- Forward-compatible historical stall identity on newly issued bills.
ALTER TABLE trader_bills ADD COLUMN stall_display_name TEXT;
ALTER TABLE trader_bills ADD COLUMN stall_address TEXT;
ALTER TABLE farmer_bills ADD COLUMN stall_display_name TEXT;
ALTER TABLE farmer_bills ADD COLUMN stall_address TEXT;

CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  document_kind TEXT NOT NULL
    CHECK (document_kind IN (
      'buyer_bill',
      'farmer_bill',
      'payment_receipt',
      'account_statement',
      'test_page'
    )),
  document_id TEXT NOT NULL,
  paper_profile TEXT NOT NULL
    CHECK (paper_profile IN ('thermal-80mm-test', 'a4-paged-test')),
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  statement_snapshot_token TEXT,
  create_operation_id TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, create_operation_id),
  UNIQUE (stall_id, document_kind, document_id)
);

CREATE INDEX idx_print_jobs_stall_document
  ON print_jobs (stall_id, document_kind, document_id);

CREATE TABLE print_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  classification TEXT NOT NULL
    CHECK (classification IN ('initial', 'reprint')),
  reprint_reason TEXT,
  outcome TEXT NOT NULL
    CHECK (outcome IN (
      'prepared',
      'submitting',
      'accepted_by_print_system',
      'failed_before_submission',
      'cancelled_before_submission',
      'outcome_unknown'
    )),
  printer_system_name TEXT,
  paper_profile TEXT NOT NULL
    CHECK (paper_profile IN ('thermal-80mm-test', 'a4-paged-test')),
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attempt_reference TEXT NOT NULL,
  prepare_operation_id TEXT NOT NULL,
  report_operation_id TEXT,
  outcome_detail TEXT,
  requested_by_staff_id TEXT NOT NULL,
  requested_by_device_id TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  submitting_at TEXT,
  reported_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id),
  UNIQUE (stall_id, prepare_operation_id),
  CHECK (
    (classification = 'initial' AND reprint_reason IS NULL)
    OR (classification = 'reprint' AND reprint_reason IS NOT NULL AND length(trim(reprint_reason)) > 0)
  )
);

CREATE INDEX idx_print_attempts_job_created
  ON print_attempts (stall_id, job_id, created_at DESC, id);

CREATE INDEX idx_print_attempts_document_via_job
  ON print_attempts (stall_id, created_at DESC);
