import {
  buildHealthResponse,
  hostAcceptTerminalRequestSchema,
  type HealthResponse,
} from "@polivo/contracts";
import type { LocalDatabase } from "@polivo/db-local";
import Fastify from "fastify";

import {
  createServiceDependencies,
  REQUEST_BODY_LIMIT_BYTES,
  type BuildDependenciesOptions,
  type ServiceDependencies,
} from "./composition.js";
import { acceptTerminalPairing } from "./enrollment/accept-terminal.js";
import { registerErrorHandler } from "./http/error-handler.js";

export type BuildAppOptions = BuildDependenciesOptions & {
  /**
   * Optional local database handle injected by the process entrypoint.
   * Application construction remains testable without opening a production database.
   */
  database?: LocalDatabase;
  /** Override full dependency set (used by test composition). */
  dependencies?: ServiceDependencies;
  /** Disable Fastify logger in tests when desired. */
  logger?: boolean;
};

export type StallApp = ReturnType<typeof buildApp>;

/**
 * Production application construction.
 * Registers only the public health endpoint. Business mutation routes stay unregistered
 * until authentication (phases 14–15) and feature phases are ready.
 */
export function buildApp(options: BuildAppOptions = {}) {
  const deps =
    options.dependencies ??
    createServiceDependencies({
      database: options.database,
      authorization: options.authorization,
      now: options.now,
      createId: options.createId,
    });

  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
  });

  registerErrorHandler(app);

  app.get("/health", async (): Promise<HealthResponse> => {
    return buildHealthResponse();
  });

  /**
   * Narrow loopback pairing accept for phase 14.
   * Full LAN auth belongs to phase 16; this only records verified terminal identities.
   */
  app.post("/enrollment/terminals/accept", async (request, reply) => {
    const database = deps.database;
    if (!database) {
      return reply.code(503).send({
        code: "SERVICE_UNAVAILABLE",
        message: "Local database is not available.",
      });
    }

    const parsed = hostAcceptTerminalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "Invalid terminal pairing request.",
      });
    }

    try {
      const result = acceptTerminalPairing(database, parsed.data, deps.now());
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terminal pairing failed.";
      return reply.code(409).send({
        code: "CONFLICT",
        message,
      });
    }
  });

  return Object.assign(app, {
    getLocalDatabase: (): LocalDatabase | undefined => deps.database,
    getDependencies: (): ServiceDependencies => deps,
  });
}
