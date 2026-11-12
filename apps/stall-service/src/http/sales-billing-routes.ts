import {
  abandonSaleDraftRequestSchema,
  createSaleDraftRequestSchema,
  finalizeSaleRequestSchema,
  finalizeSaleResponseSchema,
  idempotencyKeySchema,
  listSaleDraftsQuerySchema,
  listSaleDraftsResponseSchema,
  listTraderBillsQuerySchema,
  listTraderBillsResponseSchema,
  opaqueIdSchema,
  saleDraftRecordSchema,
  salePreviewResponseSchema,
  traderBillRecordSchema,
  updateSaleDraftRequestSchema,
} from "@polivo/contracts";
import {
  getIdempotencyRecord,
  getSaleById,
  listFinalizedTraderBills,
  listSaleDrafts,
} from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  BILLS_CREATE_CAPABILITY,
  BILLS_EDIT_DRAFT_CAPABILITY,
  BILLS_FINALIZE_CAPABILITY,
  buildSalePreview,
  loadFinalizedTraderBillDto,
  runAbandonSaleDraftCommand,
  runCreateSaleDraftCommand,
  runFinalizeSaleCommand,
  runUpdateSaleDraftCommand,
} from "../commands/sale-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { buildIdempotencyScope, resolveBoundStall } from "../context/execution-context.js";
import { AppError, notFoundError, serviceUnavailableError } from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

function requireDatabase(deps: ServiceDependencies) {
  if (!deps.database) {
    throw serviceUnavailableError("Local database is not available.");
  }
  return deps.database;
}

function authorizeCapability(
  deps: ServiceDependencies,
  capability: string,
  args: {
    requestId: string;
    deviceProof: import("../auth/device-proof.js").DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
) {
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
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${capability}`,
    });
  }
  return auth;
}

function authorizeAnyBillRead(
  deps: ServiceDependencies,
  args: {
    requestId: string;
    deviceProof: import("../auth/device-proof.js").DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
) {
  const auth = deps.authorization.authorize({
    requiredCapability: BILLS_CREATE_CAPABILITY,
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
  const allowed =
    auth.capabilities.has(BILLS_CREATE_CAPABILITY) ||
    auth.capabilities.has(BILLS_EDIT_DRAFT_CAPABILITY) ||
    auth.capabilities.has(BILLS_FINALIZE_CAPABILITY);
  if (!allowed) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Missing billing capability.",
    });
  }
  return auth;
}

function parseIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  return parseWithSchema(idempotencyKeySchema, raw, "idempotency-key header");
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid pagination cursor.",
      issues: [
        {
          path: "cursor",
          code: "invalid_type",
          message: "Cursor must be a non-negative integer offset.",
        },
      ],
    });
  }
  return Number.parseInt(cursor, 10);
}

function toDraftDtoFromRecord(sale: NonNullable<ReturnType<typeof getSaleById>>) {
  return saleDraftRecordSchema.parse({
    id: sale.id,
    stallId: sale.stallId,
    traderId: sale.traderId,
    businessDate: sale.businessDate,
    status: "draft",
    revision: sale.revision,
    lines: sale.lines.map((line) => ({
      lineId: line.id,
      lineOrder: line.lineOrder,
      farmerId: line.farmerId ?? "",
      vegetableId: line.vegetableId,
      packageTypeId: line.packageTypeId ?? "",
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      packagingWeightHundredths: line.packagingWeightHundredths,
      weights: line.weights.map((weight) => ({
        rowKey: weight.rowKey,
        packageTypeId: weight.packageTypeId ?? undefined,
        grossWeightHundredths: weight.grossWeightHundredths,
      })),
      notes: line.notes,
    })),
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  });
}

/**
 * Sales draft, preview, finalize, and buyer-bill read routes.
 * Requires device proof, staff session, and bills.* capabilities.
 */
export function registerSalesBillingRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.post("/sales/drafts", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const body = parseWithSchema(createSaleDraftRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runCreateSaleDraftCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/sales/drafts",
    });
    return reply.status(201).header("x-request-id", requestId).send(result);
  });

  app.get("/sales/drafts", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeAnyBillRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/sales/drafts",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(listSaleDraftsQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const result = listSaleDrafts(database, {
      stallId: binding.stallId,
      limit: query.limit,
      offset,
      traderId: query.traderId,
    });
    const nextOffset = offset + result.items.length;
    const response = listSaleDraftsResponseSchema.parse({
      items: result.items,
      nextCursor: nextOffset < result.totalCount ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/sales/drafts/:id", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    authorizeAnyBillRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/sales/drafts/${saleId}`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const sale = getSaleById(database, binding.stallId, saleId);
    if (sale === null || sale.status !== "draft") {
      throw notFoundError("Sale draft not found for this stall.");
    }
    return reply.status(200).header("x-request-id", requestId).send(toDraftDtoFromRecord(sale));
  });

  app.put("/sales/drafts/:id", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    const body = parseWithSchema(updateSaleDraftRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runUpdateSaleDraftCommand(
      commandDeps,
      { ...body, saleId },
      {
        requestId,
        idempotencyKey,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "PUT",
        path: `/sales/drafts/${saleId}`,
      },
    );
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.post("/sales/drafts/:id/abandon", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    const body = parseWithSchema(abandonSaleDraftRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runAbandonSaleDraftCommand(
      commandDeps,
      { ...body, saleId },
      {
        requestId,
        idempotencyKey,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "POST",
        path: `/sales/drafts/${saleId}/abandon`,
      },
    );
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.post("/sales/drafts/:id/preview", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    authorizeCapability(deps, BILLS_EDIT_DRAFT_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: `/sales/drafts/${saleId}/preview`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const sale = getSaleById(database, binding.stallId, saleId);
    if (sale === null || sale.status !== "draft") {
      throw notFoundError("Sale draft not found for this stall.");
    }
    const preview = salePreviewResponseSchema.parse(buildSalePreview(database, sale));
    return reply.status(200).header("x-request-id", requestId).send(preview);
  });

  app.post("/sales/drafts/:id/finalize", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    const body = parseWithSchema(finalizeSaleRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runFinalizeSaleCommand(
      commandDeps,
      { ...body, saleId },
      {
        requestId,
        idempotencyKey,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret!,
        method: "POST",
        path: `/sales/drafts/${saleId}/finalize`,
      },
    );
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.get("/sales/finalizations/:idempotencyKey", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const key = parseWithSchema(
      opaqueIdSchema,
      (request.params as { idempotencyKey: string }).idempotencyKey,
      "idempotencyKey",
    );
    const auth = authorizeCapability(deps, BILLS_FINALIZE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/sales/finalizations/${key}`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const scope = buildIdempotencyScope({
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      commandType: "sale.finalize",
      actorRef: auth.actorRef,
      deviceRef: auth.deviceRef,
    });
    const record = getIdempotencyRecord(database, scope, key);
    if (record === null || record.resultRef === null) {
      throw notFoundError("Finalization operation result not found.");
    }
    const result = finalizeSaleResponseSchema.parse(JSON.parse(record.resultRef));
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.get("/trader-bills", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeAnyBillRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/trader-bills",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(listTraderBillsQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const result = listFinalizedTraderBills(database, {
      stallId: binding.stallId,
      limit: query.limit,
      offset,
      traderId: query.traderId,
      businessDateFrom: query.businessDateFrom,
      businessDateTo: query.businessDateTo,
    });
    const nextOffset = offset + result.items.length;
    const response = listTraderBillsResponseSchema.parse({
      items: result.items,
      nextCursor: nextOffset < result.totalCount ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/trader-bills/:id", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const billId = parseWithSchema(opaqueIdSchema, (request.params as { id: string }).id, "id");
    authorizeAnyBillRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/trader-bills/${billId}`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const bill = loadFinalizedTraderBillDto(database, binding.stallId, billId);
    if (bill === null) {
      throw notFoundError("Trader bill not found for this stall.");
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(traderBillRecordSchema.parse(bill));
  });
}
