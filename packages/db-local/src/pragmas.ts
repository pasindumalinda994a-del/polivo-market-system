import type { DatabaseSync } from "node:sqlite";

/** Bounded wait when the database is locked by another connection (milliseconds). */
export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

/**
 * Connection PRAGMAs for file-backed operational databases.
 *
 * - foreign_keys: always enforced
 * - journal_mode=WAL: concurrent readers; not unlimited writers
 * - busy_timeout: bounded wait only — does not replace transaction design
 * - synchronous=FULL: prefer durability for committed financial records
 *
 * Checkpointing must not run after every bill. Open transactions and readers
 * affect WAL growth. WAL (.db-wal) and shared-memory (.db-shm) files are runtime data.
 * Do not implement ad hoc live backup by copying only the main database file.
 *
 * TypeScript typings in @types/node currently expose `DatabaseSync` (runtime alias of `Database`).
 */
export function applyRuntimePragmas(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);

  const journal = db.prepare("PRAGMA journal_mode = WAL;").get() as
    { journal_mode: string } | undefined;
  if (journal?.journal_mode.toLowerCase() !== "wal") {
    throw new Error(
      `Failed to enable WAL journal mode (got "${journal?.journal_mode ?? "unknown"}").`,
    );
  }

  db.exec("PRAGMA synchronous = FULL;");
}

export function assertForeignKeysEnabled(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number } | undefined;
  if (row?.foreign_keys !== 1) {
    throw new Error("Foreign key enforcement is not enabled on this connection.");
  }
}
