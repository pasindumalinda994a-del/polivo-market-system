import {
  syncDiagnosticExportResponseSchema,
  syncRecoveryCancelResponseSchema,
  syncRecoveryExecuteResponseSchema,
  syncRecoveryPlanResponseSchema,
  syncReconciliationResponseSchema,
  syncWorkerRetryResponseSchema,
  syncWorkerStatusSchema,
  syncWorkspaceStatusSchema,
  type SyncDiagnosticExportResponse,
  type SyncRecoveryCancelResponse,
  type SyncRecoveryExecuteResponse,
  type SyncRecoveryPlanResponse,
  type SyncReconciliationResponse,
  type SyncWorkerRetryResponse,
  type SyncWorkerStatus,
  type SyncWorkspaceStatus,
} from "@polivo/contracts";
import { dialog } from "electron";
import { writeFile } from "node:fs/promises";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type SyncApiError = {
  ok: false;
  code: string;
  message: string;
};

export type SyncApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type SyncApiResult<T> = SyncApiSuccess<T> | SyncApiError;

const UNAUTHENTICATED: SyncApiError = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "Staff session required.",
};

function parseError(status: number, bodyText: string, fallback: string): SyncApiError {
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
  };
}

async function hostCall<T>(args: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  fallback: string;
  parse: (value: unknown) => T;
}): Promise<SyncApiResult<T>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: args.method,
      path: args.path,
      body: args.body,
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

export async function getSyncStatus(): Promise<SyncApiResult<SyncWorkerStatus>> {
  return hostCall({
    method: "GET",
    path: "/sync/status",
    fallback: "Unable to load sync status.",
    parse: (value) => syncWorkerStatusSchema.parse(value),
  });
}

export async function getSyncWorkspace(): Promise<SyncApiResult<SyncWorkspaceStatus>> {
  return hostCall({
    method: "GET",
    path: "/sync/workspace",
    fallback: "Unable to load sync workspace.",
    parse: (value) => syncWorkspaceStatusSchema.parse(value),
  });
}

export async function retrySyncNow(): Promise<SyncApiResult<SyncWorkerRetryResponse>> {
  return hostCall({
    method: "POST",
    path: "/sync/retry",
    fallback: "Unable to request sync retry.",
    parse: (value) => syncWorkerRetryResponseSchema.parse(value),
  });
}

export async function runSyncReconciliation(input: {
  requestId: string;
  includeReporting?: boolean;
}): Promise<SyncApiResult<SyncReconciliationResponse>> {
  return hostCall({
    method: "POST",
    path: "/sync/reconcile",
    body: {
      requestId: input.requestId,
      includeReporting: input.includeReporting ?? true,
    },
    fallback: "Unable to run reconciliation.",
    parse: (value) => syncReconciliationResponseSchema.parse(value),
  });
}

export async function createSyncRecoveryPlan(input: {
  requestId: string;
  actionType: string;
  groupIds?: string[];
}): Promise<SyncApiResult<SyncRecoveryPlanResponse>> {
  return hostCall({
    method: "POST",
    path: "/sync/recovery/plan",
    body: input,
    fallback: "Unable to create recovery plan.",
    parse: (value) => syncRecoveryPlanResponseSchema.parse(value),
  });
}

export async function executeSyncRecoveryPlan(input: {
  requestId: string;
  planId: string;
  idempotencyKey: string;
}): Promise<SyncApiResult<SyncRecoveryExecuteResponse>> {
  return hostCall({
    method: "POST",
    path: "/sync/recovery/execute",
    body: { ...input, confirm: true },
    fallback: "Unable to execute recovery plan.",
    parse: (value) => syncRecoveryExecuteResponseSchema.parse(value),
  });
}

export async function cancelSyncRecoveryJob(input: {
  requestId: string;
  jobId: string;
}): Promise<SyncApiResult<SyncRecoveryCancelResponse>> {
  return hostCall({
    method: "POST",
    path: "/sync/recovery/cancel",
    body: input,
    fallback: "Unable to cancel recovery job.",
    parse: (value) => syncRecoveryCancelResponseSchema.parse(value),
  });
}

export async function exportSyncDiagnostics(input: {
  requestId: string;
}): Promise<SyncApiResult<SyncDiagnosticExportResponse & { savedPath?: string }>> {
  const created = await hostCall({
    method: "POST",
    path: "/sync/diagnostics/export",
    body: input,
    fallback: "Unable to create diagnostic export.",
    parse: (value) => syncDiagnosticExportResponseSchema.parse(value),
  });
  if (!created.ok) {
    return created;
  }

  const artifact = await hostCall({
    method: "GET",
    path: `/sync/diagnostics/exports/${encodeURIComponent(created.data.exportId)}`,
    fallback: "Unable to download diagnostic export.",
    parse: (value) =>
      value as {
        contentJson: string;
        defaultFileName: string;
        contentSha256: string;
      },
  });
  if (!artifact.ok) {
    return artifact;
  }

  const save = await dialog.showSaveDialog({
    title: "Save sync diagnostics",
    defaultPath: artifact.data.defaultFileName || created.data.defaultFileName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (save.canceled || !save.filePath) {
    return {
      ok: false,
      code: "CANCELLED",
      message: "Save cancelled.",
    };
  }
  await writeFile(save.filePath, artifact.data.contentJson, "utf8");
  return {
    ok: true,
    data: { ...created.data, savedPath: save.filePath },
  };
}
