import type { FastifyInstance } from "fastify";

import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { runIdempotentCommand, type CommandDefinition } from "../commands/command-runner.js";
import { AppError } from "../errors/app-error.js";
import { readRequestAuthMaterial } from "../http/auth-headers.js";
import { resolveRequestId } from "../http/request-id.js";
import { parseWithSchema } from "../http/validation.js";
import { idempotencyKeySchema } from "@polivo/contracts";
import { z } from "zod";

export const STAFF_PROBE_PATH = "/__test__/fixture/staff-probe";
export const STAFF_PROBE_CAPABILITY = "bills.create";

const probeInputSchema = z.strictObject({
  note: z.string().min(1).max(64),
});

/**
 * Test-only protected probe that requires a real catalog capability (`bills.create`).
 * Used to exercise Phase 15 local staff authorization without billing product APIs.
 */
export function registerStaffAuthFixtureRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
): void {
  app.post(STAFF_PROBE_PATH, async (request, reply) => {
    const requestId = resolveRequestId(request);
    const body = parseWithSchema(probeInputSchema, request.body, "body");
    const idempotencyHeader = request.headers["idempotency-key"];
    const idempotencyRaw = Array.isArray(idempotencyHeader)
      ? idempotencyHeader[0]
      : idempotencyHeader;
    const idempotencyKey = parseWithSchema(
      idempotencyKeySchema,
      idempotencyRaw,
      "idempotency-key header",
    );
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const definition: CommandDefinition<{ note: string }, { note: string; ok: true }> = {
      type: "test.fixture.staff_probe",
      version: "1",
      requiredCapability: STAFF_PROBE_CAPABILITY,
      scopeToPrincipal: true,
      execute: ({ input }) => ({ note: input.note, ok: true as const }),
      serializeResult: (result) => JSON.stringify(result),
      deserializeResult: (ref) => JSON.parse(ref) as { note: string; ok: true },
    };

    const result = runIdempotentCommand(requireCommandDeps(deps), definition, {
      input: body,
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: STAFF_PROBE_PATH,
    });
    return reply.status(200).header("x-request-id", requestId).send(result);
  });
}
