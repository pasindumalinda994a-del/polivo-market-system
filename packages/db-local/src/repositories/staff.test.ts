import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { insertStallBinding } from "./binding.js";
import {
  applyCapabilitySnapshot,
  countLocalStaff,
  insertLocalStaff,
  insertStaffSession,
  revokeSessionsForStaff,
  tryGetLocalOwner,
  updateLocalStaffStatus,
  upsertStaffCredential,
} from "./staff.js";
import { RepositoryError, RevisionConflictError } from "./types.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-staff-"));
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

describe("local staff repositories", () => {
  it("creates a single local owner and rejects a second", () => {
    const local = track(initializeNewDatabase(tempDbPath("owner.sqlite")));
    insertStallBinding(local, {
      stallId: "stall-a",
      tenantId: "tenant-a",
      boundAt: "2026-11-04T00:00:00.000Z",
    });
    expect(countLocalStaff(local, "tenant-a")).toBe(0);
    insertLocalStaff(local, {
      id: "staff-owner",
      tenantId: "tenant-a",
      staffCode: "OWNER1",
      displayName: "Owner",
      status: "active",
      isLocalOwner: true,
      cloudMembershipId: "mem_owner",
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(tryGetLocalOwner(local, "tenant-a")?.id).toBe("staff-owner");
    expect(() =>
      insertLocalStaff(local, {
        id: "staff-owner-2",
        tenantId: "tenant-a",
        staffCode: "OWNER2",
        displayName: "Other",
        status: "active",
        isLocalOwner: true,
        createdAt: "2026-11-04T00:01:00.000Z",
        updatedAt: "2026-11-04T00:01:00.000Z",
      }),
    ).toThrow(RepositoryError);
  });

  it("rejects older capability snapshots and preserves staff on disable", () => {
    const local = track(initializeNewDatabase(tempDbPath("snap.sqlite")));
    insertLocalStaff(local, {
      id: "staff-c",
      tenantId: "tenant-a",
      staffCode: "CASH1",
      displayName: "Cashier",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_c",
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    });
    applyCapabilitySnapshot(local, {
      staffId: "staff-c",
      tenantId: "tenant-a",
      stallId: "stall-a",
      capabilitiesJson: JSON.stringify(["bills.create"]),
      sourceRevision: 2,
      authorityVerifiedAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(() =>
      applyCapabilitySnapshot(local, {
        staffId: "staff-c",
        tenantId: "tenant-a",
        stallId: "stall-a",
        capabilitiesJson: JSON.stringify([]),
        sourceRevision: 1,
        authorityVerifiedAt: "2026-11-04T01:00:00.000Z",
        updatedAt: "2026-11-04T01:00:00.000Z",
      }),
    ).toThrow(RevisionConflictError);

    upsertStaffCredential(local, {
      staffId: "staff-c",
      tenantId: "tenant-a",
      verifier: "scrypt$v1$test",
      verifierFormat: "scrypt$v1",
      credentialRevision: 1,
      updatedAt: "2026-11-04T00:00:00.000Z",
    });
    insertStaffSession(local, {
      id: "sess-1",
      tenantId: "tenant-a",
      staffId: "staff-c",
      deviceId: "dev-1",
      verifier: "sess-verifier-1",
      credentialRevision: 1,
      issuedAt: "2026-11-04T00:00:00.000Z",
      absoluteExpiresAt: "2026-11-04T08:00:00.000Z",
      lastActivityAt: "2026-11-04T00:00:00.000Z",
    });
    updateLocalStaffStatus(local, {
      staffId: "staff-c",
      status: "disabled",
      updatedAt: "2026-11-04T02:00:00.000Z",
    });
    expect(revokeSessionsForStaff(local, "staff-c", "2026-11-04T02:00:00.000Z")).toBe(1);
  });
});
