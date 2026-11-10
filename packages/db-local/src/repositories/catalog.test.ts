import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { RevisionConflictError } from "./types.js";
import {
  getPackageTypeById,
  getVegetableById,
  getVegetableByShortCode,
  insertPackageType,
  insertVegetable,
  searchPackageTypes,
  searchVegetables,
  setPackageTypeActiveWithExpectedRevision,
  setVegetableActiveWithExpectedRevision,
  updatePackageTypeWithExpectedRevision,
  updateVegetableWithExpectedRevision,
} from "./catalog.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-catalog-"));
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

describe("vegetable repositories", () => {
  it("inserts, searches, updates, and toggles status with revision", () => {
    const local = createBoundDb();
    const created = insertVegetable(local, {
      id: "veg-1",
      stallId: "stall-1",
      shortCode: "CB",
      displayName: "කැරට්",
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(created.revision).toBe(1);
    expect(getVegetableByShortCode(local, "stall-1", "CB")?.displayName).toBe("කැරට්");

    updateVegetableWithExpectedRevision(local, "stall-1", "veg-1", {
      expectedRevision: 1,
      displayName: "Carrot",
      updatedAt: "2026-11-09T09:00:00.000Z",
    });
    expect(getVegetableById(local, "stall-1", "veg-1")).toMatchObject({
      displayName: "Carrot",
      revision: 2,
    });

    setVegetableActiveWithExpectedRevision(local, "stall-1", "veg-1", {
      expectedRevision: 2,
      isActive: false,
      updatedAt: "2026-11-09T10:00:00.000Z",
    });
    expect(
      searchVegetables(local, { stallId: "stall-1", active: "active", limit: 10, offset: 0 }).items,
    ).toHaveLength(0);
    expect(
      searchVegetables(local, {
        stallId: "stall-1",
        query: "CB",
        active: "inactive",
        limit: 10,
        offset: 0,
      }).items,
    ).toHaveLength(1);

    expect(() =>
      updateVegetableWithExpectedRevision(local, "stall-1", "veg-1", {
        expectedRevision: 2,
        displayName: "Stale",
        updatedAt: "2026-11-09T11:00:00.000Z",
      }),
    ).toThrow(RevisionConflictError);
  });
});

describe("package type repositories", () => {
  it("inserts and updates package types without tare columns", () => {
    const local = createBoundDb();
    const created = insertPackageType(local, {
      id: "pkg-1",
      stallId: "stall-1",
      shortCode: "BAG",
      displayName: "Bag",
      isActive: true,
      createdAt: "2026-11-09T08:00:00.000Z",
      updatedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(created.revision).toBe(1);
    updatePackageTypeWithExpectedRevision(local, "stall-1", "pkg-1", {
      expectedRevision: 1,
      displayName: "Large bag",
      updatedAt: "2026-11-09T09:00:00.000Z",
    });
    setPackageTypeActiveWithExpectedRevision(local, "stall-1", "pkg-1", {
      expectedRevision: 2,
      isActive: false,
      updatedAt: "2026-11-09T10:00:00.000Z",
    });
    expect(getPackageTypeById(local, "stall-1", "pkg-1")?.isActive).toBe(false);
    expect(
      searchPackageTypes(local, { stallId: "stall-1", active: "all", limit: 10, offset: 0 })
        .items[0]?.displayName,
    ).toBe("Large bag");
  });
});
