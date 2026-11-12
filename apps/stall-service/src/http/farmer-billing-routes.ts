import {
  farmerBillPreviewRequestSchema,
  farmerBillPreviewResponseSchema,
  farmerBillRecordSchema,
  idempotencyKeySchema,
  issueFarmerBillRequestSchema,
  issueFarmerBillResponseSchema,
  listFarmerBillsQuerySchema,
  listFarmerBillsResponseSchema,
  listFarmerSalesQuerySchema,
  listFarmerSalesResponseSchema,
  opaqueIdSchema,
} from "@polivo/contracts";
import {
  getIdempotencyRecord,
  listFarmerSaleLines,
  listFinalizedFarmerBills,
  summarizeFarmerSales,
} from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  buildFarmerBillPreview,
  loadFinalizedFarmerBillDto,
  runIssueFarmerBillCommand,
} from "../commands/farmer-bill-commands.js";
import {
  BILLS_CREATE_CAPABILITY,
  BILLS_EDIT_DRAFT_CAPABILITY,
  BILLS_FINALIZE_CAPABILITY,
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

/**
 * Farmer sales queries, preview, issuance, and farmer-bill reads.
 * Reuses bills.create|edit_draft|finalize for reads and bills.finalize for issue/preview.
 */
export function registerFarmerBillingRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/farmer-sales", async (request, reply) => {
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
      path: "/farmer-sales",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(listFarmerSalesQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const filter = {
      stallId: binding.stallId,
      farmerId: query.farmerId,
      businessDateFrom: query.businessDateFrom,
      businessDateTo: query.businessDateTo,
      vegetableId: query.vegetableId,
      traderId: query.traderId,
      inclusionStatus: query.inclusionStatus,
    };
    const summary = summarizeFarmerSales(database, filter);
    const listed = listFarmerSaleLines(database, {
      ...filter,
      limit: query.limit,
      offset,
    });
    const nextOffset = offset + listed.items.length;
    const body = listFarmerSalesResponseSchema.parse({
      summary,
      items: listed.items.map((item) => ({
        saleLineId: item.saleLineId,
        saleId: item.saleId,
        traderBillId: item.traderBillId,
        traderBillNumber: item.traderBillNumber,
        traderId: item.traderId,
        traderDisplayName: item.traderDisplayName,
        businessDate: item.businessDate,
        vegetableId: item.vegetableId,
        vegetableCode: item.vegetableCode,
        vegetableDisplayName: item.vegetableDisplayName,
        packageCount: item.packageCount,
        netWeightHundredths: item.netWeightHundredths,
        unitPricePerKgMinor: item.unitPricePerKgMinor,
        saleAmountMinor: item.saleAmountMinor,
        commissionAmountMinor: item.commissionAmountMinor,
        farmerReceivesMinor: item.farmerReceivesMinor,
        inclusionStatus: item.inclusionStatus,
        farmerBillId: item.farmerBillId,
        farmerBillNumber: item.farmerBillNumber,
      })),
      nextCursor: nextOffset < listed.totalCount ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(body);
  });

  app.post("/farmer-bills/preview", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCapability(deps, BILLS_FINALIZE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/farmer-bills/preview",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const body = parseWithSchema(farmerBillPreviewRequestSchema, request.body, "body");
    const preview = buildFarmerBillPreview(
      database,
      binding.stallId,
      body,
      new Date().toISOString(),
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(farmerBillPreviewResponseSchema.parse(preview));
  });

  app.post("/farmer-bills/issue", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const body = parseWithSchema(issueFarmerBillRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runIssueFarmerBillCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/farmer-bills/issue",
    });
    return reply
      .status(201)
      .header("x-request-id", requestId)
      .send(issueFarmerBillResponseSchema.parse(result));
  });

  app.get("/farmer-bills/issuances/:idempotencyKey", async (request, reply) => {
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
      path: `/farmer-bills/issuances/${key}`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const scope = buildIdempotencyScope({
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      commandType: "farmer_bill.issue",
      actorRef: auth.actorRef,
      deviceRef: auth.deviceRef,
    });
    const record = getIdempotencyRecord(database, scope, key);
    if (record === null || record.resultRef === null) {
      throw notFoundError("Farmer bill issuance result was not found.");
    }
    const result = issueFarmerBillResponseSchema.parse(JSON.parse(record.resultRef));
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.get("/farmer-bills", async (request, reply) => {
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
      path: "/farmer-bills",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(listFarmerBillsQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const listed = listFinalizedFarmerBills(database, {
      stallId: binding.stallId,
      limit: query.limit,
      offset,
      farmerId: query.farmerId,
      billNumber: query.billNumber,
      businessDateFrom: query.businessDateFrom,
      businessDateTo: query.businessDateTo,
    });
    const nextOffset = offset + listed.items.length;
    const body = listFarmerBillsResponseSchema.parse({
      items: listed.items,
      nextCursor: nextOffset < listed.totalCount ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(body);
  });

  app.get("/farmer-bills/:id", async (request, reply) => {
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
      path: "/farmer-bills/:id",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const billId = parseWithSchema(opaqueIdSchema, (request.params as { id?: string }).id, "id");
    const bill = loadFinalizedFarmerBillDto(database, binding.stallId, billId);
    if (bill === null) {
      throw notFoundError("Farmer bill not found.");
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(farmerBillRecordSchema.parse(bill));
  });
}
