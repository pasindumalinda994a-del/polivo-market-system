import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { applyPendingMigrations, getMigrationStatus } from "../migrations/runner.js";
import { loadBundledMigrations } from "../migrations/registry.js";
import { applyRuntimePragmas, SQLITE_BUSY_TIMEOUT_MS } from "../pragmas.js";
import { runInTransaction } from "../transactions.js";
import { insertBuyer } from "./parties.js";
import { postLedgerEntries } from "./ledger.js";
import {
  allocateNextPaymentSequence,
  ensurePaymentSequencesForStall,
  PAYMENT_SEQUENCE_START,
} from "./sequences.js";
import {
  getPaymentById,
  insertPayment,
  insertPaymentAllocation,
  markPaymentReversed,
  reverseActiveAllocationsForPayment,
  sumActiveAllocatedForObligation,
  sumActiveAllocatedForPayment,
} from "./payments.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-payments-"));
  tempRoots.push(root);
  const local = track(initializeNewDatabase(join(root, "test.sqlite")));
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, 'stall-1', 'tenant-1', '2026-11-11T00:00:00.000Z')`,
    )
    .run();
  return local;
}

function seedTraderBill(
  local: LocalDatabase,
  bill: { id: string; saleId: string; totalMinor: number },
): void {
  local.db
    .prepare(
      `INSERT INTO sales (
         id, stall_id, trader_id, business_date, status, revision, created_at, updated_at
       ) VALUES (?, 'stall-1', 'trader-1', '2026-11-01', 'finalized', 1, ?, ?)`,
    )
    .run(bill.saleId, "2026-11-11T00:00:00.000Z", "2026-11-11T00:00:00.000Z");
  local.db
    .prepare(
      `INSERT INTO trader_bills (
         id, stall_id, sale_id, trader_id, bill_number, business_date, status, revision,
         total_amount_minor, payment_status, created_at, updated_at, correction_status
       ) VALUES (?, 'stall-1', ?, 'trader-1', '444444', '2026-11-01', 'finalized', 1,
         ?, 'unpaid', ?, ?, 'active')`,
    )
    .run(
      bill.id,
      bill.saleId,
      bill.totalMinor,
      "2026-11-11T00:00:00.000Z",
      "2026-11-11T00:00:00.000Z",
    );
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

describe("payments repository", () => {
  it("applies migration 012 with payment sequences and 013 cheque columns", () => {
    const local = createBoundDb();
    const status = getMigrationStatus(local.db);
    expect(status.applied.some((m) => m.id === "012")).toBe(true);
    expect(status.applied.some((m) => m.id === "013")).toBe(true);
    const table = local.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payment_sequences'`)
      .get() as { name: string } | undefined;
    expect(table?.name).toBe("payment_sequences");
    const columns = local.db.prepare(`PRAGMA table_info(payments)`).all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "cheque_number",
        "issuing_bank_label",
        "cheque_date",
        "physical_handover_date",
      ]),
    );
    ensurePaymentSequencesForStall(local, "stall-1");
    const row = local.db
      .prepare(
        `SELECT next_value FROM payment_sequences
         WHERE stall_id = 'stall-1' AND payment_type = 'receipt'`,
      )
      .get() as { next_value: number } | undefined;
    expect(row?.next_value).toBe(PAYMENT_SEQUENCE_START);
  });

  it("inserts payment and allocation, tracks available and obligation remainder", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "trader-1",
      stallId: "stall-1",
      shortCode: "T1",
      displayName: "Buyer One",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-11T00:00:00.000Z",
      updatedAt: "2026-11-11T00:00:00.000Z",
    });
    seedTraderBill(local, { id: "tb-1", saleId: "sale-1", totalMinor: 50_000 });

    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-pay-1",
        stallId: "stall-1",
        sourceType: "payment",
        sourceId: "pay-1",
        financialEventType: "payment_posted",
        eventSequence: 1,
        businessDate: "2026-11-11",
        recordedAt: "2026-11-11T12:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Receipt",
        currency: "LKR",
        entries: [
          { entryId: "entry-1", partyKind: "trader", partyId: "trader-1", amountMinor: -20_000 },
        ],
      });

      ensurePaymentSequencesForStall(tx, "stall-1");
      const seq = allocateNextPaymentSequence(tx, "stall-1", "receipt");
      expect(seq).toBe(PAYMENT_SEQUENCE_START);

      insertPayment(tx, {
        id: "pay-1",
        stallId: "stall-1",
        partyKind: "trader",
        farmerId: null,
        traderId: "trader-1",
        direction: "receive",
        method: "cash",
        amountMinor: 20_000,
        businessDate: "2026-11-11",
        referenceNumber: `R-${seq}`,
        status: "posted",
        paidAt: "2026-11-11T12:00:00.000Z",
        recordedAt: "2026-11-11T12:00:00.000Z",
        actorStaffId: "staff-1",
        postingId: "post-pay-1",
        createdAt: "2026-11-11T12:00:00.000Z",
      });

      insertPaymentAllocation(tx, {
        id: "alloc-1",
        stallId: "stall-1",
        paymentId: "pay-1",
        obligationKind: "trader_bill",
        traderBillId: "tb-1",
        appliedAmountMinor: 12_000,
        createdAt: "2026-11-11T12:00:01.000Z",
      });
    });

    const payment = getPaymentById(local, "stall-1", "pay-1");
    expect(payment?.allocations).toHaveLength(1);
    expect(sumActiveAllocatedForPayment(local, "stall-1", "pay-1")).toBe(12_000);
    expect(20_000 - sumActiveAllocatedForPayment(local, "stall-1", "pay-1")).toBe(8_000);

    expect(sumActiveAllocatedForObligation(local, "stall-1", "trader_bill", "tb-1")).toBe(12_000);
    expect(50_000 - sumActiveAllocatedForObligation(local, "stall-1", "trader_bill", "tb-1")).toBe(
      38_000,
    );
  });

  it("reverses payment status and active allocations", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "trader-1",
      stallId: "stall-1",
      shortCode: "T1",
      displayName: "Buyer One",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-11T00:00:00.000Z",
      updatedAt: "2026-11-11T00:00:00.000Z",
    });
    seedTraderBill(local, { id: "tb-1", saleId: "sale-1", totalMinor: 10_000 });

    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-pay-1",
        stallId: "stall-1",
        sourceType: "payment",
        sourceId: "pay-1",
        financialEventType: "payment_posted",
        eventSequence: 1,
        businessDate: "2026-11-11",
        recordedAt: "2026-11-11T12:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Receipt",
        currency: "LKR",
        entries: [
          { entryId: "entry-1", partyKind: "trader", partyId: "trader-1", amountMinor: -5_000 },
        ],
      });
      postLedgerEntries(tx, {
        postingId: "post-rev-1",
        stallId: "stall-1",
        sourceType: "payment",
        sourceId: "pay-rev-1",
        financialEventType: "payment_reversed",
        eventSequence: 1,
        businessDate: "2026-11-11",
        recordedAt: "2026-11-11T13:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Reversal",
        currency: "LKR",
        entries: [
          { entryId: "entry-2", partyKind: "trader", partyId: "trader-1", amountMinor: 5_000 },
        ],
      });

      insertPayment(tx, {
        id: "pay-1",
        stallId: "stall-1",
        partyKind: "trader",
        farmerId: null,
        traderId: "trader-1",
        direction: "receive",
        method: "cash",
        amountMinor: 5_000,
        businessDate: "2026-11-11",
        referenceNumber: "R-100001",
        status: "posted",
        paidAt: "2026-11-11T12:00:00.000Z",
        recordedAt: "2026-11-11T12:00:00.000Z",
        actorStaffId: "staff-1",
        postingId: "post-pay-1",
        createdAt: "2026-11-11T12:00:00.000Z",
      });
      insertPayment(tx, {
        id: "pay-rev-1",
        stallId: "stall-1",
        partyKind: "trader",
        farmerId: null,
        traderId: "trader-1",
        direction: "receive",
        method: "cash",
        amountMinor: 5_000,
        businessDate: "2026-11-11",
        referenceNumber: "R-100002",
        status: "posted",
        paidAt: "2026-11-11T13:00:00.000Z",
        recordedAt: "2026-11-11T13:00:00.000Z",
        actorStaffId: "staff-1",
        postingId: "post-rev-1",
        reversesPaymentId: "pay-1",
        createdAt: "2026-11-11T13:00:00.000Z",
      });
      insertPaymentAllocation(tx, {
        id: "alloc-1",
        stallId: "stall-1",
        paymentId: "pay-1",
        obligationKind: "trader_bill",
        traderBillId: "tb-1",
        appliedAmountMinor: 5_000,
        createdAt: "2026-11-11T12:00:01.000Z",
      });

      reverseActiveAllocationsForPayment(tx, "stall-1", "pay-1");
      markPaymentReversed(tx, {
        stallId: "stall-1",
        originalPaymentId: "pay-1",
        reversalPaymentId: "pay-rev-1",
      });
    });

    expect(sumActiveAllocatedForPayment(local, "stall-1", "pay-1")).toBe(0);
    expect(sumActiveAllocatedForObligation(local, "stall-1", "trader_bill", "tb-1")).toBe(0);
    const original = getPaymentById(local, "stall-1", "pay-1");
    expect(original?.status).toBe("reversed");
    expect(original?.reversedByPaymentId).toBe("pay-rev-1");
    expect(original?.allocations[0]?.status).toBe("reversed");
  });

  it("applies migration 013 over existing payment and allocation rows with FK enforced", () => {
    const root = mkdtempSync(join(tmpdir(), "polivo-pay-upgrade-"));
    tempRoots.push(root);
    const path = join(root, "upgrade.sqlite");
    const db = new DatabaseSync(path, {
      readOnly: false,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      timeout: SQLITE_BUSY_TIMEOUT_MS,
    });
    applyRuntimePragmas(db);

    const bundled = loadBundledMigrations();
    const through012 = bundled.filter((migration) => migration.id <= "012");
    expect(through012.some((migration) => migration.id === "012")).toBe(true);
    expect(through012.some((migration) => migration.id === "013")).toBe(false);
    applyPendingMigrations(db, through012);

    const now = "2026-11-11T12:00:00.000Z";
    db.prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, 'stall-1', 'tenant-1', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO traders (
         id, stall_id, short_code, display_name, contact_number, locality, is_active,
         created_at, updated_at, revision
       ) VALUES ('trader-1', 'stall-1', 'T1', 'Buyer One', NULL, NULL, 1, ?, ?, 1)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO sales (
         id, stall_id, trader_id, business_date, status, revision, created_at, updated_at
       ) VALUES ('sale-1', 'stall-1', 'trader-1', '2026-11-01', 'finalized', 1, ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO trader_bills (
         id, stall_id, sale_id, trader_id, bill_number, business_date, status, revision,
         total_amount_minor, payment_status, created_at, updated_at, correction_status
       ) VALUES (
         'tb-1', 'stall-1', 'sale-1', 'trader-1', '444444', '2026-11-01', 'finalized', 1,
         50000, 'partially_paid', ?, ?, 'active'
       )`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO ledger_postings (
         id, stall_id, source_type, source_id, financial_event_type, event_sequence,
         business_date, recorded_at, actor_staff_id, description, currency
       ) VALUES (
         'post-pay-1', 'stall-1', 'payment', 'pay-1', 'payment_posted', 1,
         '2026-11-11', ?, 'staff-1', 'Receipt', 'LKR'
       )`,
    ).run(now);
    db.prepare(
      `INSERT INTO ledger_entries (
         id, stall_id, posting_id, party_kind, party_id, amount_minor, currency,
         posting_sequence, reverses_entry_id
       ) VALUES (
         'entry-1', 'stall-1', 'post-pay-1', 'trader', 'trader-1', -20000, 'LKR', 1, NULL
       )`,
    ).run();
    // Phase 26 payments schema (no cheque columns yet).
    db.prepare(
      `INSERT INTO payments (
         id, stall_id, party_kind, farmer_id, trader_id, direction, method, amount_minor,
         currency, business_date, reference_number, status, paid_at, recorded_at, actor_staff_id,
         posting_id, reverses_payment_id, reversed_by_payment_id, bank_transfer_reference,
         bank_transfer_date, bank_account_label, note, created_at
       ) VALUES (
         'pay-1', 'stall-1', 'trader', NULL, 'trader-1', 'receive', 'cash', 20000,
         'LKR', '2026-11-11', 'R-100001', 'posted', ?, ?, 'staff-1',
         'post-pay-1', NULL, NULL, NULL, NULL, NULL, NULL, ?
       )`,
    ).run(now, now, now);
    db.prepare(
      `INSERT INTO payment_allocations (
         id, stall_id, payment_id, obligation_kind, trader_bill_id, sale_line_id,
         opening_draft_id, farmer_bill_id, applied_amount_minor, status, reverses_allocation_id,
         created_at
       ) VALUES (
         'alloc-1', 'stall-1', 'pay-1', 'trader_bill', 'tb-1', NULL, NULL, NULL,
         12000, 'active', NULL, ?
       )`,
    ).run(now);

    expect(db.prepare(`SELECT COUNT(*) AS c FROM payments`).get() as { c: number }).toEqual({
      c: 1,
    });
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM payment_allocations`).get() as { c: number },
    ).toEqual({ c: 1 });

    // Reproduces acceptance failure if 013 drops payments while allocations still reference it.
    expect(() => applyPendingMigrations(db, bundled)).not.toThrow();

    const status = getMigrationStatus(db, bundled);
    expect(status.applied.some((migration) => migration.id === "013")).toBe(true);
    expect(status.pending).toHaveLength(0);

    const payment = db
      .prepare(
        `SELECT id, method, amount_minor, cheque_number, issuing_bank_label,
                cheque_date, physical_handover_date
         FROM payments WHERE id = 'pay-1'`,
      )
      .get() as Record<string, unknown>;
    expect(payment).toMatchObject({
      id: "pay-1",
      method: "cash",
      amount_minor: 20_000,
      cheque_number: null,
      issuing_bank_label: null,
      cheque_date: null,
      physical_handover_date: null,
    });
    const allocation = db
      .prepare(
        `SELECT id, payment_id, applied_amount_minor, status
         FROM payment_allocations WHERE id = 'alloc-1'`,
      )
      .get() as Record<string, unknown>;
    expect(allocation).toMatchObject({
      id: "alloc-1",
      payment_id: "pay-1",
      applied_amount_minor: 12_000,
      status: "active",
    });

    db.close();
  });
});
