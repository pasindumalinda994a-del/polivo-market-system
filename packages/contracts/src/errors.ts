import { z } from "zod";

import { requestIdSchema } from "./primitives.js";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Intended HTTP status mapping for application error codes.
 * Documented for services; contracts do not include HTTP response types.
 *
 * - VALIDATION_ERROR → 400
 * - UNAUTHENTICATED → 401
 * - FORBIDDEN → 403
 * - NOT_FOUND → 404
 * - CONFLICT → 409
 * - RATE_LIMITED → 429
 * - SERVICE_UNAVAILABLE → 503
 * - INTERNAL_ERROR → 500
 *
 * Failed requests must not return HTTP 200.
 */
export const ERROR_CODE_HTTP_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

export const validationIssueSchema = z.strictObject({
  path: z.string(),
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(512),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const apiErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(512),
  requestId: requestIdSchema.optional(),
  issues: z.array(validationIssueSchema).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) {
    return "";
  }

  return path.map((segment) => String(segment)).join(".");
}

/**
 * Maps Zod issues into the public validation-issue shape.
 * Only path, stable issue code, and safe message are copied.
 * Rejected input values and library internals are omitted.
 */
export function mapZodIssuesToValidationIssues(
  issues: ReadonlyArray<{
    path: ReadonlyArray<PropertyKey>;
    code: string;
    message: string;
  }>,
): ValidationIssue[] {
  return issues.map((issue) =>
    validationIssueSchema.parse({
      path: formatIssuePath(issue.path),
      code: issue.code,
      message: issue.message,
    }),
  );
}
