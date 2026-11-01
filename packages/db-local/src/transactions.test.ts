import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "./connection.js";
import {
  AsyncTransactionCallbackError,
  ClosedTransactionError,
  NestedTransactionError,
  runInTransaction,
} from "./transactions.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-db-tx-"));
  tempRoots.push(root);
  return join(root, name);
}

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

afterEach(() => {
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
        // ignore
      }
    }
  }
});

describe("runInTransaction", () => {
  it("commits all writes on success", () => {
    const local = track(initializeNewDatabase(tempDbPath("commit.sqlite")));
    runInTransaction(local.db, (tx) => {
      tx.db
        .prepare(
          `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
           VALUES (1, ?, ?, ?)`,
        )
        .run("stall-1", "tenant-1", "2026-11-01T00:00:00.000Z");
    });

    const row = local.db.prepare(`SELECT stall_id FROM stall_binding WHERE id = 1`).get() as
      { stall_id: string } | undefined;
    expect(row?.stall_id).toBe("stall-1");
  });

  it("rolls back all writes on failure", () => {
    const local = track(initializeNewDatabase(tempDbPath("rollback.sqlite")));
    expect(() =>
      runInTransaction(local.db, (tx) => {
        tx.db
          .prepare(
            `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
             VALUES (1, ?, ?, ?)`,
          )
          .run("stall-1", "tenant-1", "2026-11-01T00:00:00.000Z");
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM stall_binding`).get() as { c: number },
    ).toEqual({ c: 0 });
  });

  it("rejects nested transactions", () => {
    const local = track(initializeNewDatabase(tempDbPath("nested.sqlite")));
    expect(() =>
      runInTransaction(local.db, () => {
        runInTransaction(local.db, () => undefined);
      }),
    ).toThrow(NestedTransactionError);
  });

  it("rejects promise-returning callbacks", () => {
    const local = track(initializeNewDatabase(tempDbPath("async.sqlite")));
    expect(() => runInTransaction(local.db, () => Promise.resolve(1) as unknown as number)).toThrow(
      AsyncTransactionCallbackError,
    );
  });

  it("invalidates the transaction handle after completion", () => {
    const local = track(initializeNewDatabase(tempDbPath("closed.sqlite")));
    let leaked: { db: unknown } | undefined;
    runInTransaction(local.db, (tx) => {
      leaked = tx;
    });
    expect(() => (leaked as { db: unknown }).db).toThrow(ClosedTransactionError);
  });
});
