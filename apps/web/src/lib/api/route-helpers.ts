import { mapZodIssuesToValidationIssues, type ApiError } from "@polivo/contracts";
import { NextResponse } from "next/server";

import {
  httpStatusForError,
  redactForLog,
  toPublicApiError,
  validationError,
  WebAuthError,
} from "@/lib/auth/errors";

type SafeParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        issues: ReadonlyArray<{
          path: ReadonlyArray<PropertyKey>;
          code: string;
          message: string;
        }>;
      };
    };

type SchemaLike<T> = {
  safeParse: (data: unknown) => SafeParseResult<T>;
};

export function jsonError(error: unknown): NextResponse<ApiError> {
  if (error instanceof WebAuthError) {
    console.error(
      "api.route.failed",
      redactForLog({
        name: error.name,
        code: error.code,
        message: error.message,
        httpStatus: error.httpStatus,
      }),
    );
  } else if (error instanceof Error) {
    console.error("api.route.failed", redactForLog({ name: error.name, message: error.message }));
  } else {
    console.error("api.route.failed", redactForLog({ name: "UnknownError" }));
  }
  return NextResponse.json(toPublicApiError(error), {
    status: httpStatusForError(error),
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function jsonOk<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function parseJsonBody<T>(request: Request, schema: SchemaLike<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError("Request body must be JSON.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = mapZodIssuesToValidationIssues(parsed.error.issues);
    throw validationError(issues[0]?.message ?? "Request validation failed.");
  }
  return parsed.data;
}
