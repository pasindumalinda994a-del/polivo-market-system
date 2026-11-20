import {
  mapZodIssuesToValidationIssues,
  syncDiagnosticExportResponseSchema,
  syncRecoveryCancelRequestSchema,
  syncRecoveryCancelResponseSchema,
  syncRecoveryExecuteRequestSchema,
  syncRecoveryExecuteResponseSchema,
  syncRecoveryPlanRequestSchema,
  syncRecoveryPlanResponseSchema,
  syncReconciliationRequestSchema,
  syncReconciliationResponseSchema,
  syncWorkerRetryResponseSchema,
  syncWorkspaceStatusSchema,
} from "@polivo/contracts";
import { getDiagnosticExportById, getStallBinding } from "@polivo/db-local";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthorizedPrincipal } from "../auth/authorization.js";
import type { ServiceDependencies } from "../composition.js";
import type { ConfigWorkerHandle } from "../config-sync/worker.js";
import {
  AppError,
  forbiddenError,
  notFoundError,
  serviceUnavailableError,
  validationError,
} from "../errors/app-error.js";
import type { ReconciliationCloudClient } from "../sync/reconciliation/cloud-client.js";
import { createDiagnosticExport } from "../sync/reconciliation/diagnostics.js";
import { runReconciliation } from "../sync/reconciliation/engine.js";
import {
  cancelRecoveryJob,
  createRecoveryPlan,
  executeRecoveryPlan,
} from "../sync/reconciliation/recovery.js";
import { buildWorkspaceStatus } from "../sync/reconciliation/workspace.js";
import type { SyncWorkerHandle } from "../sync/worker.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";

type AuthArgs = {
  requestId: string;
  deviceProof: import("../auth/device-proof.js").DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
};

function readAuth(request: FastifyRequest) {
  const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
  if (authMaterial instanceof AppError) {
    throw authMaterial;
  }
  return authMaterial;
}

function authorizeCapability(
  deps: ServiceDependencies,
  capability: string,
  args: AuthArgs,
): AuthorizedPrincipal {
  const auth = deps.authorization.authorize({
    requiredCapability: capability,
    requestId: args.requestId,
    deviceProof: args.deviceProof,
    sessionSecret: args.sessionSecret,
    method: args.method,
    path: args.path,
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

function requireSessionAuth(
  deps: ServiceDependencies,
  request: FastifyRequest,
  capability: string,
  path: string,
): { requestId: string; principal: AuthorizedPrincipal } {
  const requestId = resolveRequestId(request);
  const authMaterial = readAuth(request);
  if (!authMaterial.sessionSecret) {
    throw forbiddenError("Staff session is required.");
  }
  const principal = authorizeCapability(deps, capability, {
    requestId,
    deviceProof: authMaterial.deviceProof,
    sessionSecret: authMaterial.sessionSecret,
    method: request.method,
    path,
  });
  return { requestId, principal };
}

export function registerSyncRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
  syncWorker: SyncWorkerHandle | null,
  options: {
    configWorker?: ConfigWorkerHandle | null;
    cloudClient?: ReconciliationCloudClient | null;
  } = {},
): void {
  const configWorker = options.configWorker ?? null;
  const cloudClient = options.cloudClient ?? null;

  app.get("/sync/status", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!syncWorker) {
      throw serviceUnavailableError("Sync worker is not available.");
    }
    const { requestId } = requireSessionAuth(deps, request, "sync.view", "/sync/status");
    reply.header("x-request-id", requestId);
    return syncWorker.getStatus();
  });

  app.get("/sync/workspace", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    const { requestId } = requireSessionAuth(deps, request, "sync.view", "/sync/workspace");
    const binding = getStallBinding(deps.database);
    const status = buildWorkspaceStatus({
      database: deps.database,
      stallId: binding.stallId,
      syncWorker,
      configWorker,
      now: deps.now,
    });
    reply.header("x-request-id", requestId);
    return syncWorkspaceStatusSchema.parse(status);
  });

  app.post("/sync/retry", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!syncWorker) {
      throw serviceUnavailableError("Sync worker is not available.");
    }
    const { requestId } = requireSessionAuth(deps, request, "sync.retry", "/sync/retry");
    const retry = syncWorker.requestManualRetry();
    const status = syncWorker.getStatus();
    reply.header("x-request-id", requestId);
    return syncWorkerRetryResponseSchema.parse({
      accepted: retry.accepted,
      status,
      message: retry.message,
    });
  });

  app.post("/sync/reconcile", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!cloudClient) {
      throw serviceUnavailableError("Cloud reconciliation client is not available.");
    }
    const { requestId, principal } = requireSessionAuth(
      deps,
      request,
      "sync.reconcile",
      "/sync/reconcile",
    );
    const parsed = syncReconciliationRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError(
        "Invalid reconciliation request.",
        mapZodIssuesToValidationIssues(parsed.error.issues),
      );
    }
    const binding = getStallBinding(deps.database);
    const run = await runReconciliation({
      database: deps.database,
      stallId: binding.stallId,
      requestId: parsed.data.requestId || requestId,
      staffId: principal.actorRef,
      deviceId: principal.deviceRef,
      createId: deps.createId,
      now: deps.now,
      cloud: cloudClient,
      includeReporting: parsed.data.includeReporting,
      maxGroups: parsed.data.maxGroups,
    });
    reply.header("x-request-id", requestId);
    return syncReconciliationResponseSchema.parse({ run });
  });

  app.post("/sync/recovery/plan", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    const parsed = syncRecoveryPlanRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError(
        "Invalid recovery plan request.",
        mapZodIssuesToValidationIssues(parsed.error.issues),
      );
    }
    const retryOnly =
      parsed.data.actionType === "retry_upload_worker" ||
      parsed.data.actionType === "refresh_configuration";
    const { requestId, principal } = requireSessionAuth(
      deps,
      request,
      retryOnly ? "sync.retry" : "sync.recover",
      "/sync/recovery/plan",
    );
    const binding = getStallBinding(deps.database);
    const plan = createRecoveryPlan({
      database: deps.database,
      stallId: binding.stallId,
      actionType: parsed.data.actionType,
      groupIds: parsed.data.groupIds,
      configurationRevision: parsed.data.configurationRevision,
      staffId: principal.actorRef,
      deviceId: principal.deviceRef,
      createId: deps.createId,
      now: deps.now,
    });
    reply.header("x-request-id", requestId);
    return syncRecoveryPlanResponseSchema.parse({ plan });
  });

  app.post("/sync/recovery/execute", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!cloudClient) {
      throw serviceUnavailableError("Cloud reconciliation client is not available.");
    }
    const parsed = syncRecoveryExecuteRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError(
        "Invalid recovery execute request.",
        mapZodIssuesToValidationIssues(parsed.error.issues),
      );
    }
    const { requestId, principal } = requireSessionAuth(
      deps,
      request,
      "sync.recover",
      "/sync/recovery/execute",
    );
    const binding = getStallBinding(deps.database);
    try {
      const job = await executeRecoveryPlan({
        database: deps.database,
        stallId: binding.stallId,
        planId: parsed.data.planId,
        idempotencyKey: parsed.data.idempotencyKey,
        staffId: principal.actorRef,
        deviceId: principal.deviceRef,
        createId: deps.createId,
        now: deps.now,
        syncWorker,
        configWorker,
        cloud: cloudClient,
      });
      const workspace = buildWorkspaceStatus({
        database: deps.database,
        stallId: binding.stallId,
        syncWorker,
        configWorker,
        now: deps.now,
      });
      reply.header("x-request-id", requestId);
      return syncRecoveryExecuteResponseSchema.parse({ job, workspace });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "RECOVERY_FAILED";
      if (code === "PLAN_STALE" || code === "PLAN_EXPIRED" || code === "PLAN_CONSUMED") {
        throw validationError(error instanceof Error ? error.message : "Plan rejected.", []);
      }
      if (code === "RECOVERY_CONFLICT") {
        throw forbiddenError(error instanceof Error ? error.message : "Conflicting recovery job.");
      }
      throw error;
    }
  });

  app.post("/sync/recovery/cancel", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    const { requestId, principal } = requireSessionAuth(
      deps,
      request,
      "sync.recover",
      "/sync/recovery/cancel",
    );
    const parsed = syncRecoveryCancelRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError(
        "Invalid recovery cancel request.",
        mapZodIssuesToValidationIssues(parsed.error.issues),
      );
    }
    const binding = getStallBinding(deps.database);
    const job = cancelRecoveryJob({
      database: deps.database,
      stallId: binding.stallId,
      jobId: parsed.data.jobId,
      staffId: principal.actorRef,
      deviceId: principal.deviceRef,
      createId: deps.createId,
      now: deps.now,
    });
    reply.header("x-request-id", requestId);
    return syncRecoveryCancelResponseSchema.parse({ job });
  });

  app.post("/sync/diagnostics/export", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    const { requestId, principal } = requireSessionAuth(
      deps,
      request,
      "sync.export_diagnostics",
      "/sync/diagnostics/export",
    );
    const binding = getStallBinding(deps.database);
    const exported = createDiagnosticExport({
      database: deps.database,
      stallId: binding.stallId,
      staffId: principal.actorRef,
      deviceId: principal.deviceRef,
      createId: deps.createId,
      now: deps.now,
      syncWorker,
      configWorker,
    });
    reply.header("x-request-id", requestId);
    return syncDiagnosticExportResponseSchema.parse(exported);
  });

  app.get("/sync/diagnostics/exports/:exportId", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    const { requestId } = requireSessionAuth(
      deps,
      request,
      "sync.export_diagnostics",
      "/sync/diagnostics/exports/:exportId",
    );
    const exportId = (request.params as { exportId: string }).exportId;
    try {
      const row = getDiagnosticExportById(deps.database, exportId);
      if (Date.parse(row.expiresAt) <= Date.now()) {
        throw notFoundError("Diagnostic export has expired.");
      }
      reply.header("x-request-id", requestId);
      reply.header("content-type", "application/json; charset=utf-8");
      return {
        exportId: row.id,
        defaultFileName: row.defaultFileName,
        contentSha256: row.contentSha256,
        contentJson: row.contentJson,
        expiresAt: row.expiresAt,
      };
    } catch {
      throw notFoundError("Diagnostic export was not found.");
    }
  });
}
