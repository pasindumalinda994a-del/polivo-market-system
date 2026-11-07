import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LocalDatabase } from "@polivo/db-local";

import { buildApp, type StallApp } from "../app.js";
import type { SetupGrantRedeemer } from "../auth/setup-grant-redeem.js";
import { createServiceDependencies, type BuildDependenciesOptions } from "../composition.js";
import { createMemorySecureStorage } from "../security/secure-storage.js";
import { loadOrCreateTlsMaterial } from "../security/tls-material.js";
import { createTestAuthorizationAdapter } from "./test-auth.js";
import { registerFixtureRoutes } from "./fixture-routes.js";
import { registerStaffAuthFixtureRoutes } from "./staff-auth-fixture.js";

export type BuildTestAppOptions = BuildDependenciesOptions & {
  database: LocalDatabase;
  /** When null, authorization fails closed as unauthenticated. */
  authorize?: boolean;
  logger?: boolean;
  setupGrantRedeemer?: SetupGrantRedeemer;
  /**
   * When true (default), keep the legacy test authorization adapter unless
   * `authorization` / real local-staff adapter options are provided.
   */
  useLegacyTestAuth?: boolean;
};

/**
 * Test-only application composition. Registers fixture mutation routes.
 * Production `buildApp` / `server.ts` must not import this module.
 */
export function buildTestApp(options: BuildTestAppOptions): StallApp {
  const useLegacy = options.useLegacyTestAuth !== false && options.authorization === undefined;
  const authorization = useLegacy
    ? createTestAuthorizationAdapter({
        principal: options.authorize === false ? null : undefined,
      })
    : options.authorization;

  const credentialRoot =
    options.credentialRoot ?? mkdtempSync(join(tmpdir(), "polivo-test-creds-"));
  const tlsMaterial = options.tlsMaterial ?? loadOrCreateTlsMaterial(credentialRoot);

  const dependencies = createServiceDependencies({
    database: options.database,
    authorization,
    offlinePolicy: options.offlinePolicy,
    secureStorage: options.secureStorage ?? createMemorySecureStorage(),
    now: options.now,
    createId: options.createId,
    credentialRoot,
    tlsMaterial,
  });

  const app = buildApp({
    dependencies,
    logger: options.logger ?? false,
    setupGrantRedeemer: options.setupGrantRedeemer,
    https: false,
  });

  registerFixtureRoutes(app, dependencies);
  registerStaffAuthFixtureRoutes(app, dependencies);
  return app;
}
