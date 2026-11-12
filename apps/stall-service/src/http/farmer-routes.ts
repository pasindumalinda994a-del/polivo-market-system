import {
  changeFarmerStatusRequestSchema,
  createFarmerRequestSchema,
  idempotencyKeySchema,
  listFarmersQuerySchema,
  listFarmersResponseSchema,
  opaqueIdSchema,
  updateFarmerRequestSchema,
} from "@polivo/contracts";
import { getFarmerById, searchFarmers } from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  FARMER_MANAGE_CAPABILITY,
  runChangeFarmerStatusCommand,
  runCreateFarmerCommand,
  runUpdateFarmerCommand,
  toFarmerDto,
} from "../commands/farmer-commands.js";
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

function authorizeFarmerAccess(
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
    requiredCapability: FARMER_MANAGE_CAPABILITY,
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
  if (!auth.capabilities.has(FARMER_MANAGE_CAPABILITY)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${FARMER_MANAGE_CAPABILITY}`,
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
 * Production farmer management routes. Every operation requires device proof,
 * staff session, and parties.register_edit.
 */
export function registerFarmerRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/farmers", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeFarmerAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/farmers",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const query = parseWithSchema(listFarmersQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const result = searchFarmers(database, {
      stallId: binding.stallId,
      query: query.q,
      active: query.active,
      limit: query.limit,
      offset,
    });

    const nextOffset = offset + result.items.length;
    const response = listFarmersResponseSchema.parse({
      items: result.items.map(toFarmerDto),
      nextCursor: nextOffset < result.totalMatched ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/farmers/:id", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeFarmerAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/farmers/${String((request.params as { id: string }).id)}`,
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const farmerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "farmer id",
    );
    const farmer = getFarmerById(database, binding.stallId, farmerId);
    if (farmer === null) {
      throw notFoundError("Farmer not found for this stall.");
    }
    return reply.status(200).header("x-request-id", requestId).send(toFarmerDto(farmer));
  });

  app.post("/farmers", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(createFarmerRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const result = runCreateFarmerCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/farmers",
    });
    return reply.status(201).header("x-request-id", requestId).send(result);
  });

  app.patch("/farmers/:id", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const farmerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "farmer id",
    );
    const body = parseWithSchema(updateFarmerRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/farmers/${farmerId}`;
    const result = runUpdateFarmerCommand(
      requireCommandDeps(deps),
      { farmerId, ...body },
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

  app.patch("/farmers/:id/status", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const farmerId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "farmer id",
    );
    const body = parseWithSchema(changeFarmerStatusRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/farmers/${farmerId}/status`;
    const result = runChangeFarmerStatusCommand(
      requireCommandDeps(deps),
      { farmerId, ...body },
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
