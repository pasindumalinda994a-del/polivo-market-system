import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { RevisionConflictError } from "./types.js";
import {
  escapeLikePattern,
  getBuyerById,
  getBuyerByShortCode,
  getFarmerById,
  getFarmerByShortCode,
  getTraderById,
  insertBuyer,
  insertFarmer,
  searchBuyers,
  searchFarmers,
  setBuyerActiveWithExpectedRevision,
  setFarmerActiveWithExpectedRevision,
  updateBuyerWithExpectedRevision,
  updateFarmerWithExpectedRevision,
} from "./parties.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-parties-"));
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

describe("farmer repositories", () => {
  it("inserts, reads by id and short code, and supports Sinhala names", () => {
    const local = createBoundDb();
    const created = insertFarmer(local, {
      id: "farmer-a",
      stallId: "stall-1",
      shortCode: "F10",
      displayName: "කමල් Perera",
      contactNumber: "0712345678",
      locality: "Dambulla",
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(created.revision).toBe(1);
    expect(created.displayName).toBe("කමල් Perera");
    expect(getFarmerByShortCode(local, "stall-1", "F10")?.id).toBe("farmer-a");
    expect(getFarmerById(local, "stall-1", "farmer-a")?.contactNumber).toBe("0712345678");
  });

  it("enforces unique short codes including inactive rows", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "f1",
      stallId: "stall-1",
      shortCode: "DUP",
      displayName: "One",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    setFarmerActiveWithExpectedRevision(local, "stall-1", "f1", {
      expectedRevision: 1,
      isActive: false,
      updatedAt: "2026-11-09T08:01:00.000Z",
    });
    expect(() =>
      insertFarmer(local, {
        id: "f2",
        stallId: "stall-1",
        shortCode: "DUP",
        displayName: "Two",
        contactNumber: null,
        locality: null,
        isActive: true,
        createdAt: "2026-11-09T08:02:00.000Z",
        updatedAt: "2026-11-09T08:02:00.000Z",
      }),
    ).toThrow();
  });

  it("allows duplicate display names as separate records", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "f1",
      stallId: "stall-1",
      shortCode: "A1",
      displayName: "Same Name",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    insertFarmer(local, {
      id: "f2",
      stallId: "stall-1",
      shortCode: "A2",
      displayName: "Same Name",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    const result = searchFarmers(local, {
      stallId: "stall-1",
      query: "Same Name",
      active: "active",
      limit: 20,
      offset: 0,
    });
    expect(result.items).toHaveLength(2);
  });

  it("ranks exact short-code matches first and escapes LIKE metacharacters", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "f1",
      stallId: "stall-1",
      shortCode: "AB",
      displayName: "Prefix",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    insertFarmer(local, {
      id: "f2",
      stallId: "stall-1",
      shortCode: "ABC",
      displayName: "Longer",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    insertFarmer(local, {
      id: "f3",
      stallId: "stall-1",
      shortCode: "X100",
      displayName: "100% literal_name",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });

    const exact = searchFarmers(local, {
      stallId: "stall-1",
      query: "AB",
      active: "all",
      limit: 10,
      offset: 0,
    });
    expect(exact.items[0]?.shortCode).toBe("AB");
    expect(exact.items.map((row) => row.shortCode)).toEqual(["AB", "ABC"]);

    expect(escapeLikePattern("100%_x\\y")).toBe("100\\%\\_x\\\\y");
    const literal = searchFarmers(local, {
      stallId: "stall-1",
      query: "100%",
      active: "active",
      limit: 10,
      offset: 0,
    });
    expect(literal.items).toHaveLength(1);
    expect(literal.items[0]?.id).toBe("f3");
  });

  it("updates and clears optional fields with revision checks", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "f1",
      stallId: "stall-1",
      shortCode: "F1",
      displayName: "One",
      contactNumber: "0711111111",
      locality: "Town",
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });

    const revision = updateFarmerWithExpectedRevision(local, "stall-1", "f1", {
      expectedRevision: 1,
      displayName: "Updated",
      contactNumber: null,
      locality: null,
      updatedAt: "2026-11-09T08:05:00.000Z",
    });
    expect(revision).toBe(2);
    const updated = getFarmerById(local, "stall-1", "f1");
    expect(updated?.displayName).toBe("Updated");
    expect(updated?.contactNumber).toBeNull();
    expect(updated?.locality).toBeNull();

    expect(() =>
      updateFarmerWithExpectedRevision(local, "stall-1", "f1", {
        expectedRevision: 1,
        displayName: "Stale",
        updatedAt: "2026-11-09T08:06:00.000Z",
      }),
    ).toThrow(RevisionConflictError);
    expect(getFarmerById(local, "stall-1", "f1")?.displayName).toBe("Updated");
  });

  it("excludes inactive farmers from active search by default filter", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "f1",
      stallId: "stall-1",
      shortCode: "F1",
      displayName: "Active",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    insertFarmer(local, {
      id: "f2",
      stallId: "stall-1",
      shortCode: "F2",
      displayName: "Inactive",
      contactNumber: null,
      locality: null,
      isActive: false,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(
      searchFarmers(local, {
        stallId: "stall-1",
        active: "active",
        limit: 20,
        offset: 0,
      }).items.map((row) => row.id),
    ).toEqual(["f1"]);
    expect(
      searchFarmers(local, {
        stallId: "stall-1",
        active: "inactive",
        limit: 20,
        offset: 0,
      }).items.map((row) => row.id),
    ).toEqual(["f2"]);
  });
});

describe("buyer repositories", () => {
  const stamp = "2026-11-09T08:00:00.000Z";

  it("stores buyers on traders and keeps farmer codes independent", () => {
    const local = createBoundDb();
    insertFarmer(local, {
      id: "farmer-a",
      stallId: "stall-1",
      shortCode: "TB1",
      displayName: "Farmer Same Code",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const created = insertBuyer(local, {
      id: "buyer-a",
      stallId: "stall-1",
      shortCode: "TB1",
      displayName: "ටෙස්ට් වෙළෙන්දා",
      contactNumber: "0712345678",
      locality: "Dambulla",
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    expect(created.revision).toBe(1);
    expect(created.contactNumber).toBe("0712345678");
    expect(getBuyerByShortCode(local, "stall-1", "TB1")?.id).toBe("buyer-a");
    expect(getBuyerById(local, "stall-1", "farmer-a")).toBeNull();
    expect(getTraderById(local, "stall-1", "buyer-a")).toMatchObject({
      id: "buyer-a",
      shortCode: "TB1",
      displayName: "ටෙස්ට් වෙළෙන්දා",
    });
  });

  it("rejects a duplicate buyer code including inactive rows and allows duplicate names", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "b1",
      stallId: "stall-1",
      shortCode: "DUP",
      displayName: "Same Name",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    setBuyerActiveWithExpectedRevision(local, "stall-1", "b1", {
      expectedRevision: 1,
      isActive: false,
      updatedAt: "2026-11-09T08:01:00.000Z",
    });
    expect(() =>
      insertBuyer(local, {
        id: "b2",
        stallId: "stall-1",
        shortCode: "DUP",
        displayName: "Other",
        contactNumber: null,
        locality: null,
        isActive: true,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    ).toThrow();
    const named = insertBuyer(local, {
      id: "b3",
      stallId: "stall-1",
      shortCode: "OTHER",
      displayName: "Same Name",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    expect(named.displayName).toBe("Same Name");
  });

  it("ranks exact codes, treats search metacharacters as literals, and filters status", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "b1",
      stallId: "stall-1",
      shortCode: "AB",
      displayName: "Prefix",
      contactNumber: null,
      locality: null,
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    insertBuyer(local, {
      id: "b2",
      stallId: "stall-1",
      shortCode: "ABC",
      displayName: "100%_literal",
      contactNumber: null,
      locality: null,
      isActive: false,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const exact = searchBuyers(local, {
      stallId: "stall-1",
      query: "AB",
      active: "all",
      limit: 10,
      offset: 0,
    });
    expect(exact.items.map((row) => row.shortCode)).toEqual(["AB", "ABC"]);

    const literal = searchBuyers(local, {
      stallId: "stall-1",
      query: "100%_",
      active: "all",
      limit: 10,
      offset: 0,
    });
    expect(literal.items.map((row) => row.id)).toEqual(["b2"]);
    expect(
      searchBuyers(local, { stallId: "stall-1", active: "active", limit: 20, offset: 0 }).items.map(
        (row) => row.id,
      ),
    ).toEqual(["b1"]);
  });

  it("clears optional fields, preserves a stale revision, and keeps bill references", () => {
    const local = createBoundDb();
    insertBuyer(local, {
      id: "buyer-1",
      stallId: "stall-1",
      shortCode: "TB1",
      displayName: "Test Trader A",
      contactNumber: "0712345678",
      locality: "Town",
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    });
    local.db
      .prepare(
        `INSERT INTO sales (id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
         VALUES ('sale-1', 'stall-1', 'buyer-1', '2026-11-09', 'draft', 1, ?, ?)`,
      )
      .run(stamp, stamp);
    local.db
      .prepare(
        `INSERT INTO trader_bills (
           id, stall_id, sale_id, trader_id, bill_number, business_date, status,
           revision, total_amount_minor, payment_status, created_at, updated_at
         ) VALUES ('bill-1', 'stall-1', 'sale-1', 'buyer-1', NULL, '2026-11-09', 'draft',
                   1, NULL, NULL, ?, ?)`,
      )
      .run(stamp, stamp);

    const revision = updateBuyerWithExpectedRevision(local, "stall-1", "buyer-1", {
      expectedRevision: 1,
      contactNumber: null,
      locality: null,
      updatedAt: "2026-11-09T08:05:00.000Z",
    });
    expect(revision).toBe(2);
    expect(getBuyerById(local, "stall-1", "buyer-1")).toMatchObject({
      contactNumber: null,
      locality: null,
      displayName: "Test Trader A",
    });
    expect(() =>
      updateBuyerWithExpectedRevision(local, "stall-1", "buyer-1", {
        expectedRevision: 1,
        displayName: "Stale",
        updatedAt: "2026-11-09T08:06:00.000Z",
      }),
    ).toThrow(RevisionConflictError);
    expect(getBuyerById(local, "stall-1", "buyer-1")?.displayName).toBe("Test Trader A");

    setBuyerActiveWithExpectedRevision(local, "stall-1", "buyer-1", {
      expectedRevision: 2,
      isActive: false,
      updatedAt: "2026-11-09T08:07:00.000Z",
    });
    expect(local.db.prepare(`SELECT trader_id FROM sales WHERE id = 'sale-1'`).get()).toEqual({
      trader_id: "buyer-1",
    });
    expect(
      local.db.prepare(`SELECT trader_id FROM trader_bills WHERE id = 'bill-1'`).get(),
    ).toEqual({ trader_id: "buyer-1" });
    expect(getBuyerById(local, "stall-1", "buyer-1")).toMatchObject({
      id: "buyer-1",
      shortCode: "TB1",
      isActive: false,
    });
  });
});
