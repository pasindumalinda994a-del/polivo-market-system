import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, openExistingDatabase, type LocalDatabase } from "../connection.js";
import { migrationChecksum, loadBundledMigrations } from "../migrations/registry.js";
import { runInTransaction } from "../transactions.js";
import { getLocalInstallation, insertStallBinding, tryGetStallBinding } from "./binding.js";
import {
  listAcceptedTerminals,
  revokeAcceptedTerminal,
  tryGetHostEnrollment,
  upsertAcceptedTerminal,
  upsertHostEnrollment,
  updateHostActivationState,
} from "./enrollment.js";
import { NotFoundError, RepositoryError } from "./types.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-enroll-"));
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

describe("enrollment repositories", () => {
  it("keeps migration 001 checksum stable and applies 002", () => {
    const bundled = loadBundledMigrations();
    expect(bundled.map((m) => m.id).slice(0, 2)).toEqual(["001", "002"]);
    expect(bundled.some((m) => m.id === "012")).toBe(true);
    expect(bundled[0]?.checksum).toBe(
      "b518df58515339e1b90fbc3be4456dc58feb5908798fe75aef0204b96995f286",
    );
    expect(bundled[0]?.checksum).toBe(migrationChecksum(bundled[0]!.sql));
    const local = track(initializeNewDatabase(tempDbPath("schema.sqlite")));
    const tables = local.db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'host_enrollment', 'accepted_terminals', 'local_staff', 'local_staff_sessions'
         )
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual([
      "accepted_terminals",
      "host_enrollment",
      "local_staff",
      "local_staff_sessions",
    ]);
  });

  it("binds stall once and refuses overwrite", () => {
    const local = track(initializeNewDatabase(tempDbPath("bind.sqlite")));
    expect(tryGetStallBinding(local)).toBeNull();
    const bound = insertStallBinding(local, {
      stallId: "stall-a",
      tenantId: "tenant-a",
      boundAt: "2026-11-03T00:00:00.000Z",
    });
    expect(bound).toMatchObject({ stallId: "stall-a", tenantId: "tenant-a" });
    expect(() =>
      insertStallBinding(local, {
        stallId: "stall-b",
        tenantId: "tenant-b",
        boundAt: "2026-11-03T01:00:00.000Z",
      }),
    ).toThrow(RepositoryError);
    expect(tryGetStallBinding(local)?.stallId).toBe("stall-a");
  });

  it("persists host enrollment progress and resumes after reopen", () => {
    const path = tempDbPath("host.sqlite");
    const local = track(initializeNewDatabase(path));
    const installation = getLocalInstallation(local);
    expect(tryGetHostEnrollment(local)).toBeNull();

    upsertHostEnrollment(local, {
      hostDeviceId: "host-1",
      installationId: installation.id,
      credentialRef: "cred-ref-1",
      credentialVersion: 1,
      activationState: "pending_credential",
      pendingOperationId: "op-1",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });

    runInTransaction(local.db, (tx) => {
      insertStallBinding(tx, {
        stallId: "stall-a",
        tenantId: "tenant-a",
        boundAt: "2026-11-03T00:01:00.000Z",
      });
      updateHostActivationState(tx, {
        activationState: "bound",
        cloudDeviceId: "cloud-host-1",
        cloudStateRevision: 1,
        pendingOperationId: "op-1",
        updatedAt: "2026-11-03T00:01:00.000Z",
      });
    });

    local.close();
    openLocals.pop();

    const reopened = track(openExistingDatabase(path));
    const enrollment = tryGetHostEnrollment(reopened);
    expect(enrollment).toMatchObject({
      hostDeviceId: "host-1",
      activationState: "bound",
      cloudDeviceId: "cloud-host-1",
      credentialRef: "cred-ref-1",
    });
    expect(tryGetStallBinding(reopened)?.tenantId).toBe("tenant-a");
  });

  it("accepts and revokes terminals without deleting rows", () => {
    const local = track(initializeNewDatabase(tempDbPath("term.sqlite")));
    upsertAcceptedTerminal(local, {
      terminalDeviceId: "term-1",
      publicKey: "pk-1",
      credentialVersion: 1,
      label: "Front counter",
      pairingState: "pending_host_confirm",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    upsertAcceptedTerminal(local, {
      terminalDeviceId: "term-1",
      publicKey: "pk-1",
      credentialVersion: 1,
      label: "Front counter",
      pairingState: "accepted",
      acceptedAt: "2026-11-03T00:02:00.000Z",
      cloudStateRevision: 2,
      updatedAt: "2026-11-03T00:02:00.000Z",
    });
    expect(listAcceptedTerminals(local)).toHaveLength(1);
    const revoked = revokeAcceptedTerminal(local, {
      terminalDeviceId: "term-1",
      revokedAt: "2026-11-03T00:03:00.000Z",
      updatedAt: "2026-11-03T00:03:00.000Z",
      cloudStateRevision: 3,
    });
    expect(revoked.pairingState).toBe("revoked");
    expect(listAcceptedTerminals(local)[0]?.pairingState).toBe("revoked");
    expect(() =>
      revokeAcceptedTerminal(local, {
        terminalDeviceId: "missing",
        revokedAt: "2026-11-03T00:04:00.000Z",
        updatedAt: "2026-11-03T00:04:00.000Z",
      }),
    ).toThrow(NotFoundError);
  });
});
