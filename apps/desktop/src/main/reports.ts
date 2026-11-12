import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  createReportExportResponseSchema,
  reportCatalogResponseSchema,
  reportExportArtifactSchema,
  reportResponseSchema,
  reportTypeSchema,
  type CreateReportExportRequest,
  type CreateReportExportResponse,
  type ReportCatalogResponse,
  type ReportExportArtifactDto,
  type ReportFiltersDto,
  type ReportResponse,
  type ReportTypeDto,
} from "@polivo/contracts";
import { BrowserWindow, dialog } from "electron";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type ReportsApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
  cancelled?: boolean;
};

export type ReportsApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type ReportsApiResult<T> = ReportsApiSuccess<T> | ReportsApiError;

const UNAUTHENTICATED: ReportsApiError = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "Staff session required.",
};

export function assertSafeReportIpcPayload(input: unknown): void {
  if (!input || typeof input !== "object") {
    return;
  }
  const record = input as Record<string, unknown>;
  for (const key of ["html", "url", "path", "filePath", "shellCommand", "command", "script"]) {
    if (key in record) {
      throw new Error(`Rejected report IPC field: ${key}`);
    }
  }
}

function parseError(status: number, bodyText: string, fallback: string): ReportsApiError {
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

async function hostCall<T>(args: {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  fallback: string;
  parse: (value: unknown) => T;
}): Promise<ReportsApiResult<T>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  const generation = getConnectionRequestGeneration();
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
    const data = args.parse(JSON.parse(response.bodyText));
    if (getConnectionRequestGeneration() !== generation) {
      return { ok: true, data, stale: true };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : args.fallback,
    };
  }
}

export async function getReportCatalog(): Promise<ReportsApiResult<ReportCatalogResponse>> {
  return hostCall({
    method: "GET",
    path: "/reports/catalog",
    fallback: "Unable to load report catalog.",
    parse: (value) => reportCatalogResponseSchema.parse(value),
  });
}

export async function runReport(input: {
  reportType: ReportTypeDto;
  filters?: ReportFiltersDto;
  limit?: number;
  cursor?: string;
  snapshotToken?: string;
}): Promise<ReportsApiResult<ReportResponse>> {
  assertSafeReportIpcPayload(input);
  const reportType = reportTypeSchema.parse(input.reportType);
  const filters = input.filters ?? {};
  const query: Record<string, string | undefined> = {
    limit: input.limit !== undefined ? String(input.limit) : undefined,
    cursor: input.cursor,
    snapshotToken: input.snapshotToken,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      query[key] = String(value);
    }
  }
  return hostCall({
    method: "GET",
    path: `/reports/${reportType}`,
    query,
    fallback: "Unable to load report.",
    parse: (value) => reportResponseSchema.parse(value),
  });
}

export async function createReportExport(
  input: CreateReportExportRequest,
  idempotencyKey?: string,
): Promise<ReportsApiResult<CreateReportExportResponse>> {
  assertSafeReportIpcPayload(input);
  return hostCall({
    method: "POST",
    path: "/reports/exports",
    body: input,
    idempotencyKey: idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey : randomUUID(),
    fallback: "Unable to prepare report export.",
    parse: (value) => createReportExportResponseSchema.parse(value),
  });
}

export async function getReportExportArtifact(
  exportJobId: string,
): Promise<ReportsApiResult<ReportExportArtifactDto>> {
  assertSafeReportIpcPayload({ exportJobId });
  return hostCall({
    method: "GET",
    path: `/reports/exports/${exportJobId}`,
    fallback: "Unable to retrieve export artifact.",
    parse: (value) => reportExportArtifactSchema.parse(value),
  });
}

async function htmlToPdfBuffer(html: string): Promise<Buffer> {
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
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await window.webContents.printToPDF({
      landscape: true,
      printBackground: true,
      pageSize: "A4",
    });
    return Buffer.from(pdf);
  } finally {
    window.destroy();
  }
}

/**
 * Retrieve authorized export artifact and save via native dialog.
 * PDF jobs return trusted HTML from the service; main process converts with printToPDF.
 */
export async function saveReportExport(input: {
  exportJobId: string;
  defaultFileName?: string;
}): Promise<ReportsApiResult<{ savedPath: string; byteLength: number }>> {
  assertSafeReportIpcPayload(input);
  const artifact = await getReportExportArtifact(input.exportJobId);
  if (!artifact.ok) {
    return artifact;
  }
  if (artifact.stale) {
    return { ok: false, code: "STALE", message: "Export response is stale; retry." };
  }

  const job = artifact.data.job;
  const defaultName = input.defaultFileName ?? job.defaultFileName;
  const filters =
    job.format === "csv"
      ? [{ name: "CSV", extensions: ["csv"] }]
      : [{ name: "PDF", extensions: ["pdf"] }];

  const result = await dialog.showSaveDialog({
    title: "Save report export",
    defaultPath: defaultName,
    filters,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) {
    return {
      ok: false,
      code: "CANCELLED",
      message: "Save cancelled.",
      cancelled: true,
    };
  }

  const dest = result.filePath;
  const tempPath = join(tmpdir(), `polivo-export-${randomUUID()}.partial`);
  try {
    mkdirSync(dirname(tempPath), { recursive: true });
    const raw = Buffer.from(artifact.data.contentBase64, "base64");
    let finalBytes: Buffer;
    if (job.format === "csv") {
      finalBytes = raw;
    } else {
      finalBytes = await htmlToPdfBuffer(raw.toString("utf8"));
    }
    writeFileSync(tempPath, finalBytes);
    writeFileSync(dest, finalBytes);
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort temp cleanup
    }
    return { ok: true, data: { savedPath: dest, byteLength: finalBytes.byteLength } };
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore
    }
    return {
      ok: false,
      code: "IO_ERROR",
      message: error instanceof Error ? error.message : "Failed to save export file.",
    };
  }
}
