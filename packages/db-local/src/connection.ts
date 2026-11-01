import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyPendingMigrations, verifySchemaCompatibility } from "./migrations/runner.js";
import { resolveDatabasePath } from "./paths.js";
import {
  applyRuntimePragmas,
  assertForeignKeysEnabled,
  SQLITE_BUSY_TIMEOUT_MS,
} from "./pragmas.js";

export type LocalDatabase = {
  readonly path: string;
  readonly db: DatabaseSync;
  close: () => void;
};

export class DatabaseConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

function openDatabaseFile(absolutePath: string, create: boolean): DatabaseSync {
  try {
    return new DatabaseSync(absolutePath, {
      readOnly: false,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      timeout: SQLITE_BUSY_TIMEOUT_MS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (create) {
      throw new DatabaseConnectionError(
        `Failed to create database at "${absolutePath}": ${message}`,
      );
    }
    throw new DatabaseConnectionError(`Failed to open database at "${absolutePath}": ${message}`);
  }
}

function configureConnection(db: DatabaseSync, absolutePath: string): LocalDatabase {
  applyRuntimePragmas(db);
  assertForeignKeysEnabled(db);

  return {
    path: absolutePath,
    db,
    close: () => {
      db.close();
    },
  };
}

/**
 * Open an existing initialized database. Does not create or replace files.
 * Does not apply migrations — call verifySchemaCompatibility separately for service startup.
 */
export function openExistingDatabase(rawPath: string): LocalDatabase {
  const absolutePath = resolveDatabasePath(rawPath);

  if (!existsSync(absolutePath)) {
    throw new DatabaseConnectionError(
      `Database file does not exist at "${absolutePath}". Initialize explicitly or correct POLIVO_LOCAL_DB_PATH.`,
    );
  }

  let handle: ReturnType<typeof openSync> | undefined;
  try {
    handle = openSync(absolutePath, "r+");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseConnectionError(
      `Database at "${absolutePath}" is not readable/writable: ${message}. Refusing to replace it with a new empty database.`,
    );
  } finally {
    if (handle !== undefined) {
      closeSync(handle);
    }
  }

  const db = openDatabaseFile(absolutePath, false);
  try {
    return configureConnection(db, absolutePath);
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Create a new database file, apply bundled migrations, and record installation identity.
 * Does not fabricate tenant, owner, or device records.
 */
export function initializeNewDatabase(rawPath: string): LocalDatabase {
  const absolutePath = resolveDatabasePath(rawPath);

  if (existsSync(absolutePath)) {
    throw new DatabaseConnectionError(
      `Refusing to initialize: database already exists at "${absolutePath}".`,
    );
  }

  const parentDir = dirname(absolutePath);
  try {
    mkdirSync(parentDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseConnectionError(
      `Failed to create application data directory "${parentDir}": ${message}`,
    );
  }

  const db = openDatabaseFile(absolutePath, true);
  let local: LocalDatabase;
  try {
    local = configureConnection(db, absolutePath);
  } catch (error) {
    db.close();
    throw error;
  }

  try {
    applyPendingMigrations(local.db);

    const installationId = randomUUID();
    const createdAt = new Date().toISOString();
    local.db
      .prepare(
        `INSERT INTO local_installation (id, created_at)
         VALUES (?, ?)`,
      )
      .run(installationId, createdAt);
  } catch (error) {
    local.close();
    removeDatabaseArtifacts(absolutePath);
    throw error;
  }

  // Best-effort restrictive permissions on POSIX; no-op failure on Windows ACLs.
  try {
    chmodSync(absolutePath, 0o600);
  } catch {
    // Ignore when the platform does not support chmod semantics.
  }

  return local;
}

export function openExistingDatabaseAndVerify(rawPath: string): LocalDatabase {
  const local = openExistingDatabase(rawPath);
  try {
    verifySchemaCompatibility(local.db);
  } catch (error) {
    local.close();
    throw error;
  }
  return local;
}

/** Best-effort removal of a newly created DB file and WAL sidecars after failed init. */
function removeDatabaseArtifacts(absolutePath: string): void {
  for (const path of [absolutePath, `${absolutePath}-wal`, `${absolutePath}-shm`]) {
    try {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    } catch {
      // Ignore cleanup failures (for example transient Windows file locks).
    }
  }
}
