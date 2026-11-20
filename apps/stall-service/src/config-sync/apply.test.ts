import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyCapabilitySnapshot,
  initializeNewDatabase,
  insertLocalStaff,
  insertStallBinding,
  listAcceptedTerminals,
  tryGetCapabilitySnapshot,
  tryGetLocalStaffById,
  upsertAcceptedTerminal,
  type LocalDatabase,
} from "@polivo/db-local";
import { afterEach, describe, expect, it } from "vitest";

import { applyAccessEnvelope } from "./apply.js";

const issuedAt = "2026-11-13T12:00:00.000Z";
const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function tempDbPath(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "polivo-config-apply-"));
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

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: "1",
    schemaVersion: "1",
    domain: "access",
    snapshotKind: "complete_replacement",
    tenantId: "ten_test",
    stallId: "ten_test",
    targetScope: "stall_host",
    revision: 2,
    publicationId: "pub_1",
    issuedAt,
    maxSnapshotAgeMs: 604800000,
    requiredCompatibilityVersion: 1,
    payloadHash: "a".repeat(64),
    payload: {
      profiles: [],
      memberships: [
        {
          membershipId: "mem_cashier",
          status: "active",
          accessRole: "cashier",
          capabilities: ["bills.create"],
          capabilitiesRevision: 5,
          updatedAt: issuedAt,
        },
      ],
      devices: [],
    },
    ...overrides,
  };
}

describe("applyAccessEnvelope", () => {
  it("applies mapped membership capabilities atomically", () => {
    const database = track(initializeNewDatabase(tempDbPath("apply.sqlite")));
    insertStallBinding(database, {
      stallId: "ten_test",
      tenantId: "ten_test",
      boundAt: issuedAt,
    });
    insertLocalStaff(database, {
      id: "staff_1",
      tenantId: "ten_test",
      staffCode: "C1",
      displayName: "Cashier",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_cashier",
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    const result = applyAccessEnvelope({
      database,
      envelope: baseEnvelope() as never,
      nowIso: "2026-11-13T12:01:00.000Z",
      createId: () => "aud_1",
    });

    expect(result.kind).toBe("applied");
    const snapshot = tryGetCapabilitySnapshot(database, "staff_1");
    expect(snapshot?.sourceRevision).toBe(5);
    expect(JSON.parse(snapshot!.capabilitiesJson)).toEqual(["bills.create"]);
  });

  it("replaces mapped capabilities on later revisions without requiring a new staff mapping", () => {
    const database = track(initializeNewDatabase(tempDbPath("apply-revoke-cap.sqlite")));
    insertStallBinding(database, {
      stallId: "ten_test",
      tenantId: "ten_test",
      boundAt: issuedAt,
    });
    insertLocalStaff(database, {
      id: "staff_1",
      tenantId: "ten_test",
      staffCode: "C1",
      displayName: "Cashier",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_cashier",
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    applyAccessEnvelope({
      database,
      envelope: baseEnvelope({
        revision: 5,
        publicationId: "pub_5",
        payload: {
          profiles: [],
          memberships: [
            {
              membershipId: "mem_cashier",
              status: "active",
              accessRole: "cashier",
              capabilities: ["payments.receive_trader", "catalog.manage"],
              capabilitiesRevision: 2,
              updatedAt: issuedAt,
            },
          ],
          devices: [],
        },
      }) as never,
      nowIso: issuedAt,
      createId: () => "aud_cap_1",
    });

    const removed = applyAccessEnvelope({
      database,
      envelope: baseEnvelope({
        revision: 6,
        publicationId: "pub_6",
        payload: {
          profiles: [],
          memberships: [
            {
              membershipId: "mem_cashier",
              status: "active",
              accessRole: "cashier",
              capabilities: ["payments.receive_trader"],
              capabilitiesRevision: 3,
              updatedAt: issuedAt,
            },
          ],
          devices: [],
        },
      }) as never,
      nowIso: "2026-11-13T12:05:00.000Z",
      createId: () => "aud_cap_2",
    });

    expect(removed.kind).toBe("applied");
    const snapshot = tryGetCapabilitySnapshot(database, "staff_1");
    expect(snapshot?.sourceRevision).toBe(3);
    expect(JSON.parse(snapshot!.capabilitiesJson)).toEqual(["payments.receive_trader"]);
    expect(JSON.parse(snapshot!.capabilitiesJson)).not.toContain("catalog.manage");
    expect(tryGetLocalStaffById(database, "staff_1")?.status).toBe("active");
  });

  it("rejects lower revisions", () => {
    const database = track(initializeNewDatabase(tempDbPath("stale.sqlite")));
    insertStallBinding(database, {
      stallId: "ten_test",
      tenantId: "ten_test",
      boundAt: issuedAt,
    });
    insertLocalStaff(database, {
      id: "staff_1",
      tenantId: "ten_test",
      staffCode: "C1",
      displayName: "Cashier",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_cashier",
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
    applyAccessEnvelope({
      database,
      envelope: baseEnvelope({ revision: 3, publicationId: "pub_3" }) as never,
      nowIso: issuedAt,
      createId: () => "aud_2",
    });
    const lower = applyAccessEnvelope({
      database,
      envelope: baseEnvelope({ revision: 2, publicationId: "pub_2" }) as never,
      nowIso: issuedAt,
      createId: () => "aud_3",
    });
    expect(lower.kind).toBe("rejected");
    if (lower.kind === "rejected") {
      expect(lower.errorCode).toBe("STALE_REVISION");
    }
  });

  it("disables mapped staff when membership is inactive", () => {
    const database = track(initializeNewDatabase(tempDbPath("disable.sqlite")));
    insertStallBinding(database, {
      stallId: "ten_test",
      tenantId: "ten_test",
      boundAt: issuedAt,
    });
    insertLocalStaff(database, {
      id: "staff_1",
      tenantId: "ten_test",
      staffCode: "C1",
      displayName: "Cashier",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_cashier",
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
    applyCapabilitySnapshot(database, {
      staffId: "staff_1",
      tenantId: "ten_test",
      stallId: "ten_test",
      capabilitiesJson: JSON.stringify(["bills.create"]),
      sourceRevision: 1,
      authorityVerifiedAt: issuedAt,
      updatedAt: issuedAt,
    });

    const result = applyAccessEnvelope({
      database,
      envelope: baseEnvelope({
        revision: 4,
        publicationId: "pub_4",
        payload: {
          profiles: [],
          memberships: [
            {
              membershipId: "mem_cashier",
              status: "inactive",
              accessRole: "cashier",
              capabilities: ["bills.create"],
              capabilitiesRevision: 6,
              updatedAt: issuedAt,
            },
          ],
          devices: [],
        },
      }) as never,
      nowIso: "2026-11-13T13:00:00.000Z",
      createId: () => "aud_4",
    });

    expect(result.kind).toBe("applied");
    expect(tryGetLocalStaffById(database, "staff_1")?.status).toBe("disabled");
  });

  it("revokes local terminals listed as revoked in the snapshot", () => {
    const database = track(initializeNewDatabase(tempDbPath("term.sqlite")));
    insertStallBinding(database, {
      stallId: "ten_test",
      tenantId: "ten_test",
      boundAt: issuedAt,
    });
    upsertAcceptedTerminal(database, {
      terminalDeviceId: "dev_term",
      publicKey: "pk",
      credentialVersion: 1,
      label: "T1",
      pairingState: "accepted",
      cloudStateRevision: 1,
      acceptedAt: issuedAt,
      revokedAt: null,
      updatedAt: issuedAt,
    });

    const result = applyAccessEnvelope({
      database,
      envelope: baseEnvelope({
        revision: 5,
        publicationId: "pub_5",
        payload: {
          profiles: [],
          memberships: [],
          devices: [
            {
              deviceId: "dev_term",
              role: "terminal",
              enrollmentState: "revoked",
              installationId: null,
              credentialVersion: 1,
              intendedHostDeviceId: "dev_host",
              revokedAt: issuedAt,
              label: "T1",
            },
          ],
        },
      }) as never,
      nowIso: issuedAt,
      createId: () => "aud_5",
    });

    expect(result.kind).toBe("applied");
    expect(listAcceptedTerminals(database)[0]?.pairingState).toBe("revoked");
  });
});
