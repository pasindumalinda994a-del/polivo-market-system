import {
  createReportExportRequestSchema,
  opaqueIdSchema,
  reportQuerySchema,
  reportTypeSchema,
} from "@polivo/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  DATA_EXPORT_CAPABILITY,
  REPORTS_VIEW_CAPABILITY,
  createReportExportJob,
  loadReport,
  loadReportCatalog,
  loadReportExportArtifact,
} from "../commands/report-commands.js";
import type { AuthorizedPrincipal } from "../auth/authorization.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { buildExecutionContext, resolveBoundStall } from "../context/execution-context.js";
import {
  AppError,
  forbiddenError,
  serviceUnavailableError,
  validationError,
} from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

type AuthArgs = {
  requestId: string;
  deviceProof: import("../auth/device-proof.js").DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
};

function requireDatabase(deps: ServiceDependencies) {
  if (!deps.database) {
    throw serviceUnavailableError("Local database is not available.");
  }
  return deps.database;
}

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

function nowIso(deps: ServiceDependencies): string {
  return deps.now();
}

function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  if (typeof raw !== "string" || raw.trim() === "") {
    throw validationError("Idempotency-Key header is required.", [
      { path: "idempotency-key", code: "REQUIRED", message: "Idempotency-Key header is required." },
    ]);
  }
  return raw.trim();
}

export function registerReportRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/reports/catalog", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    authorizeCapability(deps, REPORTS_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: request.method,
      path: request.url.split("?")[0] ?? request.url,
    });
    return reply.code(200).header("x-request-id", requestId).send(loadReportCatalog());
  });

  app.get("/reports/:reportType", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    authorizeCapability(deps, REPORTS_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: request.method,
      path: request.url.split("?")[0] ?? request.url,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) throw binding;
    const params = request.params as { reportType: string };
    const reportType = parseWithSchema(reportTypeSchema, params.reportType, "reportType");
    const queryRaw = request.query as Record<string, unknown>;
    const filters: Record<string, unknown> = {};
    for (const key of [
      "fromBusinessDate",
      "toBusinessDate",
      "asOfBusinessDate",
      "farmerId",
      "buyerId",
      "vegetableId",
      "paymentMethod",
      "paymentDirection",
      "paymentStatus",
      "grouping",
      "sort",
    ]) {
      if (queryRaw[key] !== undefined) filters[key] = queryRaw[key];
    }
    const query = parseWithSchema(
      reportQuerySchema,
      {
        reportType,
        filters,
        limit: queryRaw["limit"],
        cursor: queryRaw["cursor"],
        snapshotToken: queryRaw["snapshotToken"],
      },
      "query",
    );
    const body = loadReport(database, binding.stallId, query, nowIso(deps));
    return reply.code(200).header("x-request-id", requestId).send(body);
  });

  app.post("/reports/exports", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const principal = authorizeCapability(deps, DATA_EXPORT_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: request.method,
      path: request.url.split("?")[0] ?? request.url,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) throw binding;
    const idempotencyKey = readIdempotencyKey(request);
    const body = parseWithSchema(createReportExportRequestSchema, request.body, "body");
    const context = buildExecutionContext({
      binding,
      principal,
      capability: DATA_EXPORT_CAPABILITY,
      requestId,
      idempotencyKey,
    });
    if (context instanceof AppError) throw context;
    const commandDeps = requireCommandDeps(deps);
    const result = createReportExportJob(commandDeps, context, body, idempotencyKey);
    return reply.code(201).header("x-request-id", requestId).send(result);
  });

  app.get("/reports/exports/:exportJobId", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const principal = authorizeCapability(deps, DATA_EXPORT_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: request.method,
      path: request.url.split("?")[0] ?? request.url,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) throw binding;
    const params = request.params as { exportJobId: string };
    const exportJobId = parseWithSchema(opaqueIdSchema, params.exportJobId, "exportJobId");
    const artifact = loadReportExportArtifact(
      database,
      binding.stallId,
      exportJobId,
      nowIso(deps),
      principal.actorRef,
    );
    return reply.code(200).header("x-request-id", requestId).send(artifact);
  });
}
