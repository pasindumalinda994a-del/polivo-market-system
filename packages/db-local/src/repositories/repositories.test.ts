import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { RowMappingError } from "../mapping/errors.js";
import { mapBillRow } from "../mapping/records.js";
import { runInTransaction } from "../transactions.js";
import { appendAuditEvent } from "./audit.js";
import { getStallBinding } from "./binding.js";
import { getBillById, updateBillWithExpectedRevision } from "./bills.js";
import { getIdempotencyRecord, insertCompletedIdempotencyRecord } from "./idempotency.js";
import { appendOutboxEvent } from "./outbox.js";
import { getFarmerById } from "./parties.js";
import { allocateNextBillSequence } from "./sequences.js";
import { NotFoundError, RevisionConflictError, SequenceConfigurationError } from "./types.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-db-repo-"));
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

function seedBinding(local: LocalDatabase, stallId = "stall-1", tenantId = "tenant-1"): void {
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, ?, ?, ?)`,
    )
    .run(stallId, tenantId, "2026-11-01T00:00:00.000Z");
}

function seedFarmerTrader(local: LocalDatabase, stallId = "stall-1"): void {
  local.db
    .prepare(
      `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
       VALUES ('trader-1', ?, 'T1', 'Trader One', 1, ?, ?)`,
    )
    .run(stallId, "2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
  local.db
    .prepare(
      `INSERT INTO farmers (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
       VALUES ('farmer-1', ?, 'F1', 'Farmer One', 1, ?, ?)`,
    )
    .run(stallId, "2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
  local.db
    .prepare(
      `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
       VALUES ('sale-1', ?, 'trader-1', '2026-11-01', 'draft', 1, ?, ?)`,
    )
    .run(stallId, "2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");
}

describe("repositories", () => {
  it("loads stall binding and rejects missing binding", () => {
    const local = track(initializeNewDatabase(tempDbPath("binding.sqlite")));
    expect(() => getStallBinding(local)).toThrow(NotFoundError);
    seedBinding(local);
    expect(getStallBinding(local)).toMatchObject({
      stallId: "stall-1",
      tenantId: "tenant-1",
    });
  });

  it("scopes farmer reads to stall_id", () => {
    const local = track(initializeNewDatabase(tempDbPath("party.sqlite")));
    seedBinding(local);
    seedFarmerTrader(local);
    expect(getFarmerById(local, "stall-1", "farmer-1")?.displayName).toBe("Farmer One");
    expect(getFarmerById(local, "other-stall", "farmer-1")).toBeNull();
    expect(getFarmerById(local, "stall-1", "'; DROP TABLE farmers; --")).toBeNull();
  });

  it("supports optimistic bill revision updates", () => {
    const local = track(initializeNewDatabase(tempDbPath("bill.sqlite")));
    seedBinding(local);
    seedFarmerTrader(local);
    local.db
      .prepare(
        `INSERT INTO trader_bills (
           id, stall_id, sale_id, trader_id, bill_number, business_date, status,
           revision, total_amount_minor, payment_status, created_at, updated_at
         ) VALUES ('bill-1', 'stall-1', 'sale-1', 'trader-1', NULL, '2026-11-01', 'draft',
                   1, 150050, NULL, ?, ?)`,
      )
      .run("2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z");

    const bill = getBillById(local, "trader", "stall-1", "bill-1");
    expect(bill?.totalAmountMinor).toBe(150050);
    expect(bill?.revision).toBe(1);

    const next = updateBillWithExpectedRevision(local, "trader", "stall-1", "bill-1", {
      expectedRevision: 1,
      status: "finalized",
      updatedAt: "2026-11-01T01:00:00.000Z",
    });
    expect(next).toBe(2);
    expect(() =>
      updateBillWithExpectedRevision(local, "trader", "stall-1", "bill-1", {
        expectedRevision: 1,
        updatedAt: "2026-11-01T02:00:00.000Z",
      }),
    ).toThrow(RevisionConflictError);
  });

  it("rejects malformed persisted bill money", () => {
    expect(() =>
      mapBillRow(
        {
          id: "b1",
          stall_id: "s1",
          sale_id: "sale",
          trader_id: "t1",
          bill_number: null,
          business_date: "2026-11-01",
          status: "draft",
          revision: 1,
          total_amount_minor: 1.5,
          payment_status: null,
          created_at: "2026-11-01T00:00:00.000Z",
          updated_at: "2026-11-01T00:00:00.000Z",
        },
        "trader",
      ),
    ).toThrow(RowMappingError);
  });

  it("persists idempotency, audit, and outbox atomically", () => {
    const local = track(initializeNewDatabase(tempDbPath("atomic.sqlite")));
    seedBinding(local);

    runInTransaction(local.db, (tx) => {
      insertCompletedIdempotencyRecord(tx, {
        scope: "tenant-1:stall-1:test.command",
        idempotencyKey: "key-1",
        commandType: "test.command",
        requestFingerprint: "fp-1",
        resultRef: "result-1",
        completedAt: "2026-11-01T00:00:00.000Z",
        createdAt: "2026-11-01T00:00:00.000Z",
      });
      appendAuditEvent(tx, {
        id: "audit-1",
        stallId: "stall-1",
        tenantId: "tenant-1",
        action: "test.command",
        occurredAt: "2026-11-01T00:00:00.000Z",
      });
      appendOutboxEvent(tx, {
        eventId: "evt-1",
        tenantId: "tenant-1",
        stallId: "stall-1",
        originatingDeviceId: "device-1",
        eventType: "test.fixture",
        eventSchemaVersion: "1",
        payloadJson: JSON.stringify({ ok: true }),
        occurredAt: "2026-11-01T00:00:00.000Z",
      });
    });

    expect(getIdempotencyRecord(local, "tenant-1:stall-1:test.command", "key-1")?.resultRef).toBe(
      "result-1",
    );
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM sync_outbox`).get() as { c: number },
    ).toEqual({ c: 1 });

    expect(() =>
      runInTransaction(local.db, (tx) => {
        appendAuditEvent(tx, {
          id: "audit-2",
          action: "fail",
          occurredAt: "2026-11-01T00:00:00.000Z",
        });
        throw new Error("force rollback");
      }),
    ).toThrow("force rollback");

    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });
  });

  it("allocates bill sequences without MAX+1 and rejects missing config", () => {
    const local = track(initializeNewDatabase(tempDbPath("seq.sqlite")));
    seedBinding(local);
    expect(() => allocateNextBillSequence(local, "stall-1", "farmer")).toThrow(
      SequenceConfigurationError,
    );

    local.db
      .prepare(
        `INSERT INTO bill_sequences (stall_id, bill_type, next_value) VALUES ('stall-1', 'farmer', 10)`,
      )
      .run();

    const first = runInTransaction(local.db, (tx) =>
      allocateNextBillSequence(tx, "stall-1", "farmer"),
    );
    const second = runInTransaction(local.db, (tx) =>
      allocateNextBillSequence(tx, "stall-1", "farmer"),
    );
    expect(first).toBe(10);
    expect(second).toBe(11);
  });
});
