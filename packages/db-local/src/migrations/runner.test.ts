import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, openExistingDatabase } from "../connection.js";
import { applyRuntimePragmas } from "../pragmas.js";
import { loadBundledMigrations, migrationChecksum } from "./registry.js";
import {
  applyPendingMigrations,
  createSyntheticMigration,
  getMigrationStatus,
  MigrationError,
  verifySchemaCompatibility,
} from "./runner.js";

const tempRoots: string[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-migrate-"));
  tempRoots.push(root);
  return join(root, name);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("migration runner", () => {
  it("loads bundled migrations in order", () => {
    const migrations = loadBundledMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0]?.id).toBe("001");
    expect(migrations[0]?.checksum).toBe(migrationChecksum(migrations[0]!.sql));
  });

  it("rolls back a failed transactional migration", () => {
    const path = tempDbPath("fail.sqlite");
    const local = initializeNewDatabase(path);
    try {
      const bundled = loadBundledMigrations();
      const failing = createSyntheticMigration({
        id: "003",
        name: "failing_migration",
        sql: `CREATE TABLE demo_ok (id TEXT PRIMARY KEY NOT NULL);
              INSERT INTO demo_ok (id) VALUES ('a');
              INSERT INTO demo_ok (id) VALUES ('a');`,
      });

      expect(() => applyPendingMigrations(local.db, [...bundled, failing])).toThrow(MigrationError);

      const tables = local.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('demo_ok', 'demo_bad')`,
        )
        .all() as Array<{ name: string }>;
      expect(tables).toEqual([]);

      const status = getMigrationStatus(local.db, bundled);
      expect(status.applied.map((row) => row.id)).toEqual([
        "001",
        "002",
        "003",
        "004",
        "005",
        "006",
      ]);
      expect(status.pending).toHaveLength(0);
    } finally {
      local.close();
    }
  });

  it("detects checksum mismatch for previously applied migrations", () => {
    const path = tempDbPath("checksum.sqlite");
    const local = initializeNewDatabase(path);
    try {
      const bundled = loadBundledMigrations();
      const first = bundled[0];
      if (first === undefined) {
        throw new Error("expected bundled migration");
      }
      const tampered = {
        ...first,
        sql: `${first.sql}\n-- tampered`,
        checksum: createHash("sha256").update(`${first.sql}\n-- tampered`, "utf8").digest("hex"),
      };
      const rest = bundled.slice(1);

      expect(() => getMigrationStatus(local.db, [tampered, ...rest])).toThrow(/checksum/i);
    } finally {
      local.close();
    }
  });

  it("refuses a newer unsupported schema", () => {
    const path = tempDbPath("newer.sqlite");
    const local = initializeNewDatabase(path);
    try {
      local.db
        .prepare(
          `INSERT INTO schema_migrations (id, name, checksum, applied_at)
           VALUES ('999', 'future', 'abc', ?)`,
        )
        .run(new Date().toISOString());

      expect(() => verifySchemaCompatibility(local.db, loadBundledMigrations())).toThrow(
        /newer|unsupported/i,
      );
    } finally {
      local.close();
    }
  });

  it("service verify rejects pending migrations without applying them", () => {
    const path = tempDbPath("pending.sqlite");
    const db = new DatabaseSync(path);
    applyRuntimePragmas(db);
    db.close();

    const local = openExistingDatabase(path);
    try {
      expect(() => verifySchemaCompatibility(local.db)).toThrow(/no applied migrations/i);
      const after = getMigrationStatus(local.db);
      expect(after.applied).toHaveLength(0);
      expect(after.pending.length).toBeGreaterThan(0);
      const migrationsTable = local.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
        )
        .get();
      expect(migrationsTable).toBeUndefined();
    } finally {
      local.close();
    }
  });

  it("handles competing writers with a bounded busy timeout", () => {
    const path = tempDbPath("busy.sqlite");
    const first = initializeNewDatabase(path);
    const second = openExistingDatabase(path);
    try {
      first.db.exec("BEGIN IMMEDIATE;");
      first.db
        .prepare(
          `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
             VALUES ('trader-lock', 'stall-a', 'L1', 'Locked', 1, ?, ?)`,
        )
        .run(new Date().toISOString(), new Date().toISOString());

      let threw = false;
      const started = Date.now();
      try {
        second.db.exec("BEGIN IMMEDIATE;");
        second.db
          .prepare(
            `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
               VALUES ('trader-other', 'stall-a', 'L2', 'Other', 1, ?, ?)`,
          )
          .run(new Date().toISOString(), new Date().toISOString());
        second.db.exec("COMMIT;");
      } catch {
        threw = true;
        try {
          second.db.exec("ROLLBACK;");
        } catch {
          // ignore
        }
      }

      first.db.exec("COMMIT;");
      expect(threw).toBe(true);
      // Confirms the connection waited up to the configured busy timeout rather than failing instantly.
      expect(Date.now() - started).toBeGreaterThanOrEqual(1_000);
    } finally {
      try {
        first.db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      first.close();
      second.close();
    }
  }, 20_000);
});
