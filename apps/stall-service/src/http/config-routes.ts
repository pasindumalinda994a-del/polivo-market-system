import { configWorkerRefreshResponseSchema } from "@polivo/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AuthorizedPrincipal } from "../auth/authorization.js";
import type { ServiceDependencies } from "../composition.js";
import type { ConfigWorkerHandle } from "../config-sync/worker.js";
import {
  AppError,
  forbiddenError,
  serviceUnavailableError,
} from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";

const SYNC_VIEW_CAPABILITY = "sync.view";
const SYNC_RETRY_CAPABILITY = "sync.retry";

type AuthArgs = {
  requestId: string;
  deviceProof: import("../auth/device-proof.js").DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
};

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

export function registerConfigRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
  configWorker: ConfigWorkerHandle | null,
): void {
  app.get("/config/status", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!configWorker) {
      throw serviceUnavailableError("Configuration worker is not available.");
    }
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    if (!authMaterial.sessionSecret) {
      throw forbiddenError("Staff session is required.");
    }
    authorizeCapability(deps, SYNC_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "GET",
      path: "/config/status",
    });
    reply.header("x-request-id", requestId);
    return configWorker.getStatus();
  });

  app.post("/config/refresh", async (request, reply) => {
    if (!deps.database) {
      throw serviceUnavailableError("Local database is not available.");
    }
    if (!configWorker) {
      throw serviceUnavailableError("Configuration worker is not available.");
    }
    const requestId = resolveRequestId(request);
    const authMaterial = readAuth(request);
    if (!authMaterial.sessionSecret) {
      throw forbiddenError("Staff session is required.");
    }
    authorizeCapability(deps, SYNC_RETRY_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/config/refresh",
    });
    const refresh = configWorker.requestManualRefresh();
    const status = configWorker.getStatus();
    reply.header("x-request-id", requestId);
    return configWorkerRefreshResponseSchema.parse({
      accepted: refresh.accepted,
      status,
      message: refresh.message,
    });
  });
}
