import { apiErrorSchema } from "@polivo/contracts";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { AppError, internalError, toApiError, validationError } from "../errors/app-error.js";
import { resolveRequestId } from "./request-id.js";

const SENSITIVE_KEY = /(password|secret|token|authorization|credential)/i;

export function redactForLogs(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactForLogs);
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactForLogs(nested);
  }
  return out;
}

function sendApiError(reply: FastifyReply, error: AppError, requestId: string): void {
  const body = apiErrorSchema.parse(toApiError(error, requestId));
  void reply.status(error.httpStatus).header("x-request-id", requestId).send(body);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = resolveRequestId(request);

      if (error instanceof AppError) {
        if (!error.exposeMessage || error.code === "INTERNAL_ERROR") {
          request.log.error({ err: error, requestId }, "application error");
        } else {
          request.log.info({ code: error.code, requestId }, "handled application error");
        }
        sendApiError(reply, error, requestId);
        return;
      }

      const fastifyError = error as FastifyError;
      if (fastifyError.validation !== undefined) {
        const appError = validationError("Request validation failed.", [
          {
            path: "",
            code: "invalid_request",
            message: fastifyError.message,
          },
        ]);
        sendApiError(reply, appError, requestId);
        return;
      }

      const status = fastifyError.statusCode;
      if (status !== undefined && status >= 400 && status < 500) {
        const message = status === 413 ? "Request body is too large." : "Malformed request.";
        sendApiError(
          reply,
          new AppError({ code: "VALIDATION_ERROR", message, httpStatus: status }),
          requestId,
        );
        return;
      }

      request.log.error(
        { err: error, requestId, body: redactForLogs(request.body) },
        "unhandled error",
      );
      sendApiError(reply, internalError(), requestId);
    },
  );

  app.setNotFoundHandler((request, reply) => {
    const requestId = resolveRequestId(request);
    const notFound = new AppError({ code: "NOT_FOUND", message: "Route not found." });
    const body = apiErrorSchema.parse(toApiError(notFound, requestId));
    void reply.status(404).header("x-request-id", requestId).send(body);
  });
}
