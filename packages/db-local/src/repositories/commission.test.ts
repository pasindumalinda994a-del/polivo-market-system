import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { runInTransaction } from "../transactions.js";
import { RevisionConflictError } from "./types.js";
import {
  activateCommissionPolicyWithExpectedRevision,
  ensureCommissionPolicyState,
  getCommissionBandSetById,
  getCommissionPolicyState,
  listCommissionBandsForSet,
  listCommissionVersions,
} from "./commission.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-commission-"));
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

const SAMPLE_BANDS = [
  {
    id: "band-low",
    minPricePerKgMinor: 0,
    maxPricePerKgMinor: 19_999,
    ratePerKgMinor: 500,
  },
  {
    id: "band-mid",
    minPricePerKgMinor: 20_000,
    maxPricePerKgMinor: 40_000,
    ratePerKgMinor: 1_500,
  },
  {
    id: "band-high",
    minPricePerKgMinor: 40_001,
    maxPricePerKgMinor: null,
    ratePerKgMinor: 5_000,
  },
] as const;

describe("commission policy repositories", () => {
  it("starts unconfigured and activates an immutable version", () => {
    const local = createBoundDb();
    const state = ensureCommissionPolicyState(local, "stall-1", "2026-11-09T08:00:00.000Z");
    expect(state).toMatchObject({
      activeBandSetId: null,
      revision: 1,
    });

    const activated = runInTransaction(local.db, (tx) =>
      activateCommissionPolicyWithExpectedRevision(tx, {
        stallId: "stall-1",
        expectedRevision: 1,
        bandSetId: "set-1",
        bands: SAMPLE_BANDS,
        createdByStaffId: "staff-1",
        activatedByStaffId: "staff-1",
        activatedAt: "2026-11-09T09:00:00.000Z",
        updatedAt: "2026-11-09T09:00:00.000Z",
      }),
    );

    expect(activated.policyState.revision).toBe(2);
    expect(activated.policyState.activeBandSetId).toBe("set-1");
    expect(activated.bandSet.versionNumber).toBe(1);
    expect(activated.bands).toHaveLength(3);
    expect(listCommissionBandsForSet(local, "stall-1", "set-1")[1]?.ratePerKgMinor).toBe(1_500);
  });

  it("replaces the active version while preserving history", () => {
    const local = createBoundDb();
    ensureCommissionPolicyState(local, "stall-1", "2026-11-09T08:00:00.000Z");
    runInTransaction(local.db, (tx) =>
      activateCommissionPolicyWithExpectedRevision(tx, {
        stallId: "stall-1",
        expectedRevision: 1,
        bandSetId: "set-1",
        bands: SAMPLE_BANDS,
        createdByStaffId: "staff-1",
        activatedByStaffId: "staff-1",
        activatedAt: "2026-11-09T09:00:00.000Z",
        updatedAt: "2026-11-09T09:00:00.000Z",
      }),
    );

    const replacementBands = [
      {
        id: "band2-low",
        minPricePerKgMinor: 0,
        maxPricePerKgMinor: 9_999,
        ratePerKgMinor: 400,
      },
      {
        id: "band2-high",
        minPricePerKgMinor: 10_000,
        maxPricePerKgMinor: null,
        ratePerKgMinor: 2_000,
      },
    ];

    const replaced = runInTransaction(local.db, (tx) =>
      activateCommissionPolicyWithExpectedRevision(tx, {
        stallId: "stall-1",
        expectedRevision: 2,
        bandSetId: "set-2",
        bands: replacementBands,
        createdByStaffId: "staff-1",
        activatedByStaffId: "staff-1",
        activatedAt: "2026-11-09T10:00:00.000Z",
        updatedAt: "2026-11-09T10:00:00.000Z",
      }),
    );

    expect(replaced.previousActiveBandSetId).toBe("set-1");
    expect(replaced.bandSet.versionNumber).toBe(2);
    expect(getCommissionPolicyState(local, "stall-1")?.activeBandSetId).toBe("set-2");
    expect(getCommissionBandSetById(local, "stall-1", "set-1")?.versionNumber).toBe(1);
    expect(listCommissionBandsForSet(local, "stall-1", "set-1")).toHaveLength(3);
    expect(
      listCommissionVersions(local, { stallId: "stall-1", limit: 10, offset: 0 }).items,
    ).toHaveLength(2);
  });

  it("rejects stale expected revisions", () => {
    const local = createBoundDb();
    ensureCommissionPolicyState(local, "stall-1", "2026-11-09T08:00:00.000Z");
    runInTransaction(local.db, (tx) =>
      activateCommissionPolicyWithExpectedRevision(tx, {
        stallId: "stall-1",
        expectedRevision: 1,
        bandSetId: "set-1",
        bands: SAMPLE_BANDS,
        createdByStaffId: "staff-1",
        activatedByStaffId: "staff-1",
        activatedAt: "2026-11-09T09:00:00.000Z",
        updatedAt: "2026-11-09T09:00:00.000Z",
      }),
    );

    expect(() =>
      runInTransaction(local.db, (tx) =>
        activateCommissionPolicyWithExpectedRevision(tx, {
          stallId: "stall-1",
          expectedRevision: 1,
          bandSetId: "set-stale",
          bands: SAMPLE_BANDS,
          createdByStaffId: "staff-1",
          activatedByStaffId: "staff-1",
          activatedAt: "2026-11-09T11:00:00.000Z",
          updatedAt: "2026-11-09T11:00:00.000Z",
        }),
      ),
    ).toThrow(RevisionConflictError);
  });
});
