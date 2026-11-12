import {
  changePackageTypeStatusRequestSchema,
  createPackageTypeRequestSchema,
  idempotencyKeySchema,
  listPackageTypesQuerySchema,
  listPackageTypesResponseSchema,
  opaqueIdSchema,
  updatePackageTypeRequestSchema,
} from "@polivo/contracts";
import { getPackageTypeById, searchPackageTypes } from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import {
  runChangePackageTypeStatusCommand,
  runCreatePackageTypeCommand,
  runUpdatePackageTypeCommand,
  toPackageTypeDto,
} from "../commands/package-type-commands.js";
import { CATALOG_MANAGE_CAPABILITY } from "../commands/vegetable-commands.js";
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

function authorizeCatalogAccess(
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
    requiredCapability: CATALOG_MANAGE_CAPABILITY,
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
  if (!auth.capabilities.has(CATALOG_MANAGE_CAPABILITY)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${CATALOG_MANAGE_CAPABILITY}`,
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
 * Production package-type catalog routes.
 * Every operation requires device proof, staff session, and catalog.manage.
 */
export function registerPackageTypeRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/package-types", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCatalogAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/package-types",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const query = parseWithSchema(listPackageTypesQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const result = searchPackageTypes(database, {
      stallId: binding.stallId,
      query: query.q,
      active: query.active,
      limit: query.limit,
      offset,
    });

    const nextOffset = offset + result.items.length;
    const response = listPackageTypesResponseSchema.parse({
      items: result.items.map(toPackageTypeDto),
      nextCursor: nextOffset < result.totalMatched ? String(nextOffset) : null,
    });
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/package-types/:id", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCatalogAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: `/package-types/${String((request.params as { id: string }).id)}`,
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const packageTypeId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "package type id",
    );
    const packageType = getPackageTypeById(database, binding.stallId, packageTypeId);
    if (packageType === null) {
      throw notFoundError("Package type not found for this stall.");
    }
    return reply.status(200).header("x-request-id", requestId).send(toPackageTypeDto(packageType));
  });

  app.post("/package-types", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(createPackageTypeRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const result = runCreatePackageTypeCommand(requireCommandDeps(deps), body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/package-types",
    });
    return reply.status(201).header("x-request-id", requestId).send(result);
  });

  app.patch("/package-types/:id", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const packageTypeId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "package type id",
    );
    const body = parseWithSchema(updatePackageTypeRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/package-types/${packageTypeId}`;
    const result = runUpdatePackageTypeCommand(
      requireCommandDeps(deps),
      { packageTypeId, ...body },
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

  app.patch("/package-types/:id/status", async (request, reply) => {
    requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const packageTypeId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { id: string }).id,
      "package type id",
    );
    const body = parseWithSchema(changePackageTypeStatusRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const path = `/package-types/${packageTypeId}/status`;
    const result = runChangePackageTypeStatusCommand(
      requireCommandDeps(deps),
      { packageTypeId, ...body },
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
