import {
  localStaffSessionResponseSchema,
  localStaffSignInRequestSchema,
  localStaffSignInResponseSchema,
  localStaffSignOutRequestSchema,
  localStaffSignOutResponseSchema,
  localStaffSetupOwnerRequestSchema,
  localStaffSetupOwnerResponseSchema,
} from "@polivo/contracts";
import { getStallBinding } from "@polivo/db-local";
import type { FastifyInstance } from "fastify";

import { AppError } from "../errors/app-error.js";
import type { ServiceDependencies } from "../composition.js";
import {
  createHttpSetupGrantRedeemer,
  type SetupGrantRedeemer,
} from "../auth/setup-grant-redeem.js";
import { setupFirstLocalOwner } from "../auth/staff-admin.js";
import { lookupCurrentSession, signInLocalStaff, signOutLocalStaff } from "../auth/staff-login.js";
import { readDeviceProofFromHeaders, readSessionSecretFromHeaders } from "./auth-headers.js";
import { assertLoopbackOnly } from "./loopback-guard.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

export type RegisterLocalStaffRoutesOptions = {
  setupGrantRedeemer?: SetupGrantRedeemer;
  enrollmentBaseUrl?: string;
};

export function registerLocalStaffRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
  options: RegisterLocalStaffRoutesOptions = {},
): void {
  const redeemer =
    options.setupGrantRedeemer ??
    createHttpSetupGrantRedeemer({
      baseUrl:
        options.enrollmentBaseUrl ??
        process.env.POLIVO_ENROLLMENT_BASE_URL ??
        "http://localhost:3000",
    });

  app.post("/local-auth/sign-in", async (request, reply) => {
    const database = deps.database;
    if (!database) {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(localStaffSignInRequestSchema, request.body, "body");
    const result = signInLocalStaff(
      {
        database,
        secureStorage: deps.secureStorage,
        offlinePolicy: deps.offlinePolicy,
        now: deps.now,
        createId: deps.createId,
      },
      {
        staffCode: body.staffCode,
        secret: body.secret,
        deviceProof: body.deviceProof,
        method: "POST",
        path: "/local-auth/sign-in",
        requestId,
      },
    );
    if (result instanceof AppError) {
      throw result;
    }
    const response = localStaffSignInResponseSchema.parse(result);
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.get("/local-auth/session", async (request, reply) => {
    const database = deps.database;
    if (!database) {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }
    const requestId = resolveRequestId(request);
    const deviceProof = readDeviceProofFromHeaders(request);
    if (deviceProof instanceof AppError) {
      throw deviceProof;
    }
    const sessionSecret = readSessionSecretFromHeaders(request);
    if (typeof sessionSecret !== "string") {
      throw sessionSecret;
    }
    const result = lookupCurrentSession(
      {
        database,
        secureStorage: deps.secureStorage,
        offlinePolicy: deps.offlinePolicy,
        now: deps.now,
        createId: deps.createId,
      },
      {
        deviceProof,
        sessionSecret,
        method: "GET",
        path: "/local-auth/session",
      },
    );
    if (result instanceof AppError) {
      throw result;
    }
    const response = localStaffSessionResponseSchema.parse(result);
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.post("/local-auth/sign-out", async (request, reply) => {
    const database = deps.database;
    if (!database) {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(localStaffSignOutRequestSchema, request.body, "body");
    const sessionSecret = readSessionSecretFromHeaders(request);
    if (typeof sessionSecret !== "string") {
      throw sessionSecret;
    }
    const result = signOutLocalStaff(
      {
        database,
        secureStorage: deps.secureStorage,
        offlinePolicy: deps.offlinePolicy,
        now: deps.now,
        createId: deps.createId,
      },
      {
        deviceProof: body.deviceProof,
        sessionSecret,
        method: "POST",
        path: "/local-auth/sign-out",
        requestId,
      },
    );
    if (result instanceof AppError) {
      throw result;
    }
    const response = localStaffSignOutResponseSchema.parse(result);
    return reply.status(200).header("x-request-id", requestId).send(response);
  });

  app.post("/local-auth/setup-owner", async (request, reply) => {
    assertLoopbackOnly(request, reply);
    const database = deps.database;
    if (!database) {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(localStaffSetupOwnerRequestSchema, request.body, "body");
    const binding = getStallBinding(database);
    const proof = await redeemer.redeem({
      setupGrantSecret: body.setupGrantSecret,
      tenantId: binding.tenantId,
    });
    if (proof instanceof AppError) {
      throw proof;
    }
    const result = setupFirstLocalOwner(
      { database, now: deps.now, createId: deps.createId },
      {
        staffCode: body.staffCode,
        secret: body.secret,
        displayName: body.displayName,
        proof,
        requestId,
      },
    );
    if (result instanceof AppError) {
      throw result;
    }
    const response = localStaffSetupOwnerResponseSchema.parse(result);
    return reply.status(200).header("x-request-id", requestId).send(response);
  });
}
