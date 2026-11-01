import { isAbsolute, normalize, resolve } from "node:path";

export class DatabasePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabasePathError";
  }
}

/**
 * Resolve and validate a local SQLite file path.
 * Production and service paths must be absolute and must not be ":memory:".
 */
export function resolveDatabasePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    throw new DatabasePathError("Database path must not be empty.");
  }

  if (trimmed === ":memory:" || trimmed.startsWith("file:")) {
    throw new DatabasePathError(
      `Refusing database path "${trimmed}". In-memory and URL-style SQLite paths are not allowed.`,
    );
  }

  const resolved = isAbsolute(trimmed) ? normalize(trimmed) : normalize(resolve(trimmed));

  if (resolved.includes("\0")) {
    throw new DatabasePathError("Database path must not contain null bytes.");
  }

  return resolved;
}

export function requireAbsoluteDatabasePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    throw new DatabasePathError("Database path must not be empty.");
  }

  if (!isAbsolute(trimmed)) {
    throw new DatabasePathError(
      `Database path must be absolute (got "${trimmed}"). Do not derive the production path from the current working directory.`,
    );
  }

  return resolveDatabasePath(trimmed);
}
