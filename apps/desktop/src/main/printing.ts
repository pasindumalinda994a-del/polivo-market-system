import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createPrintJobResponseSchema,
  discoveredPrinterSchema,
  getPrintAttemptResponseSchema,
  listPrintAttemptsResponseSchema,
  markPrintAttemptSubmittingResponseSchema,
  preparePrintAttemptResponseSchema,
  printDocumentKindSchema,
  printPaperProfileSchema,
  printReprintReasonSchema,
  recoverPrintAttemptResponseSchema,
  reportPrintAttemptOutcomeResponseSchema,
  stallPrintIdentityResponseSchema,
  terminalPrinterConfigSchema,
  type CreatePrintJobRequest,
  type CreatePrintJobResponse,
  type DiscoveredPrinterDto,
  type GetPrintAttemptResponse,
  type ListPrintAttemptsResponse,
  type MarkPrintAttemptSubmittingResponse,
  type PreparePrintAttemptRequest,
  type PreparePrintAttemptResponse,
  type PrintDocumentKindDto,
  type PrintPaperProfileDto,
  type PrintViewModelDto,
  type RecoverPrintAttemptResponse,
  type ReportPrintAttemptOutcomeResponse,
  type TerminalPrinterConfigDto,
} from "@polivo/contracts";
import {
  printViewModelToRenderInput,
  renderPrintDocumentHtml,
  type PrintableViewModel,
} from "@polivo/domain";
import { app, BrowserWindow } from "electron";

import { authenticatedHostRequest, isStaffSignedIn, mapHostApiError } from "./connection.js";

export type PrintApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type PrintApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type PrintApiResult<T> = PrintApiSuccess<T> | PrintApiError;

const UNAUTHENTICATED: PrintApiError = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "Staff session required.",
};

const activeAttemptSubmissions = new Set<string>();

/** Flat view mapped from `{ identity: ... | null }` for Settings UI / IPC. */
type StallPrintIdentityView = {
  displayName: string;
  address: string | null;
  updatedAt: string | null;
  configured: boolean;
};

function parseStallPrintIdentity(value: unknown): StallPrintIdentityView {
  const parsed = stallPrintIdentityResponseSchema.parse(value);
  if (parsed.identity === null) {
    return {
      displayName: "",
      address: null,
      updatedAt: null,
      configured: false,
    };
  }
  return {
    displayName: parsed.identity.displayName,
    address: parsed.identity.address,
    updatedAt: parsed.identity.updatedAt,
    configured: true,
  };
}

function parsePrintDocumentRequest(input: unknown): {
  documentKind: PrintDocumentKindDto;
  documentId: string;
  paperProfile?: PrintPaperProfileDto;
  statementSnapshotToken?: string;
  classification: "initial" | "reprint";
  reprintReason?: string;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid print request.");
  }
  const record = input as Record<string, unknown>;
  const documentKind = printDocumentKindSchema.parse(record.documentKind);
  if (typeof record.documentId !== "string" || record.documentId.length === 0) {
    throw new Error("documentId is required.");
  }
  const classification = record.classification === "reprint" ? "reprint" : ("initial" as const);
  const paperProfile =
    record.paperProfile === undefined
      ? undefined
      : printPaperProfileSchema.parse(record.paperProfile);
  const reprintReason =
    record.reprintReason === undefined
      ? undefined
      : printReprintReasonSchema.parse(record.reprintReason);
  const statementSnapshotToken =
    typeof record.statementSnapshotToken === "string" ? record.statementSnapshotToken : undefined;
  return {
    documentKind,
    documentId: record.documentId,
    paperProfile,
    statementSnapshotToken,
    classification,
    reprintReason,
  };
}

function parseError(status: number, bodyText: string, fallback: string): PrintApiError {
  let code = "INTERNAL_ERROR";
  try {
    const parsed = JSON.parse(bodyText) as { code?: string; message?: string };
    if (typeof parsed.code === "string") {
      code = parsed.code;
    }
  } catch {
    // ignore
  }
  return {
    ok: false,
    code,
    message: mapHostApiError(status, bodyText, fallback),
    conflict: status === 409 || code === "CONFLICT",
  };
}

function unavailable(error: unknown): PrintApiError {
  return {
    ok: false,
    code: "SERVICE_UNAVAILABLE",
    message: error instanceof Error ? error.message : "Stall host unavailable",
  };
}

function ensureIdempotencyKey(idempotencyKey?: string): string {
  return idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey : randomUUID();
}

function printingDir(): string {
  const dir = join(app.getPath("userData"), "printing");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function configPath(): string {
  return join(printingDir(), "terminal-printer.json");
}

function pendingOutcomePath(): string {
  return join(printingDir(), "pending-outcome.json");
}

type PendingOutcome = {
  attemptId: string;
  idempotencyKey: string;
  outcome:
    | "accepted_by_print_system"
    | "failed_before_submission"
    | "cancelled_before_submission"
    | "outcome_unknown";
  outcomeDetail: string | null;
};

function writePendingOutcome(record: PendingOutcome): void {
  writeFileSync(pendingOutcomePath(), JSON.stringify(record), "utf8");
}

function readPendingOutcome(): PendingOutcome | null {
  const path = pendingOutcomePath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PendingOutcome;
  } catch {
    return null;
  }
}

function clearPendingOutcome(): void {
  const path = pendingOutcomePath();
  if (existsSync(path)) {
    writeFileSync(path, "", "utf8");
  }
}

async function hostCall<T>(args: {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  fallback: string;
  parse: (value: unknown) => T;
}): Promise<PrintApiResult<T>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  try {
    const response = await authenticatedHostRequest({
      method: args.method,
      path: args.path,
      query: args.query,
      body: args.body,
      idempotencyKey: args.idempotencyKey,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, args.fallback);
    }
    let json: unknown;
    try {
      json = JSON.parse(response.bodyText);
    } catch {
      return { ok: false, code: "INTERNAL_ERROR", message: args.fallback };
    }
    try {
      return { ok: true, data: args.parse(json) };
    } catch (error) {
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        message: error instanceof Error ? error.message : args.fallback,
      };
    }
  } catch (error) {
    return unavailable(error);
  }
}

/** Reject renderer payloads that try to smuggle privileged print inputs. */
export function assertSafePrintIpcPayload(input: unknown): void {
  if (!input || typeof input !== "object") {
    return;
  }
  const record = input as Record<string, unknown>;
  for (const key of ["html", "url", "path", "filePath", "shellCommand", "command", "script"]) {
    if (key in record) {
      throw new Error(`Rejected print IPC field: ${key}`);
    }
  }
}

export function getTerminalPrinterConfig(): PrintApiResult<TerminalPrinterConfigDto | null> {
  const path = configPath();
  if (!existsSync(path)) {
    return { ok: true, data: null };
  }
  try {
    const parsed = terminalPrinterConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Stored printer configuration is invalid. Reselect the printer.",
    };
  }
}

export function setTerminalPrinterConfig(input: unknown): PrintApiResult<TerminalPrinterConfigDto> {
  assertSafePrintIpcPayload(input);
  const parsed = terminalPrinterConfigSchema.parse(input);
  writeFileSync(configPath(), JSON.stringify(parsed, null, 2), "utf8");
  return { ok: true, data: parsed };
}

export async function listSystemPrinters(): Promise<PrintApiResult<DiscoveredPrinterDto[]>> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  try {
    const printers = await window.webContents.getPrintersAsync();
    const mapped = printers.map((printer) =>
      discoveredPrinterSchema.parse({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: Boolean(
          (printer as { isDefault?: boolean; isdefault?: boolean }).isDefault ??
          (printer as { isdefault?: boolean }).isdefault,
        ),
      }),
    );
    return { ok: true, data: mapped };
  } catch (error) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unable to list printers.",
    };
  } finally {
    window.destroy();
  }
}

export async function getStallPrintIdentity(): Promise<PrintApiResult<StallPrintIdentityView>> {
  return hostCall({
    method: "GET",
    path: "/print/stall-identity",
    fallback: "Unable to load stall print identity.",
    parse: parseStallPrintIdentity,
  });
}

export async function setStallPrintIdentity(
  input: unknown,
): Promise<PrintApiResult<StallPrintIdentityView>> {
  assertSafePrintIpcPayload(input);
  if (!input || typeof input !== "object") {
    throw new Error("Invalid stall print identity.");
  }
  const record = input as Record<string, unknown>;
  if (typeof record.displayName !== "string" || record.displayName.trim().length === 0) {
    throw new Error("displayName is required.");
  }
  const address =
    typeof record.address === "string"
      ? record.address.trim()
      : record.address === null
        ? null
        : null;
  return hostCall({
    method: "PUT",
    path: "/print/stall-identity",
    body: {
      displayName: record.displayName.trim(),
      address: address && address.length > 0 ? address : null,
    },
    fallback: "Unable to save stall print identity.",
    parse: parseStallPrintIdentity,
  });
}

export async function createPrintJob(
  input: CreatePrintJobRequest,
): Promise<PrintApiResult<CreatePrintJobResponse>> {
  const body = {
    ...input,
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
  };
  return hostCall({
    method: "POST",
    path: "/print/jobs",
    body,
    idempotencyKey: body.idempotencyKey,
    fallback: "Unable to create print job.",
    parse: (value) => createPrintJobResponseSchema.parse(value),
  });
}

export async function preparePrintAttempt(
  input: PreparePrintAttemptRequest,
): Promise<PrintApiResult<PreparePrintAttemptResponse>> {
  const body = {
    ...input,
    idempotencyKey: ensureIdempotencyKey(input.idempotencyKey),
  };
  return hostCall({
    method: "POST",
    path: "/print/attempts/prepare",
    body,
    idempotencyKey: body.idempotencyKey,
    fallback: "Unable to prepare print attempt.",
    parse: (value) => preparePrintAttemptResponseSchema.parse(value),
  });
}

export async function markPrintSubmitting(
  attemptId: string,
  idempotencyKey?: string,
): Promise<PrintApiResult<MarkPrintAttemptSubmittingResponse>> {
  const key = ensureIdempotencyKey(idempotencyKey);
  return hostCall({
    method: "POST",
    path: "/print/attempts/submitting",
    body: { idempotencyKey: key, attemptId },
    idempotencyKey: key,
    fallback: "Unable to mark print attempt submitting.",
    parse: (value) => markPrintAttemptSubmittingResponseSchema.parse(value),
  });
}

export async function reportPrintOutcome(input: {
  attemptId: string;
  outcome:
    | "accepted_by_print_system"
    | "failed_before_submission"
    | "cancelled_before_submission"
    | "outcome_unknown";
  outcomeDetail?: string | null;
  idempotencyKey?: string;
}): Promise<PrintApiResult<ReportPrintAttemptOutcomeResponse>> {
  const key = ensureIdempotencyKey(input.idempotencyKey);
  const result = await hostCall({
    method: "POST",
    path: "/print/attempts/outcome",
    body: {
      idempotencyKey: key,
      attemptId: input.attemptId,
      outcome: input.outcome,
      outcomeDetail: input.outcomeDetail ?? null,
    },
    idempotencyKey: key,
    fallback: "Unable to report print attempt outcome.",
    parse: (value) => reportPrintAttemptOutcomeResponseSchema.parse(value),
  });
  if (!result.ok && result.code === "SERVICE_UNAVAILABLE") {
    writePendingOutcome({
      attemptId: input.attemptId,
      idempotencyKey: key,
      outcome: input.outcome,
      outcomeDetail: input.outcomeDetail ?? null,
    });
  } else if (result.ok) {
    clearPendingOutcome();
  }
  return result;
}

export async function recoverPrintAttempt(
  attemptId: string,
  idempotencyKey?: string,
): Promise<PrintApiResult<RecoverPrintAttemptResponse>> {
  const key = ensureIdempotencyKey(idempotencyKey);
  return hostCall({
    method: "POST",
    path: "/print/attempts/recover",
    body: { idempotencyKey: key, attemptId },
    idempotencyKey: key,
    fallback: "Unable to recover print attempt.",
    parse: (value) => recoverPrintAttemptResponseSchema.parse(value),
  });
}

export async function listPrintAttempts(input: {
  documentKind: PrintDocumentKindDto;
  documentId: string;
  limit?: number;
}): Promise<PrintApiResult<ListPrintAttemptsResponse>> {
  return hostCall({
    method: "GET",
    path: `/print/documents/${encodeURIComponent(input.documentKind)}/${encodeURIComponent(input.documentId)}/attempts`,
    query: { limit: String(input.limit ?? 20) },
    fallback: "Unable to list print attempts.",
    parse: (value) => listPrintAttemptsResponseSchema.parse(value),
  });
}

export async function getPrintAttempt(
  attemptId: string,
): Promise<PrintApiResult<GetPrintAttemptResponse>> {
  return hostCall({
    method: "GET",
    path: `/print/attempts/${encodeURIComponent(attemptId)}`,
    fallback: "Unable to load print attempt.",
    parse: (value) => getPrintAttemptResponseSchema.parse(value),
  });
}

export async function flushPendingPrintOutcome(): Promise<PrintApiResult<{ flushed: boolean }>> {
  const pending = readPendingOutcome();
  if (pending === null || !pending.attemptId) {
    return { ok: true, data: { flushed: false } };
  }
  const reported = await reportPrintOutcome(pending);
  if (!reported.ok) {
    return reported;
  }
  return { ok: true, data: { flushed: true } };
}

function renderHtmlFromViewModel(viewModel: PrintViewModelDto): string {
  return renderPrintDocumentHtml(
    printViewModelToRenderInput(viewModel as unknown as PrintableViewModel),
  );
}

async function openPrintWindow(html: string, show: boolean): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show,
    width: 800,
    height: 1000,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  try {
    await window.webContents.executeJavaScript(
      "document.fonts ? document.fonts.ready.then(() => true) : true",
      true,
    );
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return window;
}

export async function previewDocument(
  input: unknown,
): Promise<PrintApiResult<{ attemptId: string; viewModel: PrintViewModelDto }>> {
  assertSafePrintIpcPayload(input);
  const parsed = parsePrintDocumentRequest(input);

  const config = getTerminalPrinterConfig();
  if (!config.ok) {
    return config;
  }
  if (config.data === null) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Select a printer and paper profile before previewing.",
    };
  }

  const paperProfile = parsed.paperProfile ?? config.data.paperProfile;
  const job = await createPrintJob({
    idempotencyKey: randomUUID(),
    documentKind: parsed.documentKind,
    documentId: parsed.documentId,
    paperProfile,
    statementSnapshotToken: parsed.statementSnapshotToken,
  });
  if (!job.ok) {
    return job;
  }

  const prepared = await preparePrintAttempt({
    idempotencyKey: randomUUID(),
    jobId: job.data.job.id,
    classification: parsed.classification,
    reprintReason: parsed.reprintReason,
    printerSystemName: config.data.printerSystemName,
    paperProfile,
  });
  if (!prepared.ok) {
    return prepared;
  }

  const html = renderHtmlFromViewModel(prepared.data.viewModel);
  const window = await openPrintWindow(html, true);
  window.on("closed", () => {
    void reportPrintOutcome({
      attemptId: prepared.data.attempt.id,
      outcome: "cancelled_before_submission",
      outcomeDetail: "Preview closed without printing.",
    });
  });

  return {
    ok: true,
    data: { attemptId: prepared.data.attempt.id, viewModel: prepared.data.viewModel },
  };
}

async function submitToPrinter(args: {
  attemptId: string;
  viewModel: PrintViewModelDto;
  printerSystemName: string;
}): Promise<PrintApiResult<{ attemptId: string; outcome: string }>> {
  if (activeAttemptSubmissions.has(args.attemptId)) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "A print submission for this attempt is already in progress.",
    };
  }
  activeAttemptSubmissions.add(args.attemptId);
  let window: BrowserWindow | null = null;
  try {
    const submitting = await markPrintSubmitting(args.attemptId);
    if (!submitting.ok) {
      return submitting;
    }

    const html = renderHtmlFromViewModel(args.viewModel);
    window = await openPrintWindow(html, false);

    const outcome = await new Promise<
      "accepted_by_print_system" | "failed_before_submission" | "outcome_unknown"
    >((resolve) => {
      const timer = setTimeout(() => resolve("outcome_unknown"), 60_000);
      try {
        window!.webContents.print(
          {
            silent: true,
            deviceName: args.printerSystemName,
            copies: 1,
            printBackground: false,
          },
          (success, failureReason) => {
            clearTimeout(timer);
            if (success) {
              resolve("accepted_by_print_system");
              return;
            }
            if (failureReason && /cancel/i.test(failureReason)) {
              resolve("failed_before_submission");
              return;
            }
            if (failureReason) {
              resolve("failed_before_submission");
              return;
            }
            resolve("outcome_unknown");
          },
        );
      } catch {
        clearTimeout(timer);
        resolve("outcome_unknown");
      }
    });

    const reported = await reportPrintOutcome({
      attemptId: args.attemptId,
      outcome,
      outcomeDetail:
        outcome === "accepted_by_print_system"
          ? "Accepted by the Windows print system (not proof of physical delivery)."
          : outcome === "outcome_unknown"
            ? "Print outcome could not be confirmed. Check the Windows queue before retrying."
            : "Print failed or was cancelled before submission.",
    });
    if (!reported.ok && reported.code !== "SERVICE_UNAVAILABLE") {
      return reported;
    }
    return { ok: true, data: { attemptId: args.attemptId, outcome } };
  } finally {
    activeAttemptSubmissions.delete(args.attemptId);
    if (window !== null && !window.isDestroyed()) {
      window.destroy();
    }
  }
}

export async function printDocument(
  input: unknown,
): Promise<PrintApiResult<{ attemptId: string; outcome: string }>> {
  assertSafePrintIpcPayload(input);
  const parsed = parsePrintDocumentRequest(input);

  const config = getTerminalPrinterConfig();
  if (!config.ok) {
    return config;
  }
  if (config.data === null) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Select a printer and paper profile before printing.",
    };
  }

  const printers = await listSystemPrinters();
  if (!printers.ok) {
    return printers;
  }
  if (printers.data.length === 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "No printers are installed for this Windows session.",
    };
  }
  if (!printers.data.some((printer) => printer.name === config.data!.printerSystemName)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Configured printer is not available on this terminal. Reselect the printer deliberately.",
    };
  }

  const paperProfile: PrintPaperProfileDto = parsed.paperProfile ?? config.data.paperProfile;
  const job = await createPrintJob({
    idempotencyKey: randomUUID(),
    documentKind: parsed.documentKind,
    documentId: parsed.documentId,
    paperProfile,
    statementSnapshotToken: parsed.statementSnapshotToken,
  });
  if (!job.ok) {
    return job;
  }

  const prepared = await preparePrintAttempt({
    idempotencyKey: randomUUID(),
    jobId: job.data.job.id,
    classification: parsed.classification,
    reprintReason: parsed.reprintReason,
    printerSystemName: config.data.printerSystemName,
    paperProfile,
  });
  if (!prepared.ok) {
    return prepared;
  }

  return submitToPrinter({
    attemptId: prepared.data.attempt.id,
    viewModel: prepared.data.viewModel,
    printerSystemName: config.data.printerSystemName,
  });
}
