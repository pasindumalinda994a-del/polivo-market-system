/**
 * Classifies SQLite / node:sqlite failures for higher layers.
 * Does not include SQL text, paths, or row contents in public-facing messages.
 */

export type SqliteFailureKind =
  "unique_constraint" | "foreign_key" | "check_constraint" | "busy" | "unavailable" | "unexpected";

export type ClassifiedSqliteError = {
  kind: SqliteFailureKind;
  /** Stable internal code for logs; never send raw driver messages to clients. */
  code: string;
  message: string;
  cause?: unknown;
};

const BUSY_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_LOCKED",
  "ERR_SQLITE_BUSY",
  "ERR_SQLITE_LOCKED",
]);

function readErrorCode(error: unknown): string | undefined {
  if (error !== null && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
    if (typeof code === "number") {
      return String(code);
    }
  }
  return undefined;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Map a thrown SQLite/driver error into a classified failure.
 * Constraint failures from application defects remain "unexpected" at the HTTP boundary
 * unless the caller knows they represent a user-visible uniqueness conflict.
 */
export function classifySqliteError(error: unknown): ClassifiedSqliteError {
  const message = readErrorMessage(error);
  const code = readErrorCode(error) ?? "SQLITE_ERROR";
  const lower = message.toLowerCase();

  if (BUSY_CODES.has(code) || lower.includes("database is locked") || lower.includes("busy")) {
    return {
      kind: "busy",
      code,
      message: "Database is temporarily busy.",
      cause: error,
    };
  }

  if (
    lower.includes("unique constraint failed") ||
    (lower.includes("constraint failed") && lower.includes("unique"))
  ) {
    return {
      kind: "unique_constraint",
      code,
      message: "A uniqueness constraint was violated.",
      cause: error,
    };
  }

  if (lower.includes("foreign key constraint failed")) {
    return {
      kind: "foreign_key",
      code,
      message: "A foreign key constraint was violated.",
      cause: error,
    };
  }

  if (lower.includes("check constraint failed")) {
    return {
      kind: "check_constraint",
      code,
      message: "A check constraint was violated.",
      cause: error,
    };
  }

  if (
    lower.includes("unable to open") ||
    lower.includes("disk i/o error") ||
    lower.includes("readonly") ||
    lower.includes("permission denied") ||
    lower.includes("database disk image is malformed")
  ) {
    return {
      kind: "unavailable",
      code,
      message: "Local storage is unavailable.",
      cause: error,
    };
  }

  return {
    kind: "unexpected",
    code,
    message: "An unexpected database error occurred.",
    cause: error,
  };
}
