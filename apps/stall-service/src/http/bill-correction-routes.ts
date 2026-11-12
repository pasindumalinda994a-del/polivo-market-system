import {
  billHistoryBillTypeSchema,
  billHistoryChainDetailSchema,
  idempotencyKeySchema,
  listBillHistoryQuerySchema,
  listBillHistoryResponseSchema,
  opaqueIdSchema,
  saleCorrectionCommitRequestSchema,
  saleCorrectionCommitResponseSchema,
  saleCorrectionEligibilityResponseSchema,
  saleCorrectionPreviewRequestSchema,
  saleCorrectionPreviewResponseSchema,
} from "@polivo/contracts";
import {
  getBillHistoryChainDetail,
  getIdempotencyRecord,
  listBillHistory,
  resolveSaleCorrectionEligibility,
} from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  BILLS_CREATE_CAPABILITY,
  BILLS_EDIT_DRAFT_CAPABILITY,
  BILLS_FINALIZE_CAPABILITY,
} from "../commands/sale-commands.js";
import {
  BILLS_CANCEL_FINALIZED_CAPABILITY,
  BILLS_CORRECT_FINALIZED_CAPABILITY,
  previewSaleCorrection,
  runCommitSaleCorrectionCommand,
} from "../commands/sale-correction-commands.js";
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

function parseIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  return parseWithSchema(
    idempotencyKeySchema,
    request.headers["idempotency-key"],
    "Idempotency-Key",
  );
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

function authorizeBillHistoryRead(
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
    auth.capabilities.has(BILLS_FINALIZE_CAPABILITY) ||
    auth.capabilities.has(BILLS_CORRECT_FINALIZED_CAPABILITY) ||
    auth.capabilities.has(BILLS_CANCEL_FINALIZED_CAPABILITY);
  if (!allowed) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Missing bill history read capability.",
    });
  }
  return auth;
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      o?: unknown;
    };
    if (typeof parsed.o === "number" && Number.isInteger(parsed.o) && parsed.o >= 0) {
      return parsed.o;
    }
  } catch {
    // fall through
  }
  throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid pagination cursor." });
}

export function registerBillCorrectionRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
): void {
  app.get("/bill-history", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeBillHistoryRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/bill-history",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(listBillHistoryQuerySchema, request.query, "query");
    const offset = decodeOffsetCursor(query.cursor);
    const result = listBillHistory(database, {
      stallId: binding.stallId,
      billType: query.billType,
      billNumber: query.billNumber,
      partyQuery: query.partyQuery,
      businessDateFrom: query.businessDateFrom,
      businessDateTo: query.businessDateTo,
      issueDateFrom: query.issueDateFrom,
      issueDateTo: query.issueDateTo,
      documentStatus: query.documentStatus,
      correctionPresence: query.correctionPresence,
      limit: query.limit,
      offset,
    });
    const nextOffset = offset + result.items.length;
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(
        listBillHistoryResponseSchema.parse({
          items: result.items,
          nextCursor: nextOffset < result.totalCount ? encodeOffsetCursor(nextOffset) : null,
          totalCount: result.totalCount,
        }),
      );
  });

  app.get("/bill-history/:billType/:billId", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const params = request.params as { billType: string; billId: string };
    const billType = parseWithSchema(billHistoryBillTypeSchema, params.billType, "billType");
    const billId = parseWithSchema(opaqueIdSchema, params.billId, "billId");
    authorizeBillHistoryRead(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/bill-history/${billType}/${billId}`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const detail = getBillHistoryChainDetail(database, {
      stallId: binding.stallId,
      billType,
      billId,
    });
    if (detail === null) {
      throw notFoundError("Bill was not found.");
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(
        billHistoryChainDetailSchema.parse({
          billType: detail.billType,
          billId: detail.billId,
          billNumber: detail.billNumber,
          saleId: detail.saleId,
          originalAmountMinor: detail.originalAmountMinor,
          businessDate: detail.businessDate,
          issuedAt: detail.issuedAt,
          documentStatus: detail.documentStatus,
          correctionStatus: detail.correctionStatus,
          paymentStatus: detail.paymentStatus,
          party: detail.party,
          sourceRevision: detail.sale?.revision ?? null,
          replacementSaleId: detail.replacementSaleId,
          replacementTraderBillId: detail.replacementTraderBillId,
          correctionOperationId: detail.correctionOperation?.id ?? null,
          reason: detail.correctionOperation?.reason ?? null,
          activity: detail.activity,
          ledgerPostingId: detail.sale?.postingId ?? detail.traderBill?.postingId ?? null,
          reversalPostingId:
            detail.sale?.reversalPostingId ?? detail.correctionOperation?.reversalPostingId ?? null,
          traderId: detail.sale?.traderId ?? detail.traderBill?.traderId ?? null,
          saleLines: detail.sale?.lines
            .filter(
              (line) =>
                line.farmerId !== null &&
                line.packageTypeId !== null &&
                line.vegetableId.length > 0,
            )
            .map((line) => ({
              lineId: line.id,
              farmerId: line.farmerId!,
              vegetableId: line.vegetableId,
              packageTypeId: line.packageTypeId!,
              unitPricePerKgMinor: line.unitPricePerKgMinor,
              packagingWeightHundredths: line.packagingWeightHundredths,
              notes: line.notes,
              weights: line.weights.map((weight) => ({
                rowKey: weight.rowKey,
                packageTypeId: weight.packageTypeId ?? undefined,
                grossWeightHundredths: weight.grossWeightHundredths,
              })),
            })),
        }),
      );
  });

  app.get("/sales/:saleId/correction-eligibility", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const saleId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { saleId: string }).saleId,
      "saleId",
    );
    authorizeCapability(deps, BILLS_CORRECT_FINALIZED_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/sales/${saleId}/correction-eligibility`,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const eligibility = resolveSaleCorrectionEligibility(database, {
      stallId: binding.stallId,
      saleId,
    });
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(
        saleCorrectionEligibilityResponseSchema.parse({
          code: eligibility.code,
          allowed: eligibility.allowed,
          message: eligibility.message,
          saleId: eligibility.sale?.id ?? null,
          sourceRevision: eligibility.sale?.revision ?? null,
          traderBillId: eligibility.traderBillId,
          farmerBillInclusions: eligibility.farmerBillInclusions,
          allocationCount: eligibility.allocations.length,
        }),
      );
  });

  app.post("/sales/corrections/preview", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const body = parseWithSchema(saleCorrectionPreviewRequestSchema, request.body, "body");
    const capability =
      body.action === "reverse"
        ? BILLS_CANCEL_FINALIZED_CAPABILITY
        : BILLS_CORRECT_FINALIZED_CAPABILITY;
    authorizeCapability(deps, capability, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/sales/corrections/preview",
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const commandDeps = requireCommandDeps(deps);
    const preview = previewSaleCorrection(
      commandDeps,
      {
        tenantId: binding.tenantId,
        stallId: binding.stallId,
        actorRef: "preview",
        deviceRef: "preview",
        capability,
        requestId,
      },
      body,
    );
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(saleCorrectionPreviewResponseSchema.parse(preview));
  });

  app.post("/sales/corrections", async (request, reply) => {
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const body = parseWithSchema(saleCorrectionCommitRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const commandDeps = requireCommandDeps(deps);
    const result = runCommitSaleCorrectionCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/sales/corrections",
    });
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(saleCorrectionCommitResponseSchema.parse(result));
  });

  app.get("/sales/corrections/:idempotencyKey", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const key = parseWithSchema(
      idempotencyKeySchema,
      (request.params as { idempotencyKey: string }).idempotencyKey,
      "idempotencyKey",
    );
    const authProbe = deps.authorization.authorize({
      requiredCapability: BILLS_CORRECT_FINALIZED_CAPABILITY,
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/sales/corrections/${key}`,
      touchActivity: false,
    });
    if (authProbe instanceof AppError) {
      throw authProbe;
    }
    if (
      !authProbe.capabilities.has(BILLS_CORRECT_FINALIZED_CAPABILITY) &&
      !authProbe.capabilities.has(BILLS_CANCEL_FINALIZED_CAPABILITY)
    ) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Missing correction outcome lookup capability.",
      });
    }
    const auth = authProbe;
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const scope = buildIdempotencyScope({
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      commandType: "sale.correct_or_reverse",
      actorRef: auth.actorRef,
      deviceRef: auth.deviceRef,
    });
    const record = getIdempotencyRecord(database, scope, key);
    if (record === null || record.resultRef === null) {
      throw notFoundError("Correction operation outcome was not found.");
    }
    return reply
      .status(200)
      .header("x-request-id", requestId)
      .send(saleCorrectionCommitResponseSchema.parse(JSON.parse(record.resultRef)));
  });
}
