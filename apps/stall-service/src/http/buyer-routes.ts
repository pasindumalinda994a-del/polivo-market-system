import {
  changeBuyerStatusRequestSchema,
  createBuyerRequestSchema,
  idempotencyKeySchema,
  listBuyersQuerySchema,
  listBuyersResponseSchema,
  opaqueIdSchema,
  updateBuyerRequestSchema,
} from "@polivo/contracts";
import { getBuyerById, searchBuyers } from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  BUYER_MANAGE_CAPABILITY,
  runChangeBuyerStatusCommand,
  runCreateBuyerCommand,
  runUpdateBuyerCommand,
  toBuyerDto,
} from "../commands/buyer-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { resolveBoundStall } from "../context/execution-context.js";
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

function authorizeBuyerAccess(
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
    requiredCapability: BUYER_MANAGE_CAPABILITY,
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
  if (!auth.capabilities.has(BUYER_MANAGE_CAPABILITY)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${BUYER_MANAGE_CAPABILITY}`,
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
 * Production buyer management routes. Records persist on the traders table.
 * Every operation requires device proof, staff session, and parties.register_edit.
 * A farmer id is not a buyer id.
 */
export function registerBuyerRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/buyers", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeBuyerAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/buyers",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const query = parseWithSchema(listBuyersQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const result = searchBuyers(database, {
      stallId: binding.stallId,
      query: query.q,
      active: query.active,
      limit: query.limit,
      offset,
    });

    const nextOffset = offset + result.items.length;
    const response = listBuyersResponseSchema.parse({
      items: result.items.map(toBuyerDto),
      nextCursor: nextOffset < result.totalMatched ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/buyers/:id", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeBuyerAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/buyers/${String((request.params as { id: string }).id)}`,
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const buyerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "buyer id",
    );
    const buyer = getBuyerById(database, binding.stallId, buyerId);
    if (buyer === null) {
      throw notFoundError("Buyer not found for this stall.");
    }
    return reply.status(200).header("x-request-id", requestId).send(toBuyerDto(buyer));
  });

  app.post("/buyers", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(createBuyerRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const result = runCreateBuyerCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/buyers",
    });
    return reply.status(201).header("x-request-id", requestId).send(result);
  });

  app.patch("/buyers/:id", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const buyerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "buyer id",
    );
    const body = parseWithSchema(updateBuyerRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/buyers/${buyerId}`;
    const result = runUpdateBuyerCommand(
      requireCommandDeps(deps),
      { buyerId, ...body },
      {
        requestId,
        idempotencyKey,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret,
        method: "PATCH",
        path,
      },
    );
    return reply.status(200).header("x-request-id", requestId).send(result);
  });

  app.patch("/buyers/:id/status", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const buyerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "buyer id",
    );
    const body = parseWithSchema(changeBuyerStatusRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/buyers/${buyerId}/status`;
    const result = runChangeBuyerStatusCommand(
      requireCommandDeps(deps),
      { buyerId, ...body },
      {
        requestId,
        idempotencyKey,
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret,
        method: "PATCH",
        path,
      },
    );
    return reply.status(200).header("x-request-id", requestId).send(result);
  });
}
