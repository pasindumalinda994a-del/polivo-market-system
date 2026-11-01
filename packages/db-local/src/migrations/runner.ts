import type { DatabaseSync } from "node:sqlite";

import { loadBundledMigrations, type MigrationDefinition, migrationChecksum } from "./registry.js";

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export type AppliedMigration = {
  id: string;
  name: string;
  checksum: string;
  appliedAt: string;
};

export type MigrationStatus = {
  applied: AppliedMigration[];
  pending: MigrationDefinition[];
};

type MigrationRow = {
  id: string;
  name: string;
  checksum: string;
  applied_at: string;
};

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function readApplied(db: DatabaseSync): AppliedMigration[] {
  ensureMigrationsTable(db);
  const rows = db
    .prepare(
      `SELECT id, name, checksum, applied_at
       FROM schema_migrations
       ORDER BY id ASC`,
    )
    .all() as MigrationRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
}

function assertChecksumsMatch(applied: AppliedMigration[], available: MigrationDefinition[]): void {
  const byId = new Map(available.map((migration) => [migration.id, migration]));
  for (const row of applied) {
    const definition = byId.get(row.id);
    if (definition === undefined) {
      throw new MigrationError(
        `Database has applied migration "${row.id}" (${row.name}) which is not present in this package.`,
      );
    }
    if (definition.checksum !== row.checksum) {
      throw new MigrationError(
        `Migration checksum mismatch for "${row.id}" (${row.name}). Applied migrations must not be modified.`,
      );
    }
  }
}

function assertNoUnsupportedNewerSchema(
  applied: AppliedMigration[],
  available: MigrationDefinition[],
): void {
  if (applied.length === 0) {
    return;
  }
  const latestAvailable = available[available.length - 1]?.id;
  const latestApplied = applied[applied.length - 1]?.id;
  if (
    latestAvailable !== undefined &&
    latestApplied !== undefined &&
    latestApplied > latestAvailable
  ) {
    throw new MigrationError(
      `Database schema version "${latestApplied}" is newer than this package supports (latest "${latestAvailable}").`,
    );
  }

  for (const row of applied) {
    if (!available.some((migration) => migration.id === row.id)) {
      throw new MigrationError(
        `Database has unsupported migration "${row.id}". Refuse to open with a newer or unknown schema.`,
      );
    }
  }
}

export function getMigrationStatus(
  db: DatabaseSync,
  migrations: MigrationDefinition[] = loadBundledMigrations(),
): MigrationStatus {
  const applied = readApplied(db);
  assertNoUnsupportedNewerSchema(applied, migrations);
  assertChecksumsMatch(applied, migrations);

  const appliedIds = new Set(applied.map((row) => row.id));
  const pending = migrations.filter((migration) => !appliedIds.has(migration.id));

  return { applied, pending };
}

/**
 * Verify an already-initialized operational database is compatible with this package.
 * Does not apply migrations.
 */
export function verifySchemaCompatibility(
  db: DatabaseSync,
  migrations: MigrationDefinition[] = loadBundledMigrations(),
): void {
  const status = getMigrationStatus(db, migrations);
  if (status.applied.length === 0) {
    throw new MigrationError(
      "Database has no applied migrations. Initialize the database explicitly before starting the service.",
    );
  }
  if (status.pending.length > 0) {
    const pendingIds = status.pending.map((migration) => migration.id).join(", ");
    throw new MigrationError(
      `Database is missing migrations: ${pendingIds}. Run the explicit migrate command; the service does not auto-migrate on startup.`,
    );
  }
}

function beginExclusive(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE;");
}

function commit(db: DatabaseSync): void {
  db.exec("COMMIT;");
}

function rollback(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK;");
  } catch {
    // Ignore rollback failures when no transaction is open.
  }
}

/**
 * Apply pending migrations in order under an exclusive lock.
 * Rechecks state after acquiring the lock. Never auto-resets or runs down-migrations.
 */
export function applyPendingMigrations(
  db: DatabaseSync,
  migrations: MigrationDefinition[] = loadBundledMigrations(),
): AppliedMigration[] {
  beginExclusive(db);
  try {
    const status = getMigrationStatus(db, migrations);
    const newlyApplied: AppliedMigration[] = [];

    for (const migration of status.pending) {
      try {
        db.exec(migration.sql);
      } catch (error) {
        rollback(db);
        const message = error instanceof Error ? error.message : String(error);
        throw new MigrationError(
          `Migration "${migration.id}" (${migration.name}) failed and was rolled back: ${message}`,
        );
      }

      // Record history in the same exclusive transaction as the migration body.
      const appliedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO schema_migrations (id, name, checksum, applied_at)
         VALUES (?, ?, ?, ?)`,
      ).run(migration.id, migration.name, migration.checksum, appliedAt);

      newlyApplied.push({
        id: migration.id,
        name: migration.name,
        checksum: migration.checksum,
        appliedAt,
      });
    }

    commit(db);
    return newlyApplied;
  } catch (error) {
    rollback(db);
    throw error;
  }
}

export function createSyntheticMigration(input: {
  id: string;
  name: string;
  sql: string;
}): MigrationDefinition {
  return {
    id: input.id,
    name: input.name,
    sql: input.sql,
    checksum: migrationChecksum(input.sql),
  };
}
