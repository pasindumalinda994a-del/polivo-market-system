import { createHash } from "node:crypto";

import {
  PRINT_ATTEMPT_OUTCOME_EVENT_TYPE,
  PRINT_ATTEMPT_PREPARED_EVENT_TYPE,
  PRINT_EVENT_SCHEMA_VERSION,
  PRINT_JOB_CREATED_EVENT_TYPE,
  accountStatementViewModelSchema,
  buyerBillPrintContentSchema,
  createPrintJobRequestSchema,
  createPrintJobResponseSchema,
  farmerBillPrintContentSchema,
  getPrintAttemptResponseSchema,
  listPrintAttemptsQuerySchema,
  listPrintAttemptsResponseSchema,
  markPrintAttemptSubmittingRequestSchema,
  markPrintAttemptSubmittingResponseSchema,
  opaqueIdSchema,
  paymentReceiptPrintContentSchema,
  preparePrintAttemptRequestSchema,
  preparePrintAttemptResponseSchema,
  printAttemptOutcomeEventPayloadSchema,
  printAttemptPreparedEventPayloadSchema,
  printAttemptRecordSchema,
  printDocumentStatusAnnotationSchema,
  printJobCreatedEventPayloadSchema,
  printJobRecordSchema,
  printStallIdentitySchema,
  printViewModelSchema,
  stallPrintIdentityResponseSchema,
  upsertStallPrintIdentityRequestSchema,
  recoverPrintAttemptRequestSchema,
  recoverPrintAttemptResponseSchema,
  reportPrintAttemptOutcomeRequestSchema,
  reportPrintAttemptOutcomeResponseSchema,
  testPagePrintContentSchema,
  accountStatementPrintContentSchema,
  type CreatePrintJobRequest,
  type CreatePrintJobResponse,
  type GetPrintAttemptResponse,
  type ListPrintAttemptsQuery,
  type ListPrintAttemptsResponse,
  type MarkPrintAttemptSubmittingRequest,
  type MarkPrintAttemptSubmittingResponse,
  type AccountStatementViewModelDto,
  type PreparePrintAttemptRequest,
  type PreparePrintAttemptResponse,
  type PrintAttemptRecordDto,
  type PrintClassificationDto,
  type PrintDocumentContentDto,
  type PrintDocumentKindDto,
  type PrintDocumentStatusAnnotationDto,
  type PrintJobRecordDto,
  type PrintPaperProfileDto,
  type PrintStallIdentityDto,
  type PrintViewModelDto,
  type RecoverPrintAttemptRequest,
  type RecoverPrintAttemptResponse,
  type ReportPrintAttemptOutcomeRequest,
  type ReportPrintAttemptOutcomeResponse,
  type StallPrintIdentityResponse,
  type TestPagePrintContentDto,
  type UpsertStallPrintIdentityRequest,
  PAGINATION_MAX_LIMIT,
} from "@polivo/contracts";
import {
  appendAuditEvent,
  getBillHistoryChainDetail,
  getFarmerBillById,
  getPaymentById,
  getPrintAttemptById,
  getPrintAttemptByPrepareOperationId,
  getPrintJobByCreateOperationId,
  getPrintJobByDocument,
  getPrintJobById,
  getStallPrintIdentity,
  getTraderBillById,
  insertPrintAttempt,
  insertPrintJob,
  listPrintAttemptsForJob,
  markPrintAttemptSubmitting,
  reportPrintAttemptOutcome,
  runInTransaction,
  upsertStallPrintIdentity,
  type DbExecutor,
  type LocalDatabase,
  type PrintAttemptRecord,
  type PrintJobRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  DomainError,
  PRINT_TEMPLATE_VERSION,
  buildPrintPayloadHashMaterial,
  canReportPrintOutcome,
  classifyAdditionalPrintAttempt,
  decodeStatementSnapshotToken,
  isSnapshotExpired,
  isTerminalPrintOutcome,
  reprintLabelFor,
  templateIdForDocumentKind,
  type StatementSnapshotPayload,
} from "@polivo/domain";
import { z } from "zod";
import type { AuthorizedPrincipal } from "../auth/authorization.js";
import type { DeviceProof } from "../auth/device-proof.js";
import { resolveBoundStall, type ExecutionContext } from "../context/execution-context.js";
import {
  AppError,
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from "../errors/app-error.js";
import { loadAccountStatement } from "./account-statement-commands.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";
import { loadFinalizedFarmerBillDto } from "./farmer-bill-commands.js";
import {
  PAYMENTS_PAY_FARMER_CAPABILITY,
  PAYMENTS_RECEIVE_TRADER_CAPABILITY,
  PAYMENTS_RECORD_CHEQUE_CAPABILITY,
  toPaymentRecordDto,
} from "./payment-commands.js";
import { loadFinalizedTraderBillDto } from "./sale-commands.js";

function hashPrintPayload(canonicalBody: unknown): string {
  return createHash("sha256")
    .update(buildPrintPayloadHashMaterial(canonicalBody), "utf8")
    .digest("hex");
}

export {
  stallPrintIdentityResponseSchema,
  upsertStallPrintIdentityRequestSchema,
  type StallPrintIdentityResponse,
  type UpsertStallPrintIdentityRequest,
};

// ---------------------------------------------------------------------------
// Capabilities and command identities
// ---------------------------------------------------------------------------

export const DOCUMENTS_PRINT_CAPABILITY = "documents.print";
export const DOCUMENTS_REPRINT_CAPABILITY = "documents.reprint";

const SETTINGS_MANAGE_CAPABILITY = "settings.manage";
const ACCOUNTS_VIEW_CAPABILITY = "accounts.view";

/** Any bill capability grants the right to see (and therefore print) issued bills. */
const BILL_DOCUMENT_CAPABILITIES = [
  "bills.create",
  "bills.edit_draft",
  "bills.finalize",
  "bills.correct_finalized",
  "bills.cancel_finalized",
] as const;

const PAYMENT_DOCUMENT_CAPABILITIES = [
  PAYMENTS_RECEIVE_TRADER_CAPABILITY,
  PAYMENTS_PAY_FARMER_CAPABILITY,
  PAYMENTS_RECORD_CHEQUE_CAPABILITY,
] as const;

export const PRINT_CREATE_JOB_COMMAND_TYPE = "print.create_job";
export const PRINT_PREPARE_ATTEMPT_COMMAND_TYPE = "print.prepare_attempt";
export const PRINT_MARK_SUBMITTING_COMMAND_TYPE = "print.mark_attempt_submitting";
export const PRINT_REPORT_OUTCOME_COMMAND_TYPE = "print.report_attempt_outcome";
export const PRINT_RECOVER_ATTEMPT_COMMAND_TYPE = "print.recover_attempt";

/** Upper bound on movements printed on one statement; avoids unbounded memory/payload growth. */
export const MAX_STATEMENT_PRINT_ROWS = 5000;
/** Prior attempts scanned when classifying an additional attempt. */
const MAX_ATTEMPTS_SCANNED = 1000;

export const RECOVERED_OUTCOME_DETAIL =
  "Recovered after an interruption while submitting. Physical output is unknown; check the printer and Windows print queue before reprinting.";

type PrintRequestMeta = {
  requestId: string;
  deviceProof: DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
};

/** Read-side context used by queries; capabilities come from the verified principal. */
export type PrintReadContext = {
  tenantId: string;
  stallId: string;
  capabilities: ReadonlySet<string>;
};

// ---------------------------------------------------------------------------
// Access rules (pure helpers, unit-testable)
// ---------------------------------------------------------------------------

export type PrintAccessMode = "print" | "reprint" | "view";

/** Document-kind capabilities of which at least one is required. Empty = none required. */
export function documentKindCapabilities(kind: PrintDocumentKindDto): readonly string[] {
  switch (kind) {
    case "buyer_bill":
    case "farmer_bill":
      return BILL_DOCUMENT_CAPABILITIES;
    case "payment_receipt":
      return PAYMENT_DOCUMENT_CAPABILITIES;
    case "account_statement":
      return [ACCOUNTS_VIEW_CAPABILITY];
    case "test_page":
      return [];
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown print document kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Whether the capability set may view/print/reprint a document of this kind.
 * Test pages are nonfinancial and only ever need `documents.print`.
 */
export function canAccessPrintDocument(
  capabilities: ReadonlySet<string>,
  kind: PrintDocumentKindDto,
  mode: PrintAccessMode,
): boolean {
  const hasPrint = capabilities.has(DOCUMENTS_PRINT_CAPABILITY);
  const hasReprint = capabilities.has(DOCUMENTS_REPRINT_CAPABILITY);
  if (kind === "test_page") {
    return hasPrint;
  }
  const modeAllowed =
    mode === "print" ? hasPrint : mode === "reprint" ? hasReprint : hasPrint || hasReprint;
  if (!modeAllowed) {
    return false;
  }
  return documentKindCapabilities(kind).some((capability) => capabilities.has(capability));
}

export function assertCanAccessPrintDocument(
  capabilities: ReadonlySet<string>,
  kind: PrintDocumentKindDto,
  mode: PrintAccessMode,
): void {
  if (!canAccessPrintDocument(capabilities, kind, mode)) {
    throw forbiddenError(
      mode === "reprint"
        ? `Missing capability to reprint ${kind} documents.`
        : `Missing capability to ${mode === "print" ? "print" : "view"} ${kind} documents.`,
    );
  }
}

/** Capability the command runner must enforce for a print/reprint of this kind. */
export function requiredPrintCapability(
  kind: PrintDocumentKindDto,
  classification: PrintClassificationDto,
): string {
  if (kind === "test_page") {
    return DOCUMENTS_PRINT_CAPABILITY;
  }
  return classification === "reprint" ? DOCUMENTS_REPRINT_CAPABILITY : DOCUMENTS_PRINT_CAPABILITY;
}

export function assertCanManageStallPrintIdentity(capabilities: ReadonlySet<string>): void {
  if (
    !capabilities.has(SETTINGS_MANAGE_CAPABILITY) &&
    !capabilities.has(DOCUMENTS_PRINT_CAPABILITY)
  ) {
    throw forbiddenError(
      `Missing capability: ${SETTINGS_MANAGE_CAPABILITY} or ${DOCUMENTS_PRINT_CAPABILITY}`,
    );
  }
}

/**
 * Resolve the classification of a prepare request against the conservative server rule.
 * A prior accepted/submitting/unknown attempt forces a reprint; a reprint needs a reason.
 */
export function resolvePrepareClassification(args: {
  requested: PrintClassificationDto;
  required: PrintClassificationDto;
  reprintReason: string | undefined;
}): { classification: PrintClassificationDto; reprintReason: string | null } {
  if (args.requested === "initial") {
    if (args.required === "reprint") {
      throw conflictError(
        "A previous attempt for this document was accepted or has an uncertain outcome. Submit an explicit reprint with a reason.",
      );
    }
    if (args.reprintReason !== undefined) {
      throw validationError("A reprint reason is only allowed for reprints.", [
        {
          path: "reprintReason",
          code: "REPRINT_REASON_NOT_ALLOWED",
          message: "Remove the reprint reason or request a reprint classification.",
        },
      ]);
    }
    return { classification: "initial", reprintReason: null };
  }
  const reason = args.reprintReason?.trim() ?? "";
  if (reason.length === 0) {
    throw validationError("A reprint reason is required.", [
      {
        path: "reprintReason",
        code: "REPRINT_REASON_REQUIRED",
        message: "Provide the reason an additional copy is needed.",
      },
    ]);
  }
  return { classification: "reprint", reprintReason: reason };
}

/** Human-readable attempt reference printed on the document footer. */
export function formatPrintAttemptReference(attemptId: string): string {
  const compact = attemptId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12)
    .toUpperCase();
  return `PRT-${compact.length > 0 ? compact : "ATTEMPT"}`;
}

// ---------------------------------------------------------------------------
// Status annotations (pure helpers)
// ---------------------------------------------------------------------------

export function currentStatusAnnotation(): PrintDocumentStatusAnnotationDto {
  return printDocumentStatusAnnotationSchema.parse({
    status: "current",
    label: "Current",
    replacementDocumentId: null,
    replacementBillNumber: null,
  });
}

export function buildBuyerBillStatusAnnotation(args: {
  correctionStatus: "active" | "reversed" | "superseded" | "none";
  replacementBillId: string | null;
  replacementBillNumber: string | null;
  /** True when the bill was issued as the replacement of a corrected sale. */
  isCorrectionReplacement: boolean;
}): PrintDocumentStatusAnnotationDto {
  if (args.correctionStatus === "reversed") {
    return printDocumentStatusAnnotationSchema.parse({
      status: "reversed",
      label: "REVERSED - not a current valid bill",
      replacementDocumentId: null,
      replacementBillNumber: null,
    });
  }
  if (args.correctionStatus === "superseded") {
    return printDocumentStatusAnnotationSchema.parse({
      status: "superseded",
      label:
        args.replacementBillNumber === null
          ? "SUPERSEDED - replaced by a corrected bill"
          : `SUPERSEDED - replaced by ${args.replacementBillNumber}`,
      replacementDocumentId: args.replacementBillId,
      replacementBillNumber: args.replacementBillNumber,
    });
  }
  if (args.isCorrectionReplacement) {
    return printDocumentStatusAnnotationSchema.parse({
      status: "adjusted",
      label: "ADJUSTED - corrected replacement bill",
      replacementDocumentId: null,
      replacementBillNumber: null,
    });
  }
  return currentStatusAnnotation();
}

export function buildPaymentStatusAnnotation(payment: {
  status: string;
  reversedByPaymentId: string | null;
  reversesPaymentId: string | null;
}): PrintDocumentStatusAnnotationDto {
  if (payment.status === "reversed" || payment.reversedByPaymentId !== null) {
    return printDocumentStatusAnnotationSchema.parse({
      status: "reversed",
      label: "REVERSED - bookkeeping reversal recorded",
      replacementDocumentId: null,
      replacementBillNumber: null,
    });
  }
  if (payment.reversesPaymentId !== null) {
    return printDocumentStatusAnnotationSchema.parse({
      status: "current",
      label: "Reversal entry",
      replacementDocumentId: null,
      replacementBillNumber: null,
    });
  }
  return currentStatusAnnotation();
}

// ---------------------------------------------------------------------------
// Record -> DTO mapping
// ---------------------------------------------------------------------------

export function toPrintJobRecordDto(job: PrintJobRecord): PrintJobRecordDto {
  // The stored statement snapshot token is internal and deliberately omitted.
  return printJobRecordSchema.parse({
    id: job.id,
    stallId: job.stallId,
    documentKind: job.documentKind,
    documentId: job.documentId,
    paperProfile: job.paperProfile,
    templateId: job.templateId,
    templateVersion: job.templateVersion,
    payloadHash: job.payloadHash,
    createOperationId: job.createOperationId,
    createdByStaffId: job.createdByStaffId,
    createdByDeviceId: job.createdByDeviceId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

export function toPrintAttemptRecordDto(attempt: PrintAttemptRecord): PrintAttemptRecordDto {
  return printAttemptRecordSchema.parse({
    id: attempt.id,
    jobId: attempt.jobId,
    stallId: attempt.stallId,
    classification: attempt.classification,
    reprintReason: attempt.reprintReason,
    outcome: attempt.outcome,
    printerSystemName: attempt.printerSystemName,
    paperProfile: attempt.paperProfile,
    templateId: attempt.templateId,
    templateVersion: attempt.templateVersion,
    payloadHash: attempt.payloadHash,
    attemptReference: attempt.attemptReference,
    prepareOperationId: attempt.prepareOperationId,
    reportOperationId: attempt.reportOperationId,
    outcomeDetail: attempt.outcomeDetail,
    requestedByStaffId: attempt.requestedByStaffId,
    requestedByDeviceId: attempt.requestedByDeviceId,
    preparedAt: attempt.preparedAt,
    submittingAt: attempt.submittingAt,
    reportedAt: attempt.reportedAt,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  });
}

// ---------------------------------------------------------------------------
// Authoritative document loading
// ---------------------------------------------------------------------------

export type PrintDocumentSource = {
  content: PrintDocumentContentDto;
  stallIdentity: PrintStallIdentityDto;
  statusAnnotation: PrintDocumentStatusAnnotationDto;
};

export type LoadPrintDocumentArgs = {
  tenantId: string;
  stallId: string;
  documentKind: PrintDocumentKindDto;
  documentId: string;
  paperProfile: PrintPaperProfileDto;
  /** Required for account_statement documents. */
  statementSnapshotToken: string | null;
  /** When set, a statement snapshot expired at this instant must be regenerated. */
  requireUnexpiredStatementAt: string | null;
};

const FALLBACK_STALL_DISPLAY_NAME = "Polivo stall";

/**
 * Stall header for a document. Historical identity captured on the issued bill wins;
 * otherwise the live (unverified) print identity or a neutral fallback is used.
 */
export function resolveStallPrintIdentity(
  executor: DbExecutor,
  historical: { displayName: string | null; address: string | null } | null,
): PrintStallIdentityDto {
  if (
    historical !== null &&
    historical.displayName !== null &&
    historical.displayName.trim().length > 0
  ) {
    return printStallIdentitySchema.parse({
      displayName: historical.displayName,
      address: historical.address,
      provenance: "historical",
    });
  }
  const current = getStallPrintIdentity(executor);
  return printStallIdentitySchema.parse({
    displayName: current?.displayName ?? FALLBACK_STALL_DISPLAY_NAME,
    address: current?.address ?? null,
    provenance: "current_unverified",
  });
}

export function buildTestPageContent(paperProfile: PrintPaperProfileDto): TestPagePrintContentDto {
  return testPagePrintContentSchema.parse({
    kind: "test_page",
    applicationId: "polivo",
    profileId: paperProfile,
    sampleSinhala: "පරීක්ෂාව",
    sampleEnglish: "Polivo printer test",
  });
}

function mapSnapshotDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      { path: "statementSnapshotToken", code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function decodeSnapshotOrThrow(token: string): StatementSnapshotPayload {
  try {
    return decodeStatementSnapshotToken(token);
  } catch (error) {
    return mapSnapshotDomainError(error);
  }
}

/**
 * Build the complete statement (every page of the captured snapshot) for printing.
 * The snapshot watermarks are reused, so every page reflects the same data cutoff.
 */
export function loadStatementPrintContent(
  database: LocalDatabase,
  args: {
    tenantId: string;
    stallId: string;
    snapshotToken: string;
    requireUnexpiredAt: string | null;
  },
): AccountStatementViewModelDto {
  const payload = decodeSnapshotOrThrow(args.snapshotToken);
  if (payload.stallId !== args.stallId) {
    throw notFoundError("Statement snapshot was not found for this stall.");
  }
  if (
    payload.purpose !== "statement" ||
    payload.fromBusinessDate === null ||
    payload.toBusinessDate === null
  ) {
    throw validationError("Snapshot token is not an account statement snapshot.", [
      {
        path: "statementSnapshotToken",
        code: "NOT_A_STATEMENT_SNAPSHOT",
        message: "Provide the snapshot token of a statement with a date range.",
      },
    ]);
  }
  if (payload.filterFingerprint !== null) {
    throw validationError("Filtered statements cannot be printed.", [
      {
        path: "statementSnapshotToken",
        code: "FILTERED_STATEMENT",
        message: "Print the complete period statement without a movement filter.",
      },
    ]);
  }
  if (
    args.requireUnexpiredAt !== null &&
    isSnapshotExpired(payload.expiresAt, args.requireUnexpiredAt)
  ) {
    throw conflictError("Statement snapshot expired. Regenerate the statement before printing.");
  }

  const rows: AccountStatementViewModelDto["orderedRows"] = [];
  let firstPage: ReturnType<typeof loadAccountStatement> | null = null;
  let cursor: string | undefined;
  const maxPages = Math.ceil(MAX_STATEMENT_PRINT_ROWS / PAGINATION_MAX_LIMIT) + 1;
  for (let page = 0; page < maxPages; page += 1) {
    // The captured timestamp keeps the snapshot "unexpired" so a rebuilt document is stable.
    const response = loadAccountStatement(
      database,
      args.stallId,
      payload.partyKind,
      payload.partyId,
      {
        currency: "LKR",
        fromBusinessDate: payload.fromBusinessDate,
        toBusinessDate: payload.toBusinessDate,
        dateBasis: "business_effective",
        limit: PAGINATION_MAX_LIMIT,
        snapshotToken: args.snapshotToken,
        cursor,
      },
      payload.capturedAt,
      args.tenantId,
    );
    firstPage ??= response;
    rows.push(...response.items);
    if (rows.length > MAX_STATEMENT_PRINT_ROWS) {
      throw validationError("Statement has too many movements to print in one document.", [
        {
          path: "statementSnapshotToken",
          code: "STATEMENT_TOO_LARGE",
          message: `Statements are limited to ${MAX_STATEMENT_PRINT_ROWS} movements. Select a shorter period.`,
        },
      ]);
    }
    if (response.nextCursor === null) {
      if (firstPage.summary.movementCount !== rows.length) {
        throw conflictError("Statement pages were inconsistent. Regenerate the statement.");
      }
      return accountStatementViewModelSchema.parse({
        viewModelVersion: firstPage.viewModelVersion,
        header: firstPage.header,
        summary: firstPage.summary,
        snapshot: firstPage.snapshot,
        orderedRows: rows,
        outstandingRequested: false,
      });
    }
    cursor = response.nextCursor;
  }
  throw validationError("Statement has too many movements to print in one document.", [
    {
      path: "statementSnapshotToken",
      code: "STATEMENT_TOO_LARGE",
      message: `Statements are limited to ${MAX_STATEMENT_PRINT_ROWS} movements. Select a shorter period.`,
    },
  ]);
}

/** Load the authoritative issued document plus stall identity and status annotation. */
export function loadPrintDocument(
  database: LocalDatabase,
  args: LoadPrintDocumentArgs,
): PrintDocumentSource {
  switch (args.documentKind) {
    case "buyer_bill": {
      const bill = loadFinalizedTraderBillDto(database, args.stallId, args.documentId);
      if (bill === null) {
        throw notFoundError("Buyer bill was not found.");
      }
      const chain = getBillHistoryChainDetail(database, {
        stallId: args.stallId,
        billType: "trader",
        billId: args.documentId,
      });
      const traderBill = chain?.traderBill ?? null;
      const replacementId =
        traderBill?.replacementTraderBillId ?? chain?.replacementTraderBillId ?? null;
      const replacementBill =
        replacementId === null ? null : getTraderBillById(database, args.stallId, replacementId);
      return {
        content: buyerBillPrintContentSchema.parse({ kind: "buyer_bill", bill }),
        stallIdentity: resolveStallPrintIdentity(
          database,
          traderBill === null
            ? null
            : { displayName: traderBill.stallDisplayName, address: traderBill.stallAddress },
        ),
        statusAnnotation: buildBuyerBillStatusAnnotation({
          correctionStatus: chain?.correctionStatus ?? "none",
          replacementBillId: replacementId,
          replacementBillNumber: replacementBill?.billNumber ?? null,
          isCorrectionReplacement: chain?.sale?.correctsSaleId != null,
        }),
      };
    }
    case "farmer_bill": {
      const bill = loadFinalizedFarmerBillDto(database, args.stallId, args.documentId);
      if (bill === null) {
        throw notFoundError("Farmer bill was not found.");
      }
      const detail = getFarmerBillById(database, args.stallId, args.documentId);
      return {
        content: farmerBillPrintContentSchema.parse({ kind: "farmer_bill", bill }),
        stallIdentity: resolveStallPrintIdentity(
          database,
          detail === null
            ? null
            : { displayName: detail.stallDisplayName, address: detail.stallAddress },
        ),
        // Farmer bills carry no correction lineage today; they are always the current document.
        statusAnnotation: currentStatusAnnotation(),
      };
    }
    case "payment_receipt": {
      const payment = getPaymentById(database, args.stallId, args.documentId);
      if (payment === null) {
        throw notFoundError("Payment was not found.");
      }
      return {
        content: paymentReceiptPrintContentSchema.parse({
          kind: "payment_receipt",
          payment: toPaymentRecordDto(payment),
        }),
        stallIdentity: resolveStallPrintIdentity(database, null),
        statusAnnotation: buildPaymentStatusAnnotation(payment),
      };
    }
    case "account_statement": {
      if (args.statementSnapshotToken === null) {
        throw validationError("A statement snapshot token is required.", [
          {
            path: "statementSnapshotToken",
            code: "STATEMENT_SNAPSHOT_REQUIRED",
            message: "Account statements are printed from a captured snapshot.",
          },
        ]);
      }
      return {
        content: accountStatementPrintContentSchema.parse({
          kind: "account_statement",
          statement: loadStatementPrintContent(database, {
            tenantId: args.tenantId,
            stallId: args.stallId,
            snapshotToken: args.statementSnapshotToken,
            requireUnexpiredAt: args.requireUnexpiredStatementAt,
          }),
        }),
        stallIdentity: resolveStallPrintIdentity(database, null),
        statusAnnotation: currentStatusAnnotation(),
      };
    }
    case "test_page":
      return {
        content: buildTestPageContent(args.paperProfile),
        stallIdentity: resolveStallPrintIdentity(database, null),
        statusAnnotation: currentStatusAnnotation(),
      };
    default: {
      const _exhaustive: never = args.documentKind;
      throw new Error(`Unknown print document kind: ${String(_exhaustive)}`);
    }
  }
}

/** Hash of the authoritative document content, excluding print metadata. */
export function hashPrintContent(content: PrintDocumentContentDto): string {
  return hashPrintPayload(content);
}

function assemblePrintViewModel(
  job: PrintJobRecord,
  attempt: PrintAttemptRecord,
  source: PrintDocumentSource,
): PrintViewModelDto {
  return printViewModelSchema.parse({
    documentKind: job.documentKind,
    documentId: job.documentId,
    stallIdentity: source.stallIdentity,
    statusAnnotation: source.statusAnnotation,
    printMetadata: {
      classification: attempt.classification,
      reprintLabel: reprintLabelFor(attempt.classification),
      printedAt: attempt.preparedAt,
      attemptId: attempt.id,
      attemptReference: attempt.attemptReference,
      paperProfile: attempt.paperProfile,
      templateId: attempt.templateId,
      templateVersion: attempt.templateVersion,
    },
    content: source.content,
    payloadHash: hashPrintContent(source.content),
  });
}

/**
 * Build the trusted print view model for an attempt. The service never renders HTML; the
 * Electron main process renders this model with the versioned template.
 */
export function buildPrintViewModel(
  database: LocalDatabase,
  args: {
    tenantId: string;
    stallId: string;
    job: PrintJobRecord;
    attempt: PrintAttemptRecord;
  },
): PrintViewModelDto {
  const source = loadPrintDocument(database, {
    tenantId: args.tenantId,
    stallId: args.stallId,
    documentKind: args.job.documentKind,
    documentId: args.job.documentId,
    paperProfile: args.attempt.paperProfile,
    statementSnapshotToken: args.job.statementSnapshotToken,
    requireUnexpiredStatementAt: null,
  });
  return assemblePrintViewModel(args.job, args.attempt, source);
}

// ---------------------------------------------------------------------------
// Authorization plumbing
// ---------------------------------------------------------------------------

function authorizeCapability(
  deps: CommandDeps,
  meta: PrintRequestMeta,
  capability: string,
): AuthorizedPrincipal {
  const auth = deps.authorization.authorize({
    requiredCapability: capability,
    requestId: meta.requestId,
    deviceProof: meta.deviceProof,
    sessionSecret: meta.sessionSecret,
    method: meta.method,
    path: meta.path,
    touchActivity: false,
  });
  if (auth instanceof AppError) {
    throw auth;
  }
  if (!auth.capabilities.has(capability)) {
    throw forbiddenError(`Missing capability: ${capability}`);
  }
  return auth;
}

/** Authorize with the first held capability; only permission denials fall through. */
function authorizeAnyOf(
  deps: CommandDeps,
  meta: PrintRequestMeta,
  capabilities: readonly string[],
): { principal: AuthorizedPrincipal; capability: string } {
  let denied: AppError | null = null;
  for (const capability of capabilities) {
    try {
      return { principal: authorizeCapability(deps, meta, capability), capability };
    } catch (error) {
      if (error instanceof AppError && error.code === "FORBIDDEN") {
        denied = error;
        continue;
      }
      throw error;
    }
  }
  throw denied ?? forbiddenError("Missing print capability.");
}

function boundStallOrNull(deps: CommandDeps) {
  const binding = resolveBoundStall(deps.database);
  return binding instanceof AppError ? null : binding;
}

function requireJob(executor: DbExecutor, stallId: string, jobId: string): PrintJobRecord {
  const job = getPrintJobById(executor, stallId, jobId);
  if (job === null) {
    throw notFoundError("Print job was not found.");
  }
  return job;
}

function requireAttempt(
  executor: DbExecutor,
  stallId: string,
  attemptId: string,
): PrintAttemptRecord {
  const attempt = getPrintAttemptById(executor, stallId, attemptId);
  if (attempt === null) {
    throw notFoundError("Print attempt was not found.");
  }
  return attempt;
}

/** Submission and outcome reporting are terminal-local: only the preparing terminal may act. */
function assertAttemptBelongsToTerminal(
  attempt: PrintAttemptRecord,
  context: ExecutionContext,
): void {
  if (attempt.requestedByDeviceId !== context.deviceRef) {
    throw forbiddenError(
      "A print attempt can only be submitted and reported from the terminal that prepared it.",
    );
  }
}

/**
 * Resolve the capability to enforce for an attempt-scoped mutation, also applying the
 * document-kind gate. Unknown attempts fall back to documents.print so the command
 * itself returns the not-found error.
 */
function authorizeAttemptMutation(
  deps: CommandDeps,
  meta: PrintRequestMeta,
  attemptId: string,
): string {
  const { principal } = authorizeAnyOf(deps, meta, [
    DOCUMENTS_PRINT_CAPABILITY,
    DOCUMENTS_REPRINT_CAPABILITY,
  ]);
  const binding = boundStallOrNull(deps);
  const attempt =
    binding === null ? null : getPrintAttemptById(deps.database, binding.stallId, attemptId);
  const job =
    binding === null || attempt === null
      ? null
      : getPrintJobById(deps.database, binding.stallId, attempt.jobId);
  if (attempt === null || job === null) {
    return DOCUMENTS_PRINT_CAPABILITY;
  }
  assertCanAccessPrintDocument(
    principal.capabilities,
    job.documentKind,
    attempt.classification === "reprint" ? "reprint" : "print",
  );
  return requiredPrintCapability(job.documentKind, attempt.classification);
}

// ---------------------------------------------------------------------------
// Create print job
// ---------------------------------------------------------------------------

function validateCreateJobRequest(input: CreatePrintJobRequest): void {
  if (input.documentKind === "account_statement") {
    if (input.statementSnapshotToken === undefined) {
      throw validationError("A statement snapshot token is required.", [
        {
          path: "statementSnapshotToken",
          code: "STATEMENT_SNAPSHOT_REQUIRED",
          message: "Account statements are printed from a captured snapshot.",
        },
      ]);
    }
    return;
  }
  if (input.statementSnapshotToken !== undefined) {
    throw validationError("A statement snapshot token is only valid for account statements.", [
      {
        path: "statementSnapshotToken",
        code: "UNEXPECTED_STATEMENT_SNAPSHOT",
        message: "Remove statementSnapshotToken for this document kind.",
      },
    ]);
  }
}

function createJobDefinition(
  deps: CommandDeps,
): CommandDefinition<CreatePrintJobRequest, CreatePrintJobResponse> {
  return {
    type: PRINT_CREATE_JOB_COMMAND_TYPE,
    version: "1",
    requiredCapability: DOCUMENTS_PRINT_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => executeCreatePrintJob(deps, tx, context, input),
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      createPrintJobResponseSchema.parse({
        ...(JSON.parse(resultRef) as object),
        replayed: true,
      }),
  };
}

function executeCreatePrintJob(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: CreatePrintJobRequest,
): CreatePrintJobResponse {
  const stallId = context.stallId;
  const byOperation = getPrintJobByCreateOperationId(tx, stallId, input.idempotencyKey);
  if (byOperation !== null) {
    if (
      byOperation.documentKind !== input.documentKind ||
      byOperation.documentId !== input.documentId
    ) {
      throw conflictError("Idempotency key was already used for a different print job.");
    }
    return createPrintJobResponseSchema.parse({
      job: toPrintJobRecordDto(byOperation),
      replayed: true,
    });
  }

  const existing = getPrintJobByDocument(tx, stallId, input.documentKind, input.documentId);
  if (existing !== null) {
    if (
      input.documentKind === "account_statement" &&
      existing.statementSnapshotToken !== (input.statementSnapshotToken ?? null)
    ) {
      throw conflictError(
        "A print job already exists for this statement document with a different snapshot.",
      );
    }
    return createPrintJobResponseSchema.parse({
      job: toPrintJobRecordDto(existing),
      replayed: true,
    });
  }

  const now = deps.now();
  const source = loadPrintDocument(deps.database, {
    tenantId: context.tenantId,
    stallId,
    documentKind: input.documentKind,
    documentId: input.documentId,
    paperProfile: input.paperProfile,
    statementSnapshotToken: input.statementSnapshotToken ?? null,
    requireUnexpiredStatementAt: now,
  });
  const payloadHash = hashPrintContent(source.content);
  const templateId = templateIdForDocumentKind(input.documentKind);
  const jobId = deps.createId();

  const job = insertPrintJob(tx, {
    id: jobId,
    stallId,
    documentKind: input.documentKind,
    documentId: input.documentId,
    paperProfile: input.paperProfile,
    templateId,
    templateVersion: PRINT_TEMPLATE_VERSION,
    payloadHash,
    statementSnapshotToken: input.statementSnapshotToken ?? null,
    createOperationId: input.idempotencyKey,
    createdByStaffId: context.actorRef,
    createdByDeviceId: context.deviceRef,
    createdAt: now,
    updatedAt: now,
  });

  writeAuditAndOutbox({
    tx,
    context,
    action: "print.job_created",
    targetType: "print_job",
    targetId: job.id,
    eventType: PRINT_JOB_CREATED_EVENT_TYPE,
    eventSchemaVersion: PRINT_EVENT_SCHEMA_VERSION,
    payload: printJobCreatedEventPayloadSchema.parse({
      jobId: job.id,
      documentKind: job.documentKind,
      documentId: job.documentId,
      paperProfile: job.paperProfile,
      templateId: job.templateId,
      templateVersion: job.templateVersion,
      payloadHash: job.payloadHash,
      actorStaffId: context.actorRef,
      deviceId: context.deviceRef,
      createdAt: now,
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return createPrintJobResponseSchema.parse({ job: toPrintJobRecordDto(job), replayed: false });
}

/** Idempotent. A document has at most one job; repeated requests return the same job. */
export function runCreatePrintJobCommand(
  deps: CommandDeps,
  input: CreatePrintJobRequest,
  meta: PrintRequestMeta,
): CreatePrintJobResponse {
  const parsed = createPrintJobRequestSchema.parse(input);
  validateCreateJobRequest(parsed);
  const principal = authorizeCapability(deps, meta, DOCUMENTS_PRINT_CAPABILITY);
  assertCanAccessPrintDocument(principal.capabilities, parsed.documentKind, "print");
  return runIdempotentCommand(deps, createJobDefinition(deps), {
    input: parsed,
    idempotencyKey: parsed.idempotencyKey,
    ...meta,
  });
}

// ---------------------------------------------------------------------------
// Prepare print attempt
// ---------------------------------------------------------------------------

const storedPrepareResultSchema = z.strictObject({
  jobId: opaqueIdSchema,
  attemptId: opaqueIdSchema,
});

function rebuildPrepareResponse(
  deps: CommandDeps,
  stall: { tenantId: string; stallId: string },
  job: PrintJobRecord,
  attempt: PrintAttemptRecord,
  replayed: boolean,
): PreparePrintAttemptResponse {
  const viewModel = buildPrintViewModel(deps.database, {
    tenantId: stall.tenantId,
    stallId: stall.stallId,
    job,
    attempt,
  });
  if (viewModel.payloadHash !== attempt.payloadHash) {
    throw conflictError(
      "The document changed after this attempt was prepared. Prepare a new attempt.",
    );
  }
  return preparePrintAttemptResponseSchema.parse({
    job: toPrintJobRecordDto(job),
    attempt: toPrintAttemptRecordDto(attempt),
    viewModel,
    replayed,
  });
}

function prepareDefinition(
  deps: CommandDeps,
  requiredCapability: string,
): CommandDefinition<PreparePrintAttemptRequest, PreparePrintAttemptResponse> {
  return {
    type: PRINT_PREPARE_ATTEMPT_COMMAND_TYPE,
    version: "1",
    requiredCapability,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => executePreparePrintAttempt(deps, tx, context, input),
    // Only identities are stored: the (possibly large) view model is rebuilt on replay.
    serializeResult: (result) =>
      JSON.stringify({ jobId: result.job.id, attemptId: result.attempt.id }),
    deserializeResult: (resultRef) => {
      const stored = storedPrepareResultSchema.parse(JSON.parse(resultRef));
      const binding = resolveBoundStall(deps.database);
      if (binding instanceof AppError) {
        throw binding;
      }
      const job = requireJob(deps.database, binding.stallId, stored.jobId);
      const attempt = requireAttempt(deps.database, binding.stallId, stored.attemptId);
      return rebuildPrepareResponse(deps, binding, job, attempt, true);
    },
  };
}

function executePreparePrintAttempt(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: PreparePrintAttemptRequest,
): PreparePrintAttemptResponse {
  const stallId = context.stallId;
  const job = requireJob(tx, stallId, input.jobId);

  const byOperation = getPrintAttemptByPrepareOperationId(tx, stallId, input.idempotencyKey);
  if (byOperation !== null) {
    if (
      byOperation.jobId !== job.id ||
      byOperation.requestedByStaffId !== context.actorRef ||
      byOperation.requestedByDeviceId !== context.deviceRef
    ) {
      throw conflictError("Idempotency key was already used for a different print attempt.");
    }
    return rebuildPrepareResponse(deps, context, job, byOperation, true);
  }

  const prior = listPrintAttemptsForJob(tx, stallId, job.id, MAX_ATTEMPTS_SCANNED);
  const required = classifyAdditionalPrintAttempt({
    priorOutcomes: prior.map((attempt) => attempt.outcome),
  });
  const resolved = resolvePrepareClassification({
    requested: input.classification,
    required,
    reprintReason: input.reprintReason,
  });

  const now = deps.now();
  const source = loadPrintDocument(deps.database, {
    tenantId: context.tenantId,
    stallId,
    documentKind: job.documentKind,
    documentId: job.documentId,
    paperProfile: input.paperProfile,
    statementSnapshotToken: job.statementSnapshotToken,
    requireUnexpiredStatementAt: null,
  });
  const payloadHash = hashPrintContent(source.content);
  const attemptId = deps.createId();

  const attempt = insertPrintAttempt(tx, {
    id: attemptId,
    jobId: job.id,
    stallId,
    classification: resolved.classification,
    reprintReason: resolved.reprintReason,
    outcome: "prepared",
    printerSystemName: input.printerSystemName,
    paperProfile: input.paperProfile,
    templateId: templateIdForDocumentKind(job.documentKind),
    templateVersion: PRINT_TEMPLATE_VERSION,
    payloadHash,
    attemptReference: formatPrintAttemptReference(attemptId),
    prepareOperationId: input.idempotencyKey,
    requestedByStaffId: context.actorRef,
    requestedByDeviceId: context.deviceRef,
    preparedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  writeAuditAndOutbox({
    tx,
    context,
    action: "print.attempt_prepared",
    targetType: "print_attempt",
    targetId: attempt.id,
    eventType: PRINT_ATTEMPT_PREPARED_EVENT_TYPE,
    eventSchemaVersion: PRINT_EVENT_SCHEMA_VERSION,
    payload: printAttemptPreparedEventPayloadSchema.parse({
      jobId: job.id,
      attemptId: attempt.id,
      documentKind: job.documentKind,
      documentId: job.documentId,
      classification: attempt.classification,
      reprintReason: attempt.reprintReason,
      paperProfile: attempt.paperProfile,
      templateVersion: attempt.templateVersion,
      payloadHash: attempt.payloadHash,
      actorStaffId: context.actorRef,
      deviceId: context.deviceRef,
      preparedAt: now,
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return preparePrintAttemptResponseSchema.parse({
    job: toPrintJobRecordDto(job),
    attempt: toPrintAttemptRecordDto(attempt),
    viewModel: assemblePrintViewModel(job, attempt, source),
    replayed: false,
  });
}

/**
 * Idempotent by prepare operation. Classification is validated server-side; a reprint needs
 * `documents.reprint` and a reason. Never creates a bill number or any financial record.
 */
export function runPreparePrintAttemptCommand(
  deps: CommandDeps,
  input: PreparePrintAttemptRequest,
  meta: PrintRequestMeta,
): PreparePrintAttemptResponse {
  const parsed = preparePrintAttemptRequestSchema.parse(input);
  const { principal } = authorizeAnyOf(deps, meta, [
    DOCUMENTS_PRINT_CAPABILITY,
    DOCUMENTS_REPRINT_CAPABILITY,
  ]);
  const binding = boundStallOrNull(deps);
  const job =
    binding === null ? null : getPrintJobById(deps.database, binding.stallId, parsed.jobId);
  const mode: PrintAccessMode = parsed.classification === "reprint" ? "reprint" : "print";
  let requiredCapability =
    parsed.classification === "reprint" ? DOCUMENTS_REPRINT_CAPABILITY : DOCUMENTS_PRINT_CAPABILITY;
  if (job !== null) {
    assertCanAccessPrintDocument(principal.capabilities, job.documentKind, mode);
    requiredCapability = requiredPrintCapability(job.documentKind, parsed.classification);
  } else if (!principal.capabilities.has(requiredCapability)) {
    throw forbiddenError(`Missing capability: ${requiredCapability}`);
  }
  return runIdempotentCommand(deps, prepareDefinition(deps, requiredCapability), {
    input: parsed,
    idempotencyKey: parsed.idempotencyKey,
    ...meta,
  });
}

// ---------------------------------------------------------------------------
// Mark submitting
// ---------------------------------------------------------------------------

function markSubmittingDefinition(
  deps: CommandDeps,
  requiredCapability: string,
): CommandDefinition<MarkPrintAttemptSubmittingRequest, MarkPrintAttemptSubmittingResponse> {
  return {
    type: PRINT_MARK_SUBMITTING_COMMAND_TYPE,
    version: "1",
    requiredCapability,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const attempt = requireAttempt(tx, context.stallId, input.attemptId);
      assertAttemptBelongsToTerminal(attempt, context);
      if (attempt.outcome !== "prepared") {
        throw conflictError(
          attempt.outcome === "submitting"
            ? "This attempt is already being submitted. Do not submit it again."
            : "This attempt already has a reported outcome and cannot be submitted again.",
        );
      }
      const now = deps.now();
      const updated = markPrintAttemptSubmitting(tx, {
        stallId: context.stallId,
        attemptId: attempt.id,
        submittingAt: now,
        updatedAt: now,
      });
      appendAuditEvent(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        tenantId: context.tenantId,
        actorRef: context.actorRef,
        deviceRef: context.deviceRef,
        action: "print.attempt_submitting",
        targetType: "print_attempt",
        targetId: updated.id,
        occurredAt: now,
        correlationRef: context.requestId,
      });
      return markPrintAttemptSubmittingResponseSchema.parse({
        attempt: toPrintAttemptRecordDto(updated),
        replayed: false,
      });
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      markPrintAttemptSubmittingResponseSchema.parse({
        ...(JSON.parse(resultRef) as object),
        replayed: true,
      }),
  };
}

/** Records that Electron main is about to submit. Allowed once per attempt. */
export function runMarkPrintAttemptSubmittingCommand(
  deps: CommandDeps,
  input: MarkPrintAttemptSubmittingRequest,
  meta: PrintRequestMeta,
): MarkPrintAttemptSubmittingResponse {
  const parsed = markPrintAttemptSubmittingRequestSchema.parse(input);
  const requiredCapability = authorizeAttemptMutation(deps, meta, parsed.attemptId);
  return runIdempotentCommand(deps, markSubmittingDefinition(deps, requiredCapability), {
    input: parsed,
    idempotencyKey: parsed.idempotencyKey,
    ...meta,
  });
}

// ---------------------------------------------------------------------------
// Report outcome
// ---------------------------------------------------------------------------

function writeOutcomeEvent(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  action: string,
  job: PrintJobRecord,
  attempt: PrintAttemptRecord,
  now: string,
): void {
  writeAuditAndOutbox({
    tx,
    context,
    action,
    targetType: "print_attempt",
    targetId: attempt.id,
    eventType: PRINT_ATTEMPT_OUTCOME_EVENT_TYPE,
    eventSchemaVersion: PRINT_EVENT_SCHEMA_VERSION,
    payload: printAttemptOutcomeEventPayloadSchema.parse({
      jobId: job.id,
      attemptId: attempt.id,
      documentKind: job.documentKind,
      documentId: job.documentId,
      classification: attempt.classification,
      outcome: attempt.outcome,
      outcomeDetail: attempt.outcomeDetail,
      actorStaffId: context.actorRef,
      deviceId: context.deviceRef,
      reportedAt: attempt.reportedAt ?? now,
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });
}

function reportOutcomeDefinition(
  deps: CommandDeps,
  requiredCapability: string,
): CommandDefinition<ReportPrintAttemptOutcomeRequest, ReportPrintAttemptOutcomeResponse> {
  return {
    type: PRINT_REPORT_OUTCOME_COMMAND_TYPE,
    version: "1",
    requiredCapability,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const attempt = requireAttempt(tx, context.stallId, input.attemptId);
      assertAttemptBelongsToTerminal(attempt, context);
      if (!canReportPrintOutcome({ current: attempt.outcome, next: input.outcome })) {
        throw conflictError(
          `This attempt already has the outcome "${attempt.outcome}" and cannot be changed to "${input.outcome}".`,
        );
      }
      if (isTerminalPrintOutcome(attempt.outcome)) {
        // Same outcome reported again (for example after a lost response): no new state.
        return reportPrintAttemptOutcomeResponseSchema.parse({
          attempt: toPrintAttemptRecordDto(attempt),
          replayed: true,
        });
      }
      const job = requireJob(tx, context.stallId, attempt.jobId);
      const now = deps.now();
      const detail = input.outcomeDetail?.trim() ?? "";
      const updated = reportPrintAttemptOutcome(tx, {
        stallId: context.stallId,
        attemptId: attempt.id,
        outcome: input.outcome,
        outcomeDetail: detail.length > 0 ? detail : null,
        reportOperationId: input.idempotencyKey,
        reportedAt: now,
        updatedAt: now,
      });
      writeOutcomeEvent(deps, tx, context, "print.attempt_outcome_reported", job, updated, now);
      return reportPrintAttemptOutcomeResponseSchema.parse({
        attempt: toPrintAttemptRecordDto(updated),
        replayed: false,
      });
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      reportPrintAttemptOutcomeResponseSchema.parse({
        ...(JSON.parse(resultRef) as object),
        replayed: true,
      }),
  };
}

/**
 * Records the observed submission outcome. The result is an observation of the print system,
 * never proof of physical delivery, and never triggers an automatic resubmission.
 */
export function runReportPrintAttemptOutcomeCommand(
  deps: CommandDeps,
  input: ReportPrintAttemptOutcomeRequest,
  meta: PrintRequestMeta,
): ReportPrintAttemptOutcomeResponse {
  const parsed = reportPrintAttemptOutcomeRequestSchema.parse(input);
  const requiredCapability = authorizeAttemptMutation(deps, meta, parsed.attemptId);
  return runIdempotentCommand(deps, reportOutcomeDefinition(deps, requiredCapability), {
    input: parsed,
    idempotencyKey: parsed.idempotencyKey,
    ...meta,
  });
}

// ---------------------------------------------------------------------------
// Recover attempt (crash recovery)
// ---------------------------------------------------------------------------

function recoverDefinition(
  deps: CommandDeps,
  requiredCapability: string,
): CommandDefinition<RecoverPrintAttemptRequest, RecoverPrintAttemptResponse> {
  return {
    type: PRINT_RECOVER_ATTEMPT_COMMAND_TYPE,
    version: "1",
    requiredCapability,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const attempt = requireAttempt(tx, context.stallId, input.attemptId);
      if (attempt.outcome !== "submitting") {
        // Prepared attempts never reached the printer; terminal outcomes are already final.
        return recoverPrintAttemptResponseSchema.parse({
          attempt: toPrintAttemptRecordDto(attempt),
          replayed: true,
        });
      }
      const job = requireJob(tx, context.stallId, attempt.jobId);
      const now = deps.now();
      const updated = reportPrintAttemptOutcome(tx, {
        stallId: context.stallId,
        attemptId: attempt.id,
        outcome: "outcome_unknown",
        outcomeDetail: RECOVERED_OUTCOME_DETAIL,
        reportOperationId: input.idempotencyKey,
        reportedAt: now,
        updatedAt: now,
      });
      writeOutcomeEvent(deps, tx, context, "print.attempt_recovered", job, updated, now);
      return recoverPrintAttemptResponseSchema.parse({
        attempt: toPrintAttemptRecordDto(updated),
        replayed: false,
      });
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      recoverPrintAttemptResponseSchema.parse({
        ...(JSON.parse(resultRef) as object),
        replayed: true,
      }),
  };
}

/**
 * Marks an attempt interrupted while submitting as outcome_unknown. It never resubmits;
 * an additional copy requires a deliberate reprint.
 */
export function runRecoverPrintAttemptCommand(
  deps: CommandDeps,
  input: RecoverPrintAttemptRequest,
  meta: PrintRequestMeta,
): RecoverPrintAttemptResponse {
  const parsed = recoverPrintAttemptRequestSchema.parse(input);
  const { principal, capability } = authorizeAnyOf(deps, meta, [
    DOCUMENTS_PRINT_CAPABILITY,
    DOCUMENTS_REPRINT_CAPABILITY,
  ]);
  const binding = boundStallOrNull(deps);
  const attempt =
    binding === null ? null : getPrintAttemptById(deps.database, binding.stallId, parsed.attemptId);
  const job =
    binding === null || attempt === null
      ? null
      : getPrintJobById(deps.database, binding.stallId, attempt.jobId);
  if (job !== null) {
    assertCanAccessPrintDocument(principal.capabilities, job.documentKind, "view");
  }
  return runIdempotentCommand(deps, recoverDefinition(deps, capability), {
    input: parsed,
    idempotencyKey: parsed.idempotencyKey,
    ...meta,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Attempt history for a document, newest first. Requires view access to the document kind. */
export function listPrintAttemptsForDocument(
  deps: CommandDeps,
  context: PrintReadContext,
  rawQuery: ListPrintAttemptsQuery,
): ListPrintAttemptsResponse {
  const query = listPrintAttemptsQuerySchema.parse(rawQuery);
  assertCanAccessPrintDocument(context.capabilities, query.documentKind, "view");
  const job = getPrintJobByDocument(
    deps.database,
    context.stallId,
    query.documentKind,
    query.documentId,
  );
  if (job === null) {
    return listPrintAttemptsResponseSchema.parse({ job: null, attempts: [] });
  }
  const attempts = listPrintAttemptsForJob(deps.database, context.stallId, job.id, query.limit);
  return listPrintAttemptsResponseSchema.parse({
    job: toPrintJobRecordDto(job),
    attempts: attempts.map(toPrintAttemptRecordDto),
  });
}

/**
 * Attempt detail. The view model is rebuilt only while the attempt can still be submitted
 * (prepared/submitting) and only if the authoritative content still matches the prepared hash.
 */
export function getPrintAttemptDetail(
  deps: CommandDeps,
  context: PrintReadContext,
  attemptId: string,
): GetPrintAttemptResponse {
  const attempt = requireAttempt(deps.database, context.stallId, attemptId);
  const job = requireJob(deps.database, context.stallId, attempt.jobId);
  assertCanAccessPrintDocument(context.capabilities, job.documentKind, "view");

  let viewModel: PrintViewModelDto | null = null;
  if (attempt.outcome === "prepared" || attempt.outcome === "submitting") {
    const rebuilt = buildPrintViewModel(deps.database, {
      tenantId: context.tenantId,
      stallId: context.stallId,
      job,
      attempt,
    });
    viewModel = rebuilt.payloadHash === attempt.payloadHash ? rebuilt : null;
  }
  return getPrintAttemptResponseSchema.parse({
    job: toPrintJobRecordDto(job),
    attempt: toPrintAttemptRecordDto(attempt),
    viewModel,
  });
}

// ---------------------------------------------------------------------------
// Stall print identity
// ---------------------------------------------------------------------------

export function getStallPrintIdentityResponse(
  deps: CommandDeps,
  capabilities: ReadonlySet<string>,
): StallPrintIdentityResponse {
  assertCanManageStallPrintIdentity(capabilities);
  const identity = getStallPrintIdentity(deps.database);
  return stallPrintIdentityResponseSchema.parse({
    identity:
      identity === null
        ? null
        : {
            displayName: identity.displayName,
            address: identity.address,
            updatedAt: identity.updatedAt,
          },
  });
}

/**
 * Upserts the live stall print identity. Already-issued bills keep the identity captured at
 * issue time; this only affects new bills and documents without a historical identity.
 */
export function upsertStallPrintIdentityCommand(
  deps: CommandDeps,
  rawInput: UpsertStallPrintIdentityRequest,
  context: {
    tenantId: string;
    stallId: string;
    actorRef: string;
    deviceRef: string;
    requestId: string;
    capabilities: ReadonlySet<string>;
  },
): StallPrintIdentityResponse {
  assertCanManageStallPrintIdentity(context.capabilities);
  const input = upsertStallPrintIdentityRequestSchema.parse(rawInput);
  const address =
    input.address === undefined || input.address === null || input.address.length === 0
      ? null
      : input.address;
  const now = deps.now();
  return runInTransaction(deps.database.db, (tx) => {
    const saved = upsertStallPrintIdentity(tx, {
      displayName: input.displayName,
      address,
      updatedAt: now,
    });
    appendAuditEvent(tx, {
      id: deps.createId(),
      stallId: context.stallId,
      tenantId: context.tenantId,
      actorRef: context.actorRef,
      deviceRef: context.deviceRef,
      action: "print.stall_identity_updated",
      targetType: "stall_print_identity",
      targetId: context.stallId,
      occurredAt: now,
      correlationRef: context.requestId,
    });
    return stallPrintIdentityResponseSchema.parse({
      identity: {
        displayName: saved.displayName,
        address: saved.address,
        updatedAt: saved.updatedAt,
      },
    });
  });
}
