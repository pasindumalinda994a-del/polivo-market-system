import { idempotencyKeySchema } from "@polivo/contracts";
import type { FastifyInstance } from "fastify";

import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
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

    const commandDeps = requireCommandDeps(deps);
    const result = runFixtureBumpBillCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
    });
    return reply.status(200).header("x-request-id", requestId).send(result);
  });
}
