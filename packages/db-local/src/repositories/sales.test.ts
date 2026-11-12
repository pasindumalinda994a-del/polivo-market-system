import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { insertPackageType, insertVegetable } from "./catalog.js";
import { insertBuyer, insertFarmer } from "./parties.js";
import { RevisionConflictError } from "./types.js";
import { getSaleById, insertSaleDraft, replaceSaleDraftWithExpectedRevision } from "./sales.js";
import {
  allocateNextBillSequence,
  ensureBillSequencesForStall,
  TRADER_BILL_SEQUENCE_START,
} from "./sequences.js";
import { runInTransaction } from "../transactions.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-sales-"));
  tempRoots.push(root);
  const local = track(initializeNewDatabase(join(root, "test.sqlite")));
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, 'stall-1', 'tenant-1', '2026-11-10T00:00:00.000Z')`,
    )
    .run();
  return local;
}

function seedMasters(local: LocalDatabase): void {
  insertFarmer(local, {
    id: "farmer-1",
    stallId: "stall-1",
    shortCode: "F1",
    displayName: "Farmer One",
    contactNumber: null,
    locality: null,
    isActive: true,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  });
  insertBuyer(local, {
    id: "trader-1",
    stallId: "stall-1",
    shortCode: "T1",
    displayName: "Buyer One",
    contactNumber: null,
    locality: null,
    isActive: true,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  });
  insertVegetable(local, {
    id: "veg-1",
    stallId: "stall-1",
    shortCode: "CARROT",
    displayName: "Carrot",
    isActive: true,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  });
  insertPackageType(local, {
    id: "pkg-1",
    stallId: "stall-1",
    shortCode: "BAG",
    displayName: "Bag",
    isActive: true,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  });
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

describe("sales repositories", () => {
  it("persists drafts without financial effects and enforces revision conflicts", () => {
    const local = createBoundDb();
    seedMasters(local);

    const created = insertSaleDraft(local, {
      id: "sale-1",
      stallId: "stall-1",
      traderId: "trader-1",
      businessDate: "2026-11-10",
      lines: [
        {
          id: "line-1",
          farmerId: "farmer-1",
          vegetableId: "veg-1",
          packageTypeId: "pkg-1",
          unitPricePerKgMinor: 25_000,
          packagingWeightHundredths: 0,
          notes: null,
          weights: [
            {
              id: "w1",
              rowKey: "a",
              packageIndex: 1,
              grossWeightHundredths: 4_000,
            },
            {
              id: "w2",
              rowKey: "b",
              packageIndex: 2,
              grossWeightHundredths: 6_000,
            },
          ],
        },
      ],
      createdAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
    });

    expect(created.status).toBe("draft");
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0]!.weights).toHaveLength(2);
    expect(created.totalSaleAmountMinor).toBeNull();
    expect(created.calculationFingerprint).toBeNull();

    const postingCount = local.db.prepare(`SELECT COUNT(*) AS c FROM ledger_postings`).get() as {
      c: number;
    };
    expect(postingCount.c).toBe(0);

    expect(() =>
      replaceSaleDraftWithExpectedRevision(local, {
        stallId: "stall-1",
        saleId: "sale-1",
        expectedRevision: 99,
        traderId: "trader-1",
        businessDate: "2026-11-10",
        lines: [],
        updatedAt: "2026-11-10T01:00:00.000Z",
      }),
    ).toThrow(RevisionConflictError);

    const updated = replaceSaleDraftWithExpectedRevision(local, {
      stallId: "stall-1",
      saleId: "sale-1",
      expectedRevision: 1,
      traderId: "trader-1",
      businessDate: "2026-11-10",
      lines: [
        {
          id: "line-2",
          farmerId: "farmer-1",
          vegetableId: "veg-1",
          packageTypeId: "pkg-1",
          unitPricePerKgMinor: 20_000,
          packagingWeightHundredths: 0,
          notes: "note",
          weights: [
            {
              id: "w3",
              rowKey: "c",
              packageIndex: 1,
              grossWeightHundredths: 1_000,
            },
          ],
        },
      ],
      updatedAt: "2026-11-10T01:00:00.000Z",
    });
    expect(updated.revision).toBe(2);
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]!.id).toBe("line-2");
    expect(getSaleById(local, "stall-1", "sale-1")?.lines[0]?.notes).toBe("note");
  });

  it("seeds trader sequence at 444444 and allocates uniquely inside a transaction", () => {
    const local = createBoundDb();
    ensureBillSequencesForStall(local, "stall-1");
    const first = runInTransaction(local.db, (tx) =>
      allocateNextBillSequence(tx, "stall-1", "trader"),
    );
    const second = runInTransaction(local.db, (tx) =>
      allocateNextBillSequence(tx, "stall-1", "trader"),
    );
    expect(first).toBe(TRADER_BILL_SEQUENCE_START);
    expect(second).toBe(TRADER_BILL_SEQUENCE_START + 1);
  });
});
