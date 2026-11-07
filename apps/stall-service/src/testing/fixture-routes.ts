import { idempotencyKeySchema } from "@polivo/contracts";
import type { FastifyInstance } from "fastify";

import { AppError } from "../errors/app-error.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { readRequestAuthMaterial } from "../http/auth-headers.js";
import { resolveRequestId } from "../http/request-id.js";
import { parseWithSchema } from "../http/validation.js";
import { fixtureBumpBillInputSchema, runFixtureBumpBillCommand } from "./fixture-commands.js";

export const FIXTURE_BUMP_BILL_PATH = "/__test__/fixture/bump-trader-bill";

/**
 * Registers fixture routes used only by test application composition.
 * Must not be imported by production server startup.
 */
export function registerFixtureRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.post(FIXTURE_BUMP_BILL_PATH, async (request, reply) => {
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(fixtureBumpBillInputSchema, request.body, "body");
    const idempotencyHeader = request.headers["idempotency-key"];
    const idempotencyRaw = Array.isArray(idempotencyHeader)
      ? idempotencyHeader[0]
      : idempotencyHeader;
    const idempotencyKey = parseWithSchema(
      idempotencyKeySchema,
      idempotencyRaw,
      "idempotency-key header",
    );

    const authMaterial = readRequestAuthMaterial(request, { requireSession: false });
    // Test adapter may still authorize without device/session; pass through when present.
    const deviceProof = authMaterial instanceof AppError ? undefined : authMaterial.deviceProof;
    const sessionSecret = authMaterial instanceof AppError ? undefined : authMaterial.sessionSecret;

    // Prefer full auth material when session header is present.
    let session: string | undefined = sessionSecret;
    if (!(authMaterial instanceof AppError) && request.headers["x-polivo-session"]) {
      const withSession = readRequestAuthMaterial(request, { requireSession: true });
      if (withSession instanceof AppError) {
        throw withSession;
      }
      session = withSession.sessionSecret;
    }

    const commandDeps = requireCommandDeps(deps);
    const result = runFixtureBumpBillCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
      deviceProof,
      sessionSecret: session,
      method: "POST",
      path: FIXTURE_BUMP_BILL_PATH,
    });
    return reply.status(200).header("x-request-id", requestId).send(result);
  });
}
