import { buildHealthResponse, type HealthResponse } from "@polivo/contracts";
import type { LocalDatabase } from "@polivo/db-local";
import Fastify from "fastify";

import {
  createServiceDependencies,
  REQUEST_BODY_LIMIT_BYTES,
  type BuildDependenciesOptions,
  type ServiceDependencies,
} from "./composition.js";
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

  return Object.assign(app, {
    getLocalDatabase: (): LocalDatabase | undefined => deps.database,
    getDependencies: (): ServiceDependencies => deps,
  });
}
