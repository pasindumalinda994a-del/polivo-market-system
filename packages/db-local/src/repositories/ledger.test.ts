import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { runInTransaction } from "../transactions.js";
import { insertFarmer, insertBuyer } from "./parties.js";
import {
  DuplicateFinancialEventError,
  accountHasHistoricalOperationalActivity,
  ensurePartyAccount,
  getOpeningDraftById,
  insertOpeningDraft,
  listAccountMovements,
  markOpeningDraftPosted,
  markPartyAccountOpeningComplete,
  postLedgerEntries,
  sumAccountBalanceMinor,
  updateOpeningDraftWithExpectedRevision,
} from "./ledger.js";
import { RevisionConflictError } from "./types.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-ledger-"));
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

function seedFarmer(local: LocalDatabase, id = "farmer-1"): void {
  insertFarmer(local, {
    id,
    stallId: "stall-1",
    shortCode: id.toUpperCase(),
    displayName: "Test Farmer",
    contactNumber: null,
    locality: null,
    isActive: true,
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
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

describe("ledger repositories", () => {
  it("returns zero balance for accounts with no entries", () => {
    const local = createBoundDb();
    seedFarmer(local);
    ensurePartyAccount(local, {
      id: "acct-1",
      stallId: "stall-1",
      partyKind: "farmer",
      partyId: "farmer-1",
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    });
    expect(sumAccountBalanceMinor(local, "stall-1", "farmer", "farmer-1")).toBe(0);
  });

  it("posts immutable opening entries and rejects duplicate sources", () => {
    const local = createBoundDb();
    seedFarmer(local);
    runInTransaction(local.db, (tx) => {
      const result = postLedgerEntries(tx, {
        postingId: "post-1",
        stallId: "stall-1",
        sourceType: "opening_balance",
        sourceId: "draft-1",
        financialEventType: "opening_posted",
        eventSequence: 1,
        businessDate: "2026-11-01",
        recordedAt: "2026-11-09T01:00:00.000Z",
        actorStaffId: "staff-1",
        description: "Opening",
        currency: "LKR",
        entries: [
          {
            entryId: "entry-1",
            partyKind: "farmer",
            partyId: "farmer-1",
            amountMinor: 12_500,
          },
        ],
      });
      expect(result.entries).toHaveLength(1);
      expect(sumAccountBalanceMinor(tx, "stall-1", "farmer", "farmer-1")).toBe(12_500);

      expect(() =>
        postLedgerEntries(tx, {
          postingId: "post-2",
          stallId: "stall-1",
          sourceType: "opening_balance",
          sourceId: "draft-1",
          financialEventType: "opening_posted",
          eventSequence: 1,
          businessDate: "2026-11-01",
          recordedAt: "2026-11-09T01:00:00.000Z",
          actorStaffId: "staff-1",
          description: "Opening",
          currency: "LKR",
          entries: [
            {
              entryId: "entry-2",
              partyKind: "farmer",
              partyId: "farmer-1",
              amountMinor: 12_500,
            },
          ],
        }),
      ).toThrow(DuplicateFinancialEventError);

      expect(() =>
        tx.db.prepare(`UPDATE ledger_postings SET description = 'x' WHERE id = 'post-1'`).run(),
      ).toThrow();
    });
  });

  it("keeps running balances across movement pages", () => {
    const local = createBoundDb();
    seedFarmer(local);
    runInTransaction(local.db, (tx) => {
      for (const [i, amount] of [
        [1, 1000],
        [2, 2000],
        [3, -500],
      ] as const) {
        postLedgerEntries(tx, {
          postingId: `post-${i}`,
          stallId: "stall-1",
          sourceType: "opening_balance",
          sourceId: `src-${i}`,
          financialEventType: "opening_posted",
          eventSequence: 1,
          businessDate: "2026-11-01",
          recordedAt: `2026-11-09T0${i}:00:00.000Z`,
          actorStaffId: null,
          description: null,
          currency: "LKR",
          entries: [
            {
              entryId: `entry-${i}`,
              partyKind: "farmer",
              partyId: "farmer-1",
              amountMinor: amount,
            },
          ],
        });
      }

      const page1 = listAccountMovements(tx, {
        stallId: "stall-1",
        partyKind: "farmer",
        partyId: "farmer-1",
        limit: 2,
      });
      expect(page1.precedingBalanceMinor).toBe(0);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursorSequence).toBe(2);

      const page2 = listAccountMovements(tx, {
        stallId: "stall-1",
        partyKind: "farmer",
        partyId: "farmer-1",
        limit: 2,
        afterSequence: page1.nextCursorSequence ?? 0,
      });
      expect(page2.precedingBalanceMinor).toBe(3000);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]?.amountMinor).toBe(-500);
    });
  });

  it("supports opening draft revision and completion metadata", () => {
    const local = createBoundDb();
    seedFarmer(local);
    ensurePartyAccount(local, {
      id: "acct-1",
      stallId: "stall-1",
      partyKind: "farmer",
      partyId: "farmer-1",
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    });

    const draft = insertOpeningDraft(local, {
      id: "draft-1",
      stallId: "stall-1",
      partyKind: "farmer",
      partyId: "farmer-1",
      direction: "stall_owes_farmer",
      amountMinor: 0,
      signedAmountMinor: null,
      cutoffDate: "2026-11-01",
      reference: null,
      explanation: "Zero opening",
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
      createdByStaffId: "staff-1",
    });
    expect(draft.status).toBe("draft");

    expect(() =>
      updateOpeningDraftWithExpectedRevision(local, {
        stallId: "stall-1",
        draftId: "draft-1",
        expectedRevision: 99,
        direction: "stall_owes_farmer",
        amountMinor: 0,
        signedAmountMinor: null,
        cutoffDate: "2026-11-01",
        reference: null,
        explanation: "stale",
        updatedAt: "2026-11-09T00:01:00.000Z",
      }),
    ).toThrow(RevisionConflictError);

    const posted = markOpeningDraftPosted(local, {
      stallId: "stall-1",
      draftId: "draft-1",
      expectedRevision: 1,
      postingId: null,
      updatedAt: "2026-11-09T00:02:00.000Z",
    });
    expect(posted.status).toBe("posted");
    expect(getOpeningDraftById(local, "stall-1", "draft-1")?.postedPostingId).toBeNull();

    markPartyAccountOpeningComplete(local, {
      stallId: "stall-1",
      partyKind: "farmer",
      partyId: "farmer-1",
      openingStatus: "opened_zero",
      cutoffDate: "2026-11-01",
      completedAt: "2026-11-09T00:02:00.000Z",
      completedByStaffId: "staff-1",
      draftId: "draft-1",
      postingId: null,
      updatedAt: "2026-11-09T00:02:00.000Z",
    });

    expect(accountHasHistoricalOperationalActivity(local, "stall-1", "farmer", "farmer-1")).toBe(
      false,
    );
  });

  it("isolates balances by stall", () => {
    const local = createBoundDb();
    seedFarmer(local);
    insertBuyer(local, {
      id: "buyer-1",
      stallId: "stall-1",
      shortCode: "BUY1",
      displayName: "Buyer",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    });
    runInTransaction(local.db, (tx) => {
      postLedgerEntries(tx, {
        postingId: "post-buyer",
        stallId: "stall-1",
        sourceType: "opening_balance",
        sourceId: "draft-buyer",
        financialEventType: "opening_posted",
        eventSequence: 1,
        businessDate: "2026-11-01",
        recordedAt: "2026-11-09T01:00:00.000Z",
        actorStaffId: null,
        description: null,
        currency: "LKR",
        entries: [
          {
            entryId: "entry-buyer",
            partyKind: "trader",
            partyId: "buyer-1",
            amountMinor: 5_000,
          },
        ],
      });
      expect(sumAccountBalanceMinor(tx, "stall-1", "trader", "buyer-1")).toBe(5_000);
      expect(sumAccountBalanceMinor(tx, "stall-1", "farmer", "farmer-1")).toBe(0);
    });
  });
});
