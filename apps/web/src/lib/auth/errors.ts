import {
  ERROR_CODE_HTTP_STATUS,
  apiErrorSchema,
  type ApiError,
  type ErrorCode,
} from "@polivo/contracts";

export class WebAuthError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "WebAuthError";
    this.code = code;
    this.httpStatus = ERROR_CODE_HTTP_STATUS[code];
  }
}

export function unauthenticatedError(message = "Authentication required."): WebAuthError {
  return new WebAuthError("UNAUTHENTICATED", message);
}

export function forbiddenError(message = "Access denied."): WebAuthError {
  return new WebAuthError("FORBIDDEN", message);
}

export function serviceUnavailableError(
  message = "Authentication or data service is temporarily unavailable.",
): WebAuthError {
  return new WebAuthError("SERVICE_UNAVAILABLE", message);
}

export function validationError(message = "Request validation failed."): WebAuthError {
  return new WebAuthError("VALIDATION_ERROR", message);
}

export function conflictError(
  message = "The request conflicts with the current state.",
): WebAuthError {
  return new WebAuthError("CONFLICT", message);
}

export function notFoundError(message = "Resource not found."): WebAuthError {
  return new WebAuthError("NOT_FOUND", message);
}

/** Safe public API error body. Never includes tokens, SQL, or environment values. */
export function toPublicApiError(error: unknown, requestId?: string): ApiError {
  if (error instanceof WebAuthError) {
    return apiErrorSchema.parse({
      code: error.code,
      message: error.message,
      ...(requestId ? { requestId } : {}),
    });
  }

  return apiErrorSchema.parse({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    ...(requestId ? { requestId } : {}),
  });
}

export function httpStatusForError(error: unknown): number {
  if (error instanceof WebAuthError) {
    return error.httpStatus;
  }
  return ERROR_CODE_HTTP_STATUS.INTERNAL_ERROR;
}

/** Redacts sensitive fields before server logging. */
export function redactForLog(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > 64 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
      return "[redacted-token]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactForLog);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization|cookie/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactForLog(nested);
      }
    }
    return out;
  }
  return value;
}
