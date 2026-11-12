import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { runInTransaction } from "../transactions.js";
import { insertBuyer } from "./parties.js";
import {
  captureReportingWatermarks,
  listStatementMovementsPage,
  listStatementPeriodAmounts,
  sumStatementOpeningBalanceMinor,
} from "./account-statements.js";
import { ensurePartyAccount, postLedgerEntries } from "./ledger.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-statements-"));
  tempRoots.push(root);
  const local = track(initializeNewDatabase(join(root, "test.sqlite")));
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, 'stall-1', 'tenant-1', '2026-11-09T00:00:00.000Z')`,
    )
    .run();
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

describe("account statement repositories", () => {
  it("computes opening before period and paginates running balances without double-counting openings", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "buyer-1",
      stallId: "stall-1",
      shortCode: "B1",
      displayName: "Buyer One",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    ensurePartyAccount(local, {
      id: "acct-1",
      stallId: "stall-1",
      partyKind: "trader",
      partyId: "buyer-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-open",
        stallId: "stall-1",
        sourceType: "opening_balance",
        sourceId: "draft-1",
        financialEventType: "opening_posted",
        eventSequence: 1,
        businessDate: "2025-12-15",
        recordedAt: "2025-12-15T00:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Imported opening",
        currency: "LKR",
        entries: [
          {
            entryId: "entry-open",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: 200_000,
          },
        ],
      });
      postLedgerEntries(tx, {
        postingId: "post-sale",
        stallId: "stall-1",
        sourceType: "sale",
        sourceId: "sale-1",
        financialEventType: "sale_finalized",
        eventSequence: 1,
        businessDate: "2026-01-10",
        recordedAt: "2026-01-10T00:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Sale",
        currency: "LKR",
        entries: [
          {
            entryId: "entry-sale",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: 1_000_000,
          },
        ],
      });
      postLedgerEntries(tx, {
        postingId: "post-pay",
        stallId: "stall-1",
        sourceType: "payment",
        sourceId: "pay-1",
        financialEventType: "payment_posted",
        eventSequence: 1,
        businessDate: "2026-01-10",
        recordedAt: "2026-01-10T01:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Receipt",
        currency: "LKR",
        entries: [
          {
            entryId: "entry-pay",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: -400_000,
          },
        ],
      });
    });

    const watermarks = captureReportingWatermarks(local, "stall-1");
    expect(watermarks.maxPostingSequence).toBeGreaterThan(0);

    const opening = sumStatementOpeningBalanceMinor(
      local,
      "stall-1",
      "trader",
      "buyer-1",
      "2026-01-01",
      watermarks.maxPostingSequence,
    );
    expect(opening).toBe(200_000);

    const amounts = listStatementPeriodAmounts(
      local,
      "stall-1",
      "trader",
      "buyer-1",
      "2026-01-01",
      "2026-01-31",
      watermarks.maxPostingSequence,
    );
    expect(amounts).toEqual([1_000_000, -400_000]);

    const page1 = listStatementMovementsPage(local, {
      stallId: "stall-1",
      partyKind: "trader",
      partyId: "buyer-1",
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-31",
      maxPostingSequence: watermarks.maxPostingSequence,
      limit: 1,
    });
    expect(page1.precedingBalanceMinor).toBe(200_000);
    expect(page1.items).toHaveLength(1);
    expect(page1.hasMore).toBe(true);

    const page2 = listStatementMovementsPage(local, {
      stallId: "stall-1",
      partyKind: "trader",
      partyId: "buyer-1",
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-31",
      maxPostingSequence: watermarks.maxPostingSequence,
      limit: 1,
      afterBusinessDate: page1.items[0]!.businessDate,
      afterPostingSequence: page1.items[0]!.postingSequence,
      afterEntryId: page1.items[0]!.entryId,
    });
    expect(page2.precedingBalanceMinor).toBe(1_200_000);
    expect(page2.items[0]!.amountMinor).toBe(-400_000);
  });

  it("keeps snapshot watermarks stable while later postings exist", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "buyer-1",
      stallId: "stall-1",
      shortCode: "B1",
      displayName: "Buyer One",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    ensurePartyAccount(local, {
      id: "acct-1",
      stallId: "stall-1",
      partyKind: "trader",
      partyId: "buyer-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-1",
        stallId: "stall-1",
        sourceType: "sale",
        sourceId: "sale-1",
        financialEventType: "sale_finalized",
        eventSequence: 1,
        businessDate: "2026-01-10",
        recordedAt: "2026-01-10T00:00:00.000Z",
        actorStaffId: "staff-1",
        description: null,
        currency: "LKR",
        entries: [
          {
            entryId: "entry-1",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: 100_000,
          },
        ],
      });
    });

    const snap = captureReportingWatermarks(local, "stall-1");

    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-2",
        stallId: "stall-1",
        sourceType: "sale",
        sourceId: "sale-2",
        financialEventType: "sale_finalized",
        eventSequence: 1,
        businessDate: "2026-01-11",
        recordedAt: "2026-01-11T00:00:00.000Z",
        actorStaffId: "staff-1",
        description: null,
        currency: "LKR",
        entries: [
          {
            entryId: "entry-2",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: 50_000,
          },
        ],
      });
    });

    const page = listStatementMovementsPage(local, {
      stallId: "stall-1",
      partyKind: "trader",
      partyId: "buyer-1",
      fromBusinessDate: "2026-01-01",
      toBusinessDate: "2026-01-31",
      maxPostingSequence: snap.maxPostingSequence,
      limit: 20,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.amountMinor).toBe(100_000);
  });
});
