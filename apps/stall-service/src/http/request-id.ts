import { randomUUID } from "node:crypto";

import { requestIdSchema } from "@polivo/contracts";
import type { FastifyRequest } from "fastify";

export const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(request: FastifyRequest): string {
  const header = request.headers[REQUEST_ID_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === "string") {
    const parsed = requestIdSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return randomUUID();
}
