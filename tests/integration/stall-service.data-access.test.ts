import {
  allocateNextBillSequence,
  AsyncTransactionCallbackError,
  ClosedTransactionError,
  getBillById,
  getFarmerById,
  getIdempotencyRecord,
  NestedTransactionError,
  RevisionConflictError,
  runInTransaction,
  SQLITE_BUSY_TIMEOUT_MS,
  updateBillWithExpectedRevision,
} from "@polivo/db-local";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDatabases,
  createTempDbPath,
  initBoundDatabase,
  reopenDatabase,
  seedTraderBillFixture,
} from "./helpers/temp-db.ts";

afterEach(() => {
  cleanupTempDatabases();
});

describe("data access foundations", () => {
  it("returns tenant-scoped party reads and rejects cross-stall ids", () => {
    const local = initBoundDatabase(createTempDbPath("polivo-da-", "scope.sqlite"));
    seedTraderBillFixture(local);

    expect(getFarmerById(local, "stall-1", "farmer-1")?.shortCode).toBe("F1");
    expect(getFarmerById(local, "other-stall", "farmer-1")).toBeNull();
    expect(getFarmerById(local, "stall-1", "'; DROP TABLE farmers; --")).toBeNull();
  });

  it("preserves exact money minor units through bill mapping", () => {
    const local = initBoundDatabase(createTempDbPath("polivo-da-", "money.sqlite"));
    seedTraderBillFixture(local);
    const bill = getBillById(local, "trader", "stall-1", "bill-1");
    expect(bill?.totalAmountMinor).toBe(250075);
  });

  it("commits business, audit, and outbox together and rolls back on failure", () => {
    const local = initBoundDatabase(createTempDbPath("polivo-da-", "atomic.sqlite"));
    seedTraderBillFixture(local);

    runInTransaction(local.db, (tx) => {
      updateBillWithExpectedRevision(tx, "trader", "stall-1", "bill-1", {
        expectedRevision: 1,
        updatedAt: "2026-11-01T01:00:00.000Z",
      });
      tx.db
        .prepare(`INSERT INTO audit_events (id, action, occurred_at) VALUES ('a1', 'ok', ?)`)
        .run("2026-11-01T01:00:00.000Z");
      tx.db
        .prepare(
          `INSERT INTO sync_outbox (
             event_id, tenant_id, stall_id, originating_device_id, event_type,
             event_schema_version, payload_json, occurred_at, local_sequence
           ) VALUES ('e1', 'tenant-1', 'stall-1', 'device-1', 'polivo.test.fixture', '1', '{}', ?, 1)`,
        )
        .run("2026-11-01T01:00:00.000Z");
    });

    expect(getBillById(local, "trader", "stall-1", "bill-1")?.revision).toBe(2);

    expect(() =>
      runInTransaction(local.db, (tx) => {
        updateBillWithExpectedRevision(tx, "trader", "stall-1", "bill-1", {
          expectedRevision: 2,
          updatedAt: "2026-11-01T02:00:00.000Z",
        });
        tx.db
          .prepare(`INSERT INTO audit_events (id, action, occurred_at) VALUES ('a2', 'fail', ?)`)
          .run("2026-11-01T02:00:00.000Z");
        throw new Error("force fail after writes");
      }),
    ).toThrow("force fail after writes");

    expect(getBillById(local, "trader", "stall-1", "bill-1")?.revision).toBe(2);
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });
  });

  it("rejects nested transactions, async callbacks, and closed handles", () => {
    const local = initBoundDatabase(createTempDbPath("polivo-da-", "tx.sqlite"));
    expect(() =>
      runInTransaction(local.db, () => {
        runInTransaction(local.db, () => undefined);
      }),
    ).toThrow(NestedTransactionError);

    expect(() => runInTransaction(local.db, () => Promise.resolve(1) as unknown as number)).toThrow(
      AsyncTransactionCallbackError,
    );

    let handle: { db: unknown } | undefined;
    runInTransaction(local.db, (tx) => {
      handle = tx;
    });
    expect(() => (handle as { db: unknown }).db).toThrow(ClosedTransactionError);
  });

  it("allocates unique sequences and reports revision conflicts", () => {
    const local = initBoundDatabase(createTempDbPath("polivo-da-", "seq.sqlite"));
    seedTraderBillFixture(local);

    const a = runInTransaction(local.db, (tx) => allocateNextBillSequence(tx, "stall-1", "trader"));
    const b = runInTransaction(local.db, (tx) => allocateNextBillSequence(tx, "stall-1", "trader"));
    expect(a).toBe(100);
    expect(b).toBe(101);

    updateBillWithExpectedRevision(local, "trader", "stall-1", "bill-1", {
      expectedRevision: 1,
      updatedAt: "2026-11-01T03:00:00.000Z",
    });
    expect(() =>
      updateBillWithExpectedRevision(local, "trader", "stall-1", "bill-1", {
        expectedRevision: 1,
        updatedAt: "2026-11-01T03:01:00.000Z",
      }),
    ).toThrow(RevisionConflictError);
  });

  it("keeps durable idempotency after reopening the database", () => {
    const path = createTempDbPath("polivo-da-", "idem.sqlite");
    const local = initBoundDatabase(path);
    seedTraderBillFixture(local);

    runInTransaction(local.db, (tx) => {
      tx.db
        .prepare(
          `INSERT INTO command_idempotency (
             scope, idempotency_key, command_type, request_fingerprint,
             result_ref, completed_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "tenant-1:stall-1:test.command",
          "key-1",
          "test.command",
          "fp-1",
          JSON.stringify({ ok: true }),
          "2026-11-01T00:00:00.000Z",
          "2026-11-01T00:00:00.000Z",
        );
    });
    local.close();

    const reopened = reopenDatabase(path);
    const record = getIdempotencyRecord(reopened, "tenant-1:stall-1:test.command", "key-1");
    expect(record?.resultRef).toBe(JSON.stringify({ ok: true }));
  });

  it("surfaces lock contention within the busy timeout bound", () => {
    const path = createTempDbPath("polivo-da-", "busy.sqlite");
    const first = initBoundDatabase(path);
    seedTraderBillFixture(first);
    const second = reopenDatabase(path);

    first.db.exec("BEGIN IMMEDIATE;");
    const started = Date.now();
    let threw = false;
    try {
      second.db.exec("BEGIN IMMEDIATE;");
      second.db.exec("COMMIT;");
    } catch {
      threw = true;
    } finally {
      first.db.exec("COMMIT;");
    }
    const elapsed = Date.now() - started;
    expect(threw).toBe(true);
    expect(elapsed).toBeLessThan(SQLITE_BUSY_TIMEOUT_MS + 3000);
  }, 20_000);
});
