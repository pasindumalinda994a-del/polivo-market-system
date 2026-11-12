import {
  allocateExistingPaymentPreviewRequestSchema,
  allocateExistingPaymentPreviewResponseSchema,
  allocateExistingPaymentRequestSchema,
  allocateExistingPaymentResponseSchema,
  eligibleObligationsQuerySchema,
  eligibleObligationsResponseSchema,
  idempotencyKeySchema,
  listPaymentsQuerySchema,
  listPaymentsResponseSchema,
  opaqueIdSchema,
  paymentOperationResultSchema,
  paymentPostRequestSchema,
  paymentPostResponseSchema,
  paymentPreviewRequestSchema,
  paymentPreviewResponseSchema,
  paymentRecordSchema,
  paymentReversalCommitRequestSchema,
  paymentReversalCommitResponseSchema,
  paymentReversalPreviewRequestSchema,
  paymentReversalPreviewResponseSchema,
  type PaymentOperationResult,
  type PaymentRecordDto,
} from "@polivo/contracts";
import {
  RepositoryError,
  getIdempotencyRecord,
  getPaymentById,
  listPayments,
} from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import type { AuthorizedPrincipal } from "../auth/authorization.js";
import {
  PAYMENTS_PAY_FARMER_CAPABILITY,
  PAYMENTS_RECEIVE_TRADER_CAPABILITY,
  PAYMENTS_RECORD_CHEQUE_CAPABILITY,
  PAYMENTS_REVERSE_CAPABILITY,
  PAYMENT_ALLOCATE_EXISTING_COMMAND_TYPE,
  PAYMENT_POST_COMMAND_TYPE,
  PAYMENT_REVERSE_COMMAND_TYPE,
  assertChequeDirectionAllowed,
  buildAllocateExistingPreview,
  buildEligibleObligations,
  buildPaymentPreview,
  buildReversalPreview,
  capabilityForPaymentDirection,
  loadPaymentDto,
  runAllocateExistingCommand,
  runPostPaymentCommand,
  runReversePaymentCommand,
  unsupportedAllocationReleaseError,
} from "../commands/payment-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import {
  buildIdempotencyScope,
  resolveBoundStall,
  type ExecutionContext,
} from "../context/execution-context.js";
import {
  AppError,
  forbiddenError,
  notFoundError,
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

function parseIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  return parseWithSchema(idempotencyKeySchema, raw, "idempotency-key header");
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

/**
 * Authorize when the caller holds at least one of the given capabilities.
 * The authorization adapter checks a single required capability, so each candidate is probed in turn;
 * only permission denials fall through to the next candidate.
 */
function authorizeAnyCapability(
  deps: ServiceDependencies,
  capabilities: readonly string[],
  args: AuthArgs,
): AuthorizedPrincipal {
  let denied: AppError | null = null;
  for (const capability of capabilities) {
    try {
      return authorizeCapability(deps, capability, args);
    } catch (error) {
      if (error instanceof AppError && error.code === "FORBIDDEN") {
        denied = error;
        continue;
      }
      throw error;
    }
  }
  throw denied ?? forbiddenError("Missing payment capability.");
}

function readAuth(request: Parameters<typeof readRequestAuthMaterial>[0]) {
  const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
  if (authMaterial instanceof AppError) {
    throw authMaterial;
  }
  return authMaterial;
}

function previewContext(
  binding: { tenantId: string; stallId: string },
  capability: string,
  requestId: string,
): ExecutionContext {
  return {
    tenantId: binding.tenantId,
    stallId: binding.stallId,
    actorRef: "preview",
    deviceRef: "preview",
    capability,
    requestId,
  };
}

function bindStall(deps: ServiceDependencies) {
  const binding = resolveBoundStall(requireDatabase(deps));
  if (binding instanceof AppError) {
    throw binding;
  }
  return binding;
}

function canViewDirection(principal: AuthorizedPrincipal, direction: "receive" | "pay"): boolean {
  return (
    principal.capabilities.has(capabilityForPaymentDirection(direction)) ||
    principal.capabilities.has(PAYMENTS_REVERSE_CAPABILITY)
  );
}

const OPERATION_COMMAND_TYPES = {
  post: PAYMENT_POST_COMMAND_TYPE,
  allocate: PAYMENT_ALLOCATE_EXISTING_COMMAND_TYPE,
  reverse: PAYMENT_REVERSE_COMMAND_TYPE,
} as const;

type OperationKind = keyof typeof OPERATION_COMMAND_TYPES;

function parseOperationKind(query: unknown): OperationKind | undefined {
  const raw = (query as { commandType?: unknown } | undefined)?.commandType;
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "post" || raw === "allocate" || raw === "reverse") {
    return raw;
  }
  throw validationError("Invalid query.", [
    {
      path: "commandType",
      code: "invalid_value",
      message: "commandType must be post, allocate, or reverse.",
    },
  ]);
}

function summarizePayment(payment: PaymentRecordDto): PaymentOperationResult {
  return paymentOperationResultSchema.parse({
    paymentId: payment.paymentId,
    referenceNumber: payment.referenceNumber,
    postingId: payment.postingId,
    status: payment.status,
  });
}

function summarizeStoredResult(kind: OperationKind, resultRef: string): PaymentOperationResult {
  const stored: unknown = JSON.parse(resultRef);
  switch (kind) {
    case "post":
      return summarizePayment(paymentPostResponseSchema.parse(stored).payment);
    case "allocate":
      return summarizePayment(allocateExistingPaymentResponseSchema.parse(stored).payment);
    case "reverse":
      return summarizePayment(paymentReversalCommitResponseSchema.parse(stored).reversalPayment);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown operation kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Cash/bank payment preview, posting, allocation of unapplied amounts, reversal, history, and
 * operation outcome routes. Authorization uses concrete request paths (never Fastify templates)
 * so the device proof binds to the exact path.
 */
export function registerPaymentRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  const ALL_PAYMENT_CAPABILITIES = [
    PAYMENTS_RECEIVE_TRADER_CAPABILITY,
    PAYMENTS_PAY_FARMER_CAPABILITY,
    PAYMENTS_REVERSE_CAPABILITY,
  ] as const;

  app.get("/payments/obligations", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const query = parseWithSchema(eligibleObligationsQuerySchema, request.query, "query");
    const capability = capabilityForPaymentDirection(query.direction);
    authorizeCapability(deps, capability, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/payments/obligations",
    });
    const binding = bindStall(deps);
    const body = buildEligibleObligations(
      requireCommandDeps(deps),
      previewContext(binding, capability, requestId),
      query,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(eligibleObligationsResponseSchema.parse(body));
  });

  app.post("/payments/preview", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    assertChequeDirectionAllowed(request.body);
    const body = parseWithSchema(paymentPreviewRequestSchema, request.body, "body");
    const capability = capabilityForPaymentDirection(body.direction);
    const authArgs = {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments/preview",
    } as const;
    authorizeCapability(deps, capability, authArgs);
    if (body.method === "cheque") {
      authorizeCapability(deps, PAYMENTS_RECORD_CHEQUE_CAPABILITY, authArgs);
    }
    const binding = bindStall(deps);
    const preview = buildPaymentPreview(
      requireCommandDeps(deps),
      previewContext(binding, capability, requestId),
      body,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(paymentPreviewResponseSchema.parse(preview));
  });

  app.post("/payments", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    assertChequeDirectionAllowed(request.body);
    const body = parseWithSchema(paymentPostRequestSchema, request.body, "body");
    const capability = capabilityForPaymentDirection(body.direction);
    const authArgs = {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments",
    } as const;
    authorizeCapability(deps, capability, authArgs);
    if (body.method === "cheque") {
      authorizeCapability(deps, PAYMENTS_RECORD_CHEQUE_CAPABILITY, authArgs);
    }
    const idempotencyKey = parseIdempotencyKey(request);
    const result = runPostPaymentCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments",
    });
    return reply
      .status(201)
      .header("x-request-id", requestId)
      .send(paymentPostResponseSchema.parse(result));
  });

  app.get("/payments", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const query = parseWithSchema(listPaymentsQuerySchema, request.query, "query");
    const principal = authorizeAnyCapability(deps, ALL_PAYMENT_CAPABILITIES, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/payments",
    });
    const binding = bindStall(deps);

    const viewable = (["receive", "pay"] as const).filter((direction) =>
      canViewDirection(principal, direction),
    );
    if (query.direction !== undefined && !viewable.includes(query.direction)) {
      throw forbiddenError("Missing capability to view payments in this direction.");
    }
    const direction = query.direction ?? (viewable.length === 1 ? viewable[0] : undefined);

    let result;
    try {
      result = listPayments(database, {
        stallId: binding.stallId,
        partyKind: query.partyKind,
        partyId: query.partyId,
        direction,
        method: query.method,
        status: query.status,
        businessDateFrom: query.businessDateFrom,
        businessDateTo: query.businessDateTo,
        limit: query.limit,
        cursor: query.cursor,
      });
    } catch (error) {
      if (error instanceof RepositoryError && error.message.includes("cursor")) {
        throw validationError("Invalid pagination cursor.", [
          { path: "cursor", code: "invalid_cursor", message: "Cursor is not valid." },
        ]);
      }
      throw error;
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(listPaymentsResponseSchema.parse(result));
  });

  app.post("/payments/allocate/preview", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const body = parseWithSchema(allocateExistingPaymentPreviewRequestSchema, request.body, "body");
    const principal = authorizeAnyCapability(
      deps,
      [PAYMENTS_RECEIVE_TRADER_CAPABILITY, PAYMENTS_PAY_FARMER_CAPABILITY],
      {
        requestId,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "POST",
        path: "/payments/allocate/preview",
      },
    );
    const binding = bindStall(deps);
    const payment = getPaymentById(database, binding.stallId, body.paymentId);
    if (payment === null) {
      throw notFoundError("Payment was not found.");
    }
    const capability = capabilityForPaymentDirection(payment.direction);
    if (!principal.capabilities.has(capability)) {
      throw forbiddenError(`Missing capability: ${capability}`);
    }
    const preview = buildAllocateExistingPreview(
      requireCommandDeps(deps),
      previewContext(binding, capability, requestId),
      body,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(allocateExistingPaymentPreviewResponseSchema.parse(preview));
  });

  app.post("/payments/allocate", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const body = parseWithSchema(allocateExistingPaymentRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const result = runAllocateExistingCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments/allocate",
    });
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(allocateExistingPaymentResponseSchema.parse(result));
  });

  // Standalone allocation release/reassignment is unsupported (ADR 0017 §11).
  for (const path of [
    "/payments/allocate/release",
    "/payments/allocate/reassign",
    "/payments/allocations/release",
    "/payments/allocations/reassign",
  ]) {
    app.post(path, async (request) => {
      const requestId = resolveRequestId(request);
      const authMaterial = readAuth(request);
      authorizeAnyCapability(deps, ALL_PAYMENT_CAPABILITIES, {
        requestId,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "POST",
        path,
      });
      throw unsupportedAllocationReleaseError();
    });
  }

  app.post("/payments/reversals/preview", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const body = parseWithSchema(paymentReversalPreviewRequestSchema, request.body, "body");
    authorizeCapability(deps, PAYMENTS_REVERSE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments/reversals/preview",
    });
    const binding = bindStall(deps);
    const preview = buildReversalPreview(
      requireCommandDeps(deps),
      previewContext(binding, PAYMENTS_REVERSE_CAPABILITY, requestId),
      body,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(paymentReversalPreviewResponseSchema.parse(preview));
  });

  app.post("/payments/reversals", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const body = parseWithSchema(paymentReversalCommitRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const result = runReversePaymentCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/payments/reversals",
    });
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(paymentReversalCommitResponseSchema.parse(result));
  });

  /**
   * Operation outcome lookup for lost responses. Looks up the stored idempotent result for the
   * calling principal. Pass `?commandType=post|allocate|reverse`, or omit it to try each scope.
   */
  app.get("/payments/operations/:idempotencyKey", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const key = parseWithSchema(
      idempotencyKeySchema,
      (request.params as { idempotencyKey: string }).idempotencyKey,
      "idempotencyKey",
    );
    const commandType = parseOperationKind(request.query);
    const capabilities =
      commandType === "reverse"
        ? [PAYMENTS_REVERSE_CAPABILITY]
        : commandType === undefined
          ? ALL_PAYMENT_CAPABILITIES
          : [PAYMENTS_RECEIVE_TRADER_CAPABILITY, PAYMENTS_PAY_FARMER_CAPABILITY];
    const auth = authorizeAnyCapability(deps, capabilities, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/payments/operations/${key}`,
    });
    const binding = bindStall(deps);

    const canMoveMoney =
      auth.capabilities.has(PAYMENTS_RECEIVE_TRADER_CAPABILITY) ||
      auth.capabilities.has(PAYMENTS_PAY_FARMER_CAPABILITY);
    const canReverse = auth.capabilities.has(PAYMENTS_REVERSE_CAPABILITY);
    const candidates: readonly OperationKind[] =
      commandType === undefined ? ["post", "allocate", "reverse"] : [commandType];
    const kinds = candidates.filter((kind) => (kind === "reverse" ? canReverse : canMoveMoney));

    for (const kind of kinds) {
      const scope = buildIdempotencyScope({
        tenantId: binding.tenantId,
        stallId: binding.stallId,
        commandType: OPERATION_COMMAND_TYPES[kind],
        actorRef: auth.actorRef,
        deviceRef: auth.deviceRef,
      });
      const record = getIdempotencyRecord(database, scope, key);
      if (record !== null && record.resultRef !== null) {
        return reply
          .status(200)
          .header("x-request-id", requestId)
          .send(summarizeStoredResult(kind, record.resultRef));
      }
    }
    throw notFoundError("Payment operation outcome was not found.");
  });

  app.get("/payments/:paymentId", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    const paymentId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { paymentId: string }).paymentId,
      "paymentId",
    );
    const principal = authorizeAnyCapability(deps, ALL_PAYMENT_CAPABILITIES, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/payments/${paymentId}`,
    });
    const binding = bindStall(deps);
    const payment = loadPaymentDto(database, binding.stallId, paymentId);
    if (payment === null) {
      throw notFoundError("Payment was not found.");
    }
    if (!canViewDirection(principal, payment.direction)) {
      throw forbiddenError("Missing capability to view payments in this direction.");
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(paymentRecordSchema.parse(payment));
  });
}
