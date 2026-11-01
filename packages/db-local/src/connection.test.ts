import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DatabaseConnectionError,
  initializeNewDatabase,
  openExistingDatabase,
  openExistingDatabaseAndVerify,
  type LocalDatabase,
} from "./connection.js";
import * as runner from "./migrations/runner.js";
import { applyPendingMigrations, getMigrationStatus } from "./migrations/runner.js";
import {
  moneyMinorFromSqliteInteger,
  moneyMinorToSqliteInteger,
  weightHundredthsFromSqliteInteger,
  weightHundredthsToSqliteInteger,
} from "./numeric.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-db-local-"));
  tempRoots.push(root);
  return join(root, name);
}

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

afterEach(() => {
  while (openLocals.length > 0) {
    const local = openLocals.pop();
    try {
      local?.close();
    } catch {
      // ignore
    }
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may briefly lock WAL sidecars; best-effort cleanup.
      }
    }
  }
});

describe("local database connection lifecycle", () => {
  it("initializes a fresh file database, applies migrations, and reopens it", () => {
    const path = tempDbPath("fresh.sqlite");
    const created = track(initializeNewDatabase(path));
    const status = getMigrationStatus(created.db);
    expect(status.pending).toHaveLength(0);
    expect(status.applied.length).toBeGreaterThan(0);
    const installation = created.db.prepare("SELECT id FROM local_installation").get() as
      { id: string } | undefined;
    expect(installation?.id).toBeTruthy();
    expect(
      created.db.prepare("SELECT COUNT(*) AS c FROM stall_binding").get() as { c: number },
    ).toEqual({ c: 0 });
    created.close();

    const reopened = track(openExistingDatabaseAndVerify(path));
    expect(getMigrationStatus(reopened.db).pending).toHaveLength(0);
    const journal = reopened.db.prepare("PRAGMA journal_mode;").get() as {
      journal_mode: string;
    };
    expect(journal.journal_mode.toLowerCase()).toBe("wal");
    const fk = reopened.db.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
    reopened.close();
  });

  it("re-running migrations is a no-op", () => {
    const path = tempDbPath("rerun.sqlite");
    const created = track(initializeNewDatabase(path));
    created.close();

    const reopened = track(openExistingDatabase(path));
    const newly = applyPendingMigrations(reopened.db);
    expect(newly).toEqual([]);
    reopened.close();
  });

  it("refuses to open a missing database", () => {
    expect(() => openExistingDatabase(tempDbPath("missing.sqlite"))).toThrow(
      DatabaseConnectionError,
    );
  });

  it("refuses to initialize over an existing database", () => {
    const path = tempDbPath("exists.sqlite");
    const created = track(initializeNewDatabase(path));
    created.close();
    expect(() => initializeNewDatabase(path)).toThrow(/already exists/);
  });

  it("refuses to replace an invalid database file with a new empty one", () => {
    const path = tempDbPath("not-a-db.sqlite");
    writeFileSync(path, "not sqlite", "utf8");
    expect(() => openExistingDatabase(path)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("not sqlite");
  });

  it("removes the new database file when initialization fails after creation", () => {
    const path = tempDbPath("cleanup-on-fail.sqlite");
    const spy = vi.spyOn(runner, "applyPendingMigrations").mockImplementation(() => {
      throw new Error("forced migration failure");
    });
    try {
      expect(() => initializeNewDatabase(path)).toThrow(/forced migration failure/);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(`${path}-wal`)).toBe(false);
      expect(existsSync(`${path}-shm`)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("schema integrity", () => {
  it("enforces foreign keys, duplicate short codes, and bill number uniqueness", () => {
    const path = tempDbPath("integrity.sqlite");
    const local = track(initializeNewDatabase(path));
    try {
      const now = new Date().toISOString();
      local.db
        .prepare(
          `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        )
        .run("trader-1", "stall-a", "T1", "Trader One", now, now);

      expect(() =>
        local.db
          .prepare(
            `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
          )
          .run("trader-2", "stall-a", "T1", "Duplicate", now, now),
      ).toThrow(/UNIQUE/);

      expect(() =>
        local.db
          .prepare(
            `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'draft', 1, ?, ?)`,
          )
          .run("sale-1", "stall-b", "trader-1", "2026-11-01", now, now),
      ).toThrow(/FOREIGN KEY/);

      local.db
        .prepare(
          `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'draft', 1, ?, ?)`,
        )
        .run("sale-1", "stall-a", "trader-1", "2026-11-01", now, now);

      local.db
        .prepare(
          `INSERT INTO trader_bills (
             id, stall_id, sale_id, trader_id, bill_number, business_date, status, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'finalized', 1, ?, ?)`,
        )
        .run("tb-1", "stall-a", "sale-1", "trader-1", "T-100", "2026-11-01", now, now);

      expect(() =>
        local.db
          .prepare(
            `INSERT INTO trader_bills (
               id, stall_id, sale_id, trader_id, bill_number, business_date, status, revision, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'finalized', 1, ?, ?)`,
          )
          .run("tb-2", "stall-a", "sale-1", "trader-1", "T-100", "2026-11-01", now, now),
      ).toThrow(/UNIQUE/);

      expect(() => local.db.prepare(`DELETE FROM traders WHERE id = ?`).run("trader-1")).toThrow(
        /FOREIGN KEY/,
      );
    } finally {
      local.close();
    }
  });

  it("rejects mixed-stall farmer allocations via composite foreign keys", () => {
    const path = tempDbPath("mixed-stall.sqlite");
    const local = track(initializeNewDatabase(path));
    try {
      const now = new Date().toISOString();
      local.db
        .prepare(
          `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('trader-1', 'stall-a', 'T1', 'Trader', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO farmers (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('farmer-1', 'stall-b', 'F1', 'Farmer', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO vegetables (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('veg-1', 'stall-a', 'V1', 'Beans', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
           VALUES ('sale-1', 'stall-a', 'trader-1', '2026-11-01', 'draft', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO sale_lines (
             id, stall_id, sale_id, vegetable_id, line_order, unit_price_per_kg_minor, packaging_weight_hundredths
           ) VALUES ('line-1', 'stall-a', 'sale-1', 'veg-1', 1, 25000, 0)`,
        )
        .run();

      expect(() =>
        local.db
          .prepare(
            `INSERT INTO sale_farmer_allocations (
               id, stall_id, sale_id, sale_line_id, farmer_id, allocated_net_weight_hundredths
             ) VALUES ('alloc-1', 'stall-a', 'sale-1', 'line-1', 'farmer-1', 1000)`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      local.close();
    }
  });

  it("rolls back a transaction that includes business and outbox rows", () => {
    const path = tempDbPath("txn.sqlite");
    const local = track(initializeNewDatabase(path));
    try {
      const now = new Date().toISOString();
      local.db
        .prepare(
          `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('trader-1', 'stall-a', 'T1', 'Trader', 1, ?, ?)`,
        )
        .run(now, now);

      local.db.exec("BEGIN;");
      local.db
        .prepare(
          `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
           VALUES ('sale-1', 'stall-a', 'trader-1', '2026-11-01', 'draft', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO sync_outbox (
             event_id, tenant_id, stall_id, originating_device_id, event_type, event_schema_version,
             payload_json, occurred_at, local_sequence
           ) VALUES ('evt-1', 'tenant-a', 'stall-a', 'device-1', 'sale.drafted', '1', '{}', ?, 1)`,
        )
        .run(now);
      local.db.exec("ROLLBACK;");

      expect(local.db.prepare("SELECT COUNT(*) AS c FROM sales").get() as { c: number }).toEqual({
        c: 0,
      });
      expect(
        local.db.prepare("SELECT COUNT(*) AS c FROM sync_outbox").get() as { c: number },
      ).toEqual({ c: 0 });
    } finally {
      local.close();
    }
  });

  it("round-trips exact money and weight integers", () => {
    const path = tempDbPath("numeric.sqlite");
    const local = track(initializeNewDatabase(path));
    try {
      const now = new Date().toISOString();
      local.db
        .prepare(
          `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('trader-1', 'stall-a', 'T1', 'Trader', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO vegetables (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
           VALUES ('veg-1', 'stall-a', 'V1', 'Beans', 1, ?, ?)`,
        )
        .run(now, now);
      local.db
        .prepare(
          `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
           VALUES ('sale-1', 'stall-a', 'trader-1', '2026-11-01', 'draft', 1, ?, ?)`,
        )
        .run(now, now);

      const money = moneyMinorToSqliteInteger(12_345);
      const weight = weightHundredthsToSqliteInteger(2_550);
      local.db
        .prepare(
          `INSERT INTO sale_lines (
             id, stall_id, sale_id, vegetable_id, line_order, unit_price_per_kg_minor,
             packaging_weight_hundredths, line_sale_amount_minor
           ) VALUES ('line-1', 'stall-a', 'sale-1', 'veg-1', 1, ?, ?, ?)`,
        )
        .run(money, weight, money);

      const row = local.db
        .prepare(
          `SELECT unit_price_per_kg_minor AS price, packaging_weight_hundredths AS weight
           FROM sale_lines WHERE id = 'line-1'`,
        )
        .get() as { price: number; weight: number };

      expect(moneyMinorFromSqliteInteger(row.price)).toBe(12_345);
      expect(weightHundredthsFromSqliteInteger(row.weight)).toBe(2_550);
      expect(moneyMinorToSqliteInteger(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    } finally {
      local.close();
    }
  });
});
