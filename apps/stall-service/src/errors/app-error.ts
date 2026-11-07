import {
  ERROR_CODE_HTTP_STATUS,
  type ApiError,
  type ErrorCode,
  type ValidationIssue,
} from "@polivo/contracts";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly issues?: ValidationIssue[];
  readonly exposeMessage: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    httpStatus?: number;
    issues?: ValidationIssue[];
    /** When false, public responses use a generic message. */
    exposeMessage?: boolean;
    cause?: unknown;
  }) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? ERROR_CODE_HTTP_STATUS[options.code];
    this.issues = options.issues;
    this.exposeMessage = options.exposeMessage ?? options.code !== "INTERNAL_ERROR";
  }
}

export function toApiError(error: AppError, requestId: string | undefined): ApiError {
  const message = error.exposeMessage ? error.message : "An unexpected error occurred.";
  return {
    code: error.code,
    message,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(error.issues !== undefined && error.issues.length > 0 ? { issues: error.issues } : {}),
  };
}

export function validationError(message: string, issues: ValidationIssue[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    issues,
  });
}

export function unauthenticatedError(message = "Authentication is required."): AppError {
  return new AppError({ code: "UNAUTHENTICATED", message });
}

export function forbiddenError(message = "Permission denied."): AppError {
  return new AppError({ code: "FORBIDDEN", message });
}

export function notFoundError(message: string): AppError {
  return new AppError({ code: "NOT_FOUND", message });
}

export function conflictError(message: string): AppError {
  return new AppError({ code: "CONFLICT", message });
}

export function serviceUnavailableError(message = "Service temporarily unavailable."): AppError {
  return new AppError({ code: "SERVICE_UNAVAILABLE", message });
}

export function rateLimitedError(message = "Too many requests. Try again later."): AppError {
  return new AppError({ code: "RATE_LIMITED", message });
}

export function internalError(
  message = "An unexpected error occurred.",
  cause?: unknown,
): AppError {
  return new AppError({
    code: "INTERNAL_ERROR",
    message,
    exposeMessage: false,
    cause,
  });
}
