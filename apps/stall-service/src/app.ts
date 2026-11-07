import {
  buildHealthResponse,
  hostAcceptTerminalRequestSchema,
  hostAcceptTerminalResponseSchema,
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
import type { SetupGrantRedeemer } from "./auth/setup-grant-redeem.js";
import { acceptTerminalPairing } from "./enrollment/accept-terminal.js";
import { buildAcceptTrustFields } from "./enrollment/host-trust.js";
import { registerConnectionRoutes } from "./http/connection-routes.js";
import { registerErrorHandler } from "./http/error-handler.js";
import { assertLoopbackOnly } from "./http/loopback-guard.js";
import { registerLocalStaffRoutes } from "./http/local-staff-routes.js";
import type { TlsMaterial } from "./security/tls-material.js";

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
  /** Injectable setup-grant redeemer (tests / alternate cloud). */
  setupGrantRedeemer?: SetupGrantRedeemer;
  enrollmentBaseUrl?: string;
  /**
   * When provided, Fastify listens with HTTPS using this material.
   * Tests that use inject() may omit this.
   */
  https?: TlsMaterial | false;
};

export type StallApp = ReturnType<typeof buildApp>;

/**
 * Production application construction.
 * Registers health, Phase 14 terminal accept, Phase 15 local staff auth,
 * and Phase 16 connection identity.
 */
export function buildApp(options: BuildAppOptions = {}) {
  const deps =
    options.dependencies ??
    createServiceDependencies({
      database: options.database,
      authorization: options.authorization,
      offlinePolicy: options.offlinePolicy,
      secureStorage: options.secureStorage,
      now: options.now,
      createId: options.createId,
      credentialRoot: options.credentialRoot,
      tlsMaterial: options.tlsMaterial,
    });

  const httpsOption =
    options.https === false
      ? undefined
      : options.https
        ? { key: options.https.keyPem, cert: options.https.certPem }
        : undefined;

  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    ...(httpsOption ? { https: httpsOption } : {}),
  });

  registerErrorHandler(app);

  app.get("/health", async (): Promise<HealthResponse> => {
    return buildHealthResponse();
  });

  registerConnectionRoutes(app, deps);

  /**
   * Narrow loopback pairing accept for phase 14/16.
   * Captures transport trust pins for the terminal. Rejects non-loopback clients.
   */
  app.post("/enrollment/terminals/accept", async (request, reply) => {
    assertLoopbackOnly(request, reply);
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
      const trust = buildAcceptTrustFields({
        database,
        secureStorage: deps.secureStorage,
        tlsMaterial: deps.tlsMaterial,
        credentialRoot: deps.credentialRoot,
        nowIso: deps.now(),
      });
      const response = hostAcceptTerminalResponseSchema.parse({
        ...result,
        ...trust,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terminal pairing failed.";
      return reply.code(409).send({
        code: "CONFLICT",
        message,
      });
    }
  });

  registerLocalStaffRoutes(app, deps, {
    setupGrantRedeemer: options.setupGrantRedeemer,
    enrollmentBaseUrl: options.enrollmentBaseUrl,
  });

  return Object.assign(app, {
    getLocalDatabase: (): LocalDatabase | undefined => deps.database,
    getDependencies: (): ServiceDependencies => deps,
  });
}
