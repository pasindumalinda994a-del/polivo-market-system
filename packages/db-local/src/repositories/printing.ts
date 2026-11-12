import { optionalString, requireAbsoluteTimestamp, requireString } from "../mapping/errors.js";
import { NotFoundError, RepositoryError, type DbExecutor } from "./types.js";

export type PrintDocumentKind =
  | "buyer_bill"
  | "farmer_bill"
  | "payment_receipt"
  | "account_statement"
  | "test_page";

export type PrintClassification = "initial" | "reprint";

export type PrintAttemptOutcome =
  | "prepared"
  | "submitting"
  | "accepted_by_print_system"
  | "failed_before_submission"
  | "cancelled_before_submission"
  | "outcome_unknown";

export type PrintPaperProfile = "thermal-80mm-test" | "a4-paged-test";

export type StallPrintIdentityRecord = {
  displayName: string;
  address: string | null;
  updatedAt: string;
};

export type PrintJobRecord = {
  id: string;
  stallId: string;
  documentKind: PrintDocumentKind;
  documentId: string;
  paperProfile: PrintPaperProfile;
  templateId: string;
  templateVersion: string;
  payloadHash: string;
  statementSnapshotToken: string | null;
  createOperationId: string;
  createdByStaffId: string;
  createdByDeviceId: string;
  createdAt: string;
  updatedAt: string;
};

export type PrintAttemptRecord = {
  id: string;
  jobId: string;
  stallId: string;
  classification: PrintClassification;
  reprintReason: string | null;
  outcome: PrintAttemptOutcome;
  printerSystemName: string | null;
  paperProfile: PrintPaperProfile;
  templateId: string;
  templateVersion: string;
  payloadHash: string;
  attemptReference: string;
  prepareOperationId: string;
  reportOperationId: string | null;
  outcomeDetail: string | null;
  requestedByStaffId: string;
  requestedByDeviceId: string;
  preparedAt: string;
  submittingAt: string | null;
  reportedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getStallPrintIdentity(executor: DbExecutor): StallPrintIdentityRecord | null {
  const row = executor.db
    .prepare(`SELECT display_name, address, updated_at FROM stall_print_identity WHERE id = 1`)
    .get() as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    displayName: requireString(row["display_name"], "stall_print_identity.display_name"),
    address: optionalString(row["address"], "stall_print_identity.address"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "stall_print_identity.updated_at"),
  };
}

export function upsertStallPrintIdentity(
  executor: DbExecutor,
  input: { displayName: string; address: string | null; updatedAt: string },
): StallPrintIdentityRecord {
  executor.db
    .prepare(
      `INSERT INTO stall_print_identity (id, display_name, address, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         address = excluded.address,
         updated_at = excluded.updated_at`,
    )
    .run(input.displayName, input.address, input.updatedAt);
  const loaded = getStallPrintIdentity(executor);
  if (loaded === null) {
    throw new RepositoryError("Failed to load stall print identity after upsert.");
  }
  return loaded;
}

export type InsertPrintJobInput = {
  id: string;
  stallId: string;
  documentKind: PrintDocumentKind;
  documentId: string;
  paperProfile: PrintPaperProfile;
  templateId: string;
  templateVersion: string;
  payloadHash: string;
  statementSnapshotToken: string | null;
  createOperationId: string;
  createdByStaffId: string;
  createdByDeviceId: string;
  createdAt: string;
  updatedAt: string;
};

export function insertPrintJob(executor: DbExecutor, input: InsertPrintJobInput): PrintJobRecord {
  executor.db
    .prepare(
      `INSERT INTO print_jobs (
         id, stall_id, document_kind, document_id, paper_profile, template_id, template_version,
         payload_hash, statement_snapshot_token, create_operation_id,
         created_by_staff_id, created_by_device_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.documentKind,
      input.documentId,
      input.paperProfile,
      input.templateId,
      input.templateVersion,
      input.payloadHash,
      input.statementSnapshotToken,
      input.createOperationId,
      input.createdByStaffId,
      input.createdByDeviceId,
      input.createdAt,
      input.updatedAt,
    );
  const created = getPrintJobById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load print job after insert.");
  }
  return created;
}

export function getPrintJobById(
  executor: DbExecutor,
  stallId: string,
  jobId: string,
): PrintJobRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, document_kind, document_id, paper_profile, template_id, template_version,
              payload_hash, statement_snapshot_token, create_operation_id,
              created_by_staff_id, created_by_device_id, created_at, updated_at
       FROM print_jobs
       WHERE id = ? AND stall_id = ?`,
    )
    .get(jobId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPrintJob(row);
}

export function getPrintJobByDocument(
  executor: DbExecutor,
  stallId: string,
  documentKind: PrintDocumentKind,
  documentId: string,
): PrintJobRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, document_kind, document_id, paper_profile, template_id, template_version,
              payload_hash, statement_snapshot_token, create_operation_id,
              created_by_staff_id, created_by_device_id, created_at, updated_at
       FROM print_jobs
       WHERE stall_id = ? AND document_kind = ? AND document_id = ?`,
    )
    .get(stallId, documentKind, documentId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPrintJob(row);
}

export function getPrintJobByCreateOperationId(
  executor: DbExecutor,
  stallId: string,
  createOperationId: string,
): PrintJobRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, document_kind, document_id, paper_profile, template_id, template_version,
              payload_hash, statement_snapshot_token, create_operation_id,
              created_by_staff_id, created_by_device_id, created_at, updated_at
       FROM print_jobs
       WHERE stall_id = ? AND create_operation_id = ?`,
    )
    .get(stallId, createOperationId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPrintJob(row);
}

export type InsertPrintAttemptInput = {
  id: string;
  jobId: string;
  stallId: string;
  classification: PrintClassification;
  reprintReason: string | null;
  outcome: PrintAttemptOutcome;
  printerSystemName: string | null;
  paperProfile: PrintPaperProfile;
  templateId: string;
  templateVersion: string;
  payloadHash: string;
  attemptReference: string;
  prepareOperationId: string;
  requestedByStaffId: string;
  requestedByDeviceId: string;
  preparedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function insertPrintAttempt(
  executor: DbExecutor,
  input: InsertPrintAttemptInput,
): PrintAttemptRecord {
  executor.db
    .prepare(
      `INSERT INTO print_attempts (
         id, job_id, stall_id, classification, reprint_reason, outcome, printer_system_name,
         paper_profile, template_id, template_version, payload_hash, attempt_reference,
         prepare_operation_id, report_operation_id, outcome_detail,
         requested_by_staff_id, requested_by_device_id,
         prepared_at, submitting_at, reported_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, NULL, NULL,
         ?, ?,
         ?, NULL, NULL, ?, ?
       )`,
    )
    .run(
      input.id,
      input.jobId,
      input.stallId,
      input.classification,
      input.reprintReason,
      input.outcome,
      input.printerSystemName,
      input.paperProfile,
      input.templateId,
      input.templateVersion,
      input.payloadHash,
      input.attemptReference,
      input.prepareOperationId,
      input.requestedByStaffId,
      input.requestedByDeviceId,
      input.preparedAt,
      input.createdAt,
      input.updatedAt,
    );
  const created = getPrintAttemptById(executor, input.stallId, input.id);
  if (created === null) {
    throw new RepositoryError("Failed to load print attempt after insert.");
  }
  return created;
}

export function getPrintAttemptById(
  executor: DbExecutor,
  stallId: string,
  attemptId: string,
): PrintAttemptRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, job_id, stall_id, classification, reprint_reason, outcome, printer_system_name,
              paper_profile, template_id, template_version, payload_hash, attempt_reference,
              prepare_operation_id, report_operation_id, outcome_detail,
              requested_by_staff_id, requested_by_device_id,
              prepared_at, submitting_at, reported_at, created_at, updated_at
       FROM print_attempts
       WHERE id = ? AND stall_id = ?`,
    )
    .get(attemptId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPrintAttempt(row);
}

export function getPrintAttemptByPrepareOperationId(
  executor: DbExecutor,
  stallId: string,
  prepareOperationId: string,
): PrintAttemptRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, job_id, stall_id, classification, reprint_reason, outcome, printer_system_name,
              paper_profile, template_id, template_version, payload_hash, attempt_reference,
              prepare_operation_id, report_operation_id, outcome_detail,
              requested_by_staff_id, requested_by_device_id,
              prepared_at, submitting_at, reported_at, created_at, updated_at
       FROM print_attempts
       WHERE stall_id = ? AND prepare_operation_id = ?`,
    )
    .get(stallId, prepareOperationId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPrintAttempt(row);
}

export function listPrintAttemptsForJob(
  executor: DbExecutor,
  stallId: string,
  jobId: string,
  limit: number,
): PrintAttemptRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT id, job_id, stall_id, classification, reprint_reason, outcome, printer_system_name,
              paper_profile, template_id, template_version, payload_hash, attempt_reference,
              prepare_operation_id, report_operation_id, outcome_detail,
              requested_by_staff_id, requested_by_device_id,
              prepared_at, submitting_at, reported_at, created_at, updated_at
       FROM print_attempts
       WHERE stall_id = ? AND job_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(stallId, jobId, limit) as Record<string, unknown>[];
  return rows.map(mapPrintAttempt);
}

export function markPrintAttemptSubmitting(
  executor: DbExecutor,
  input: { stallId: string; attemptId: string; submittingAt: string; updatedAt: string },
): PrintAttemptRecord {
  const existing = getPrintAttemptById(executor, input.stallId, input.attemptId);
  if (existing === null) {
    throw new NotFoundError("Print attempt not found.");
  }
  if (existing.outcome !== "prepared" && existing.outcome !== "submitting") {
    return existing;
  }
  executor.db
    .prepare(
      `UPDATE print_attempts
       SET outcome = 'submitting', submitting_at = COALESCE(submitting_at, ?), updated_at = ?
       WHERE id = ? AND stall_id = ? AND outcome IN ('prepared', 'submitting')`,
    )
    .run(input.submittingAt, input.updatedAt, input.attemptId, input.stallId);
  const updated = getPrintAttemptById(executor, input.stallId, input.attemptId);
  if (updated === null) {
    throw new RepositoryError("Failed to load print attempt after submitting mark.");
  }
  return updated;
}

export function reportPrintAttemptOutcome(
  executor: DbExecutor,
  input: {
    stallId: string;
    attemptId: string;
    outcome: Exclude<
      PrintAttemptOutcome,
      "prepared" | "submitting"
    >;
    outcomeDetail: string | null;
    reportOperationId: string;
    reportedAt: string;
    updatedAt: string;
  },
): PrintAttemptRecord {
  const existing = getPrintAttemptById(executor, input.stallId, input.attemptId);
  if (existing === null) {
    throw new NotFoundError("Print attempt not found.");
  }
  if (
    existing.outcome === "accepted_by_print_system" ||
    existing.outcome === "failed_before_submission" ||
    existing.outcome === "cancelled_before_submission" ||
    existing.outcome === "outcome_unknown"
  ) {
    return existing;
  }
  executor.db
    .prepare(
      `UPDATE print_attempts
       SET outcome = ?,
           outcome_detail = ?,
           report_operation_id = ?,
           reported_at = ?,
           updated_at = ?
       WHERE id = ? AND stall_id = ? AND outcome IN ('prepared', 'submitting')`,
    )
    .run(
      input.outcome,
      input.outcomeDetail,
      input.reportOperationId,
      input.reportedAt,
      input.updatedAt,
      input.attemptId,
      input.stallId,
    );
  const updated = getPrintAttemptById(executor, input.stallId, input.attemptId);
  if (updated === null) {
    throw new RepositoryError("Failed to load print attempt after outcome report.");
  }
  return updated;
}

function mapPrintJob(row: Record<string, unknown>): PrintJobRecord {
  return {
    id: requireString(row["id"], "print_jobs.id"),
    stallId: requireString(row["stall_id"], "print_jobs.stall_id"),
    documentKind: requireString(row["document_kind"], "print_jobs.document_kind") as PrintDocumentKind,
    documentId: requireString(row["document_id"], "print_jobs.document_id"),
    paperProfile: requireString(row["paper_profile"], "print_jobs.paper_profile") as PrintPaperProfile,
    templateId: requireString(row["template_id"], "print_jobs.template_id"),
    templateVersion: requireString(row["template_version"], "print_jobs.template_version"),
    payloadHash: requireString(row["payload_hash"], "print_jobs.payload_hash"),
    statementSnapshotToken: optionalString(
      row["statement_snapshot_token"],
      "print_jobs.statement_snapshot_token",
    ),
    createOperationId: requireString(row["create_operation_id"], "print_jobs.create_operation_id"),
    createdByStaffId: requireString(row["created_by_staff_id"], "print_jobs.created_by_staff_id"),
    createdByDeviceId: requireString(row["created_by_device_id"], "print_jobs.created_by_device_id"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "print_jobs.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "print_jobs.updated_at"),
  };
}

function mapPrintAttempt(row: Record<string, unknown>): PrintAttemptRecord {
  return {
    id: requireString(row["id"], "print_attempts.id"),
    jobId: requireString(row["job_id"], "print_attempts.job_id"),
    stallId: requireString(row["stall_id"], "print_attempts.stall_id"),
    classification: requireString(
      row["classification"],
      "print_attempts.classification",
    ) as PrintClassification,
    reprintReason: optionalString(row["reprint_reason"], "print_attempts.reprint_reason"),
    outcome: requireString(row["outcome"], "print_attempts.outcome") as PrintAttemptOutcome,
    printerSystemName: optionalString(
      row["printer_system_name"],
      "print_attempts.printer_system_name",
    ),
    paperProfile: requireString(
      row["paper_profile"],
      "print_attempts.paper_profile",
    ) as PrintPaperProfile,
    templateId: requireString(row["template_id"], "print_attempts.template_id"),
    templateVersion: requireString(row["template_version"], "print_attempts.template_version"),
    payloadHash: requireString(row["payload_hash"], "print_attempts.payload_hash"),
    attemptReference: requireString(row["attempt_reference"], "print_attempts.attempt_reference"),
    prepareOperationId: requireString(
      row["prepare_operation_id"],
      "print_attempts.prepare_operation_id",
    ),
    reportOperationId: optionalString(
      row["report_operation_id"],
      "print_attempts.report_operation_id",
    ),
    outcomeDetail: optionalString(row["outcome_detail"], "print_attempts.outcome_detail"),
    requestedByStaffId: requireString(
      row["requested_by_staff_id"],
      "print_attempts.requested_by_staff_id",
    ),
    requestedByDeviceId: requireString(
      row["requested_by_device_id"],
      "print_attempts.requested_by_device_id",
    ),
    preparedAt: requireAbsoluteTimestamp(row["prepared_at"], "print_attempts.prepared_at"),
    submittingAt: optionalString(row["submitting_at"], "print_attempts.submitting_at"),
    reportedAt: optionalString(row["reported_at"], "print_attempts.reported_at"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "print_attempts.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "print_attempts.updated_at"),
  };
}
