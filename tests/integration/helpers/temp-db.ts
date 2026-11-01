import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initializeNewDatabase, openExistingDatabase, type LocalDatabase } from "@polivo/db-local";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

export function createTempDbPath(prefix: string, name: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return join(root, name);
}

export function trackLocal(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

export function cleanupTempDatabases(): void {
  while (openLocals.length > 0) {
    try {
      openLocals.pop()?.close();
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
        // Windows may briefly lock WAL sidecars.
      }
    }
  }
}

export function initBoundDatabase(path: string): LocalDatabase {
  const local = trackLocal(initializeNewDatabase(path));
  seedStallBinding(local);
  return local;
}

export function reopenDatabase(path: string): LocalDatabase {
  return trackLocal(openExistingDatabase(path));
}

export function seedStallBinding(
  local: LocalDatabase,
  stallId = "stall-1",
  tenantId = "tenant-1",
): void {
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, ?, ?, ?)`,
    )
    .run(stallId, tenantId, "2026-11-01T00:00:00.000Z");
}

export function seedTraderBillFixture(local: LocalDatabase, stallId = "stall-1"): void {
  const now = "2026-11-01T00:00:00.000Z";
  local.db
    .prepare(
      `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
       VALUES ('trader-1', ?, 'T1', 'Trader One', 1, ?, ?)`,
    )
    .run(stallId, now, now);
  local.db
    .prepare(
      `INSERT INTO farmers (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
       VALUES ('farmer-1', ?, 'F1', 'Farmer One', 1, ?, ?)`,
    )
    .run(stallId, now, now);
  local.db
    .prepare(
      `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
       VALUES ('sale-1', ?, 'trader-1', '2026-11-01', 'draft', 1, ?, ?)`,
    )
    .run(stallId, now, now);
  local.db
    .prepare(
      `INSERT INTO trader_bills (
         id, stall_id, sale_id, trader_id, bill_number, business_date, status,
         revision, total_amount_minor, payment_status, created_at, updated_at
       ) VALUES ('bill-1', ?, 'sale-1', 'trader-1', NULL, '2026-11-01', 'draft',
                 1, 250075, NULL, ?, ?)`,
    )
    .run(stallId, now, now);
  local.db
    .prepare(
      `INSERT INTO bill_sequences (stall_id, bill_type, next_value)
       VALUES (?, 'trader', 100), (?, 'farmer', 200)`,
    )
    .run(stallId, stallId);
}
