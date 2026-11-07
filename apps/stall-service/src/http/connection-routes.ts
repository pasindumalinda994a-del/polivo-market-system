import { hostIdentityResponseSchema } from "@polivo/contracts";
import type { FastifyInstance } from "fastify";

import type { ServiceDependencies } from "../composition.js";
import { buildSignedHostIdentity } from "../enrollment/host-trust.js";
import { AppError } from "../errors/app-error.js";
import { resolveRequestId } from "./request-id.js";

export function registerConnectionRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/connection/identity", async (request, reply) => {
    const database = deps.database;
    if (!database) {
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }
    const requestId = resolveRequestId(request);
    try {
      const identity = buildSignedHostIdentity({
        database,
        secureStorage: deps.secureStorage,
        tlsMaterial: deps.tlsMaterial,
        credentialRoot: deps.credentialRoot,
        nowIso: deps.now(),
      });
      const response = hostIdentityResponseSchema.parse(identity);
      return reply.status(200).header("x-request-id", requestId).send(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Host identity is unavailable.";
      throw new AppError({
        code: "SERVICE_UNAVAILABLE",
        message,
      });
    }
  });
}
