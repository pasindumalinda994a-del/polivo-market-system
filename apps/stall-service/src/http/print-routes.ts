import {
  createPrintJobRequestSchema,
  createPrintJobResponseSchema,
  getPrintAttemptResponseSchema,
  listPrintAttemptsQuerySchema,
  listPrintAttemptsResponseSchema,
  markPrintAttemptSubmittingRequestSchema,
  markPrintAttemptSubmittingResponseSchema,
  opaqueIdSchema,
  preparePrintAttemptRequestSchema,
  preparePrintAttemptResponseSchema,
  printDocumentKindSchema,
  recoverPrintAttemptRequestSchema,
  recoverPrintAttemptResponseSchema,
  reportPrintAttemptOutcomeRequestSchema,
  reportPrintAttemptOutcomeResponseSchema,
} from "@polivo/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthorizedPrincipal } from "../auth/authorization.js";
import {
  DOCUMENTS_PRINT_CAPABILITY,
  DOCUMENTS_REPRINT_CAPABILITY,
  getPrintAttemptDetail,
  getStallPrintIdentityResponse,
  listPrintAttemptsForDocument,
  runCreatePrintJobCommand,
  runMarkPrintAttemptSubmittingCommand,
  runPreparePrintAttemptCommand,
  runRecoverPrintAttemptCommand,
  runReportPrintAttemptOutcomeCommand,
  stallPrintIdentityResponseSchema,
  upsertStallPrintIdentityCommand,
  upsertStallPrintIdentityRequestSchema,
} from "../commands/print-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { resolveBoundStall } from "../context/execution-context.js";
import {
  AppError,
  forbiddenError,
  serviceUnavailableError,
  validationError,
} from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

const SETTINGS_MANAGE_CAPABILITY = "settings.manage";

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
  touchActivity: boolean,
): AuthorizedPrincipal {
  const auth = deps.authorization.authorize({
    requiredCapability: capability,
    requestId: args.requestId,
    deviceProof: args.deviceProof,
    sessionSecret: args.sessionSecret,
    method: args.method,
    path: args.path,
    touchActivity,
  });
  if (auth instanceof AppError) {
    throw auth;
  }
  if (!auth.capabilities.has(capability)) {
    throw forbiddenError(`Missing capability: ${capability}`);
  }
  return auth;
}

/** Authorize with any one of the capabilities; only permission denials fall through. */
function authorizeAnyCapability(
  deps: ServiceDependencies,
  capabilities: readonly string[],
  args: AuthArgs,
  touchActivity = false,
): AuthorizedPrincipal {
  let denied: AppError | null = null;
  for (const capability of capabilities) {
    try {
      return authorizeCapability(deps, capability, args, touchActivity);
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

function bindStall(deps: ServiceDependencies) {
  const binding = resolveBoundStall(requireDatabase(deps));
  if (binding instanceof AppError) {
    throw binding;
  }
  return binding;
}

/**
 * The contract carries the idempotency key in the body. An `Idempotency-Key` header is
 * optional, but must agree with the body when both are present.
 */
export function assertHeaderMatchesBodyIdempotencyKey(
  headers: Record<string, unknown>,
  bodyKey: string,
): void {
  const header = headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === undefined) {
    return;
  }
  if (raw !== bodyKey) {
    throw validationError("Idempotency-Key header does not match the request body.", [
      {
        path: "idempotencyKey",
        code: "IDEMPOTENCY_KEY_MISMATCH",
        message: "Use the same idempotency key in the header and the body, or omit the header.",
      },
    ]);
  }
}

function commandMeta(
  request: FastifyRequest,
  path: string,
): {
  requestId: string;
  deviceProof: import("../auth/device-proof.js").DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
} {
  const requestId = resolveRequestId(request);
  const authMaterial = readAuth(request);
  return {
    requestId,
    deviceProof: authMaterial.deviceProof,
    sessionSecret: authMaterial.sessionSecret!,
    method: "POST",
    path,
  };
}

const PRINT_VIEW_CAPABILITIES = [DOCUMENTS_PRINT_CAPABILITY, DOCUMENTS_REPRINT_CAPABILITY] as const;
const STALL_IDENTITY_CAPABILITIES = [
  SETTINGS_MANAGE_CAPABILITY,
  DOCUMENTS_PRINT_CAPABILITY,
] as const;

/**
 * Print job, attempt, and stall-identity routes. Authorization uses concrete request paths
 * (never Fastify templates) so the device proof binds to the exact path. The service returns
 * trusted view models only; HTML rendering and printer submission happen in Electron main.
 */
export function registerPrintRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/print/stall-identity", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const principal = authorizeAnyCapability(deps, STALL_IDENTITY_CAPABILITIES, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/print/stall-identity",
    });
    bindStall(deps);
    const body = getStallPrintIdentityResponse(requireCommandDeps(deps), principal.capabilities);
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(stallPrintIdentityResponseSchema.parse(body));
  });

  app.put("/print/stall-identity", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const body = parseWithSchema(upsertStallPrintIdentityRequestSchema, request.body, "body");
    const principal = authorizeAnyCapability(
      deps,
      STALL_IDENTITY_CAPABILITIES,
      {
        requestId,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "PUT",
        path: "/print/stall-identity",
      },
      true,
    );
    const binding = bindStall(deps);
    const result = upsertStallPrintIdentityCommand(requireCommandDeps(deps), body, {
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      actorRef: principal.actorRef,
      deviceRef: principal.deviceRef,
      requestId,
      capabilities: principal.capabilities,
    });
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(stallPrintIdentityResponseSchema.parse(result));
  });

  app.post("/print/jobs", async (request, reply) => {
    const meta = commandMeta(request, "/print/jobs");
    const body = parseWithSchema(createPrintJobRequestSchema, request.body, "body");
    assertHeaderMatchesBodyIdempotencyKey(request.headers, body.idempotencyKey);
    const result = runCreatePrintJobCommand(requireCommandDeps(deps), body, meta);
    return reply
      .status(result.replayed ? 200 : 201)
      .header("x-request-id", meta.requestId)
      .send(createPrintJobResponseSchema.parse(result));
  });

  app.get("/print/documents/:kind/:id/attempts", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const params = request.params as { kind: string; id: string };
    const documentKind = parseWithSchema(printDocumentKindSchema, params.kind, "kind");
    const documentId = parseWithSchema(opaqueIdSchema, params.id, "id");
    const rawQuery =
      typeof request.query === "object" && request.query !== null ? request.query : {};
    const query = parseWithSchema(
      listPrintAttemptsQuerySchema,
      { ...rawQuery, documentKind, documentId },
      "query",
    );
    const principal = authorizeAnyCapability(deps, PRINT_VIEW_CAPABILITIES, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/print/documents/${documentKind}/${documentId}/attempts`,
    });
    const binding = bindStall(deps);
    const result = listPrintAttemptsForDocument(
      requireCommandDeps(deps),
      {
        tenantId: binding.tenantId,
        stallId: binding.stallId,
        capabilities: principal.capabilities,
      },
      query,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(listPrintAttemptsResponseSchema.parse(result));
  });

  app.post("/print/attempts/prepare", async (request, reply) => {
    const meta = commandMeta(request, "/print/attempts/prepare");
    const body = parseWithSchema(preparePrintAttemptRequestSchema, request.body, "body");
    assertHeaderMatchesBodyIdempotencyKey(request.headers, body.idempotencyKey);
    const result = runPreparePrintAttemptCommand(requireCommandDeps(deps), body, meta);
    return reply
      .status(result.replayed ? 200 : 201)
      .header("x-request-id", meta.requestId)
      .send(preparePrintAttemptResponseSchema.parse(result));
  });

  app.post("/print/attempts/submitting", async (request, reply) => {
    const meta = commandMeta(request, "/print/attempts/submitting");
    const body = parseWithSchema(markPrintAttemptSubmittingRequestSchema, request.body, "body");
    assertHeaderMatchesBodyIdempotencyKey(request.headers, body.idempotencyKey);
    const result = runMarkPrintAttemptSubmittingCommand(requireCommandDeps(deps), body, meta);
    return reply
      .status(200)
      .header("x-request-id", meta.requestId)
      .send(markPrintAttemptSubmittingResponseSchema.parse(result));
  });

  app.post("/print/attempts/outcome", async (request, reply) => {
    const meta = commandMeta(request, "/print/attempts/outcome");
    const body = parseWithSchema(reportPrintAttemptOutcomeRequestSchema, request.body, "body");
    assertHeaderMatchesBodyIdempotencyKey(request.headers, body.idempotencyKey);
    const result = runReportPrintAttemptOutcomeCommand(requireCommandDeps(deps), body, meta);
    return reply
      .status(200)
      .header("x-request-id", meta.requestId)
      .send(reportPrintAttemptOutcomeResponseSchema.parse(result));
  });

  app.post("/print/attempts/recover", async (request, reply) => {
    const meta = commandMeta(request, "/print/attempts/recover");
    const body = parseWithSchema(recoverPrintAttemptRequestSchema, request.body, "body");
    assertHeaderMatchesBodyIdempotencyKey(request.headers, body.idempotencyKey);
    const result = runRecoverPrintAttemptCommand(requireCommandDeps(deps), body, meta);
    return reply
      .status(200)
      .header("x-request-id", meta.requestId)
      .send(recoverPrintAttemptResponseSchema.parse(result));
  });

  app.get("/print/attempts/:attemptId", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const attemptId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { attemptId: string }).attemptId,
      "attemptId",
    );
    const principal = authorizeAnyCapability(deps, PRINT_VIEW_CAPABILITIES, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/print/attempts/${attemptId}`,
    });
    const binding = bindStall(deps);
    const result = getPrintAttemptDetail(
      requireCommandDeps(deps),
      {
        tenantId: binding.tenantId,
        stallId: binding.stallId,
        capabilities: principal.capabilities,
      },
      attemptId,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(getPrintAttemptResponseSchema.parse(result));
  });
}
