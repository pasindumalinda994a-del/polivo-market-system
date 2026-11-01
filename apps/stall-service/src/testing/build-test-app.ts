import type { LocalDatabase } from "@polivo/db-local";

import { buildApp, type StallApp } from "../app.js";
import { createServiceDependencies, type BuildDependenciesOptions } from "../composition.js";
import { createTestAuthorizationAdapter } from "./test-auth.js";
import { registerFixtureRoutes } from "./fixture-routes.js";

export type BuildTestAppOptions = BuildDependenciesOptions & {
  database: LocalDatabase;
  /** When null, authorization fails closed as unauthenticated. */
  authorize?: boolean;
  logger?: boolean;
};

/**
 * Test-only application composition. Registers fixture mutation routes.
 * Production `buildApp` / `server.ts` must not import this module.
 */
export function buildTestApp(options: BuildTestAppOptions): StallApp {
  const authorization =
    options.authorization ??
    createTestAuthorizationAdapter({
      principal: options.authorize === false ? null : undefined,
    });

  const dependencies = createServiceDependencies({
    database: options.database,
    authorization,
    now: options.now,
    createId: options.createId,
  });

  const app = buildApp({
    dependencies,
    logger: options.logger ?? false,
  });

  registerFixtureRoutes(app, dependencies);
  return app;
}
