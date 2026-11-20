import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase } from "../connection.js";
import { applyPendingMigrations } from "../migrations/runner.js";
import { appendOutboxEvent, listPendingOutboxEvents } from "./outbox.js";
import {
  acquireSyncWorkerLease,
  ensureSyncStreamState,
  updateSyncStreamProgress,
} from "./sync-stream.js";
import { runInTransaction } from "../transactions.js";

const temps: string[] = [];

afterEach(() => {
  for (const path of temps.splice(0)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("sync stream and outbox delivery repos", () => {
  it("stores transaction groups and fences acknowledgements behind the lease", () => {
    const dir = mkdtempSync(join(tmpdir(), "polivo-sync-stream-"));
    temps.push(dir);
    const local = initializeNewDatabase(join(dir, "db.sqlite"));
    applyPendingMigrations(local.db);

    runInTransaction(local.db, (tx) => {
      appendOutboxEvent(tx, {
        eventId: "evt-1",
        tenantId: "ten-1",
        stallId: "ten-1",
        originatingDeviceId: "dev-1",
        eventType: "polivo.farmer.created",
        eventSchemaVersion: "1",
        payloadJson: JSON.stringify({ ok: true }),
        occurredAt: "2026-11-13T00:00:00.000Z",
        transactionGroupId: "grp-1",
      });
      ensureSyncStreamState(tx, {
        stallId: "ten-1",
        sourceStreamId: "inst-1",
        updatedAt: "2026-11-13T00:00:00.000Z",
      });
      const lease = acquireSyncWorkerLease(tx, {
        stallId: "ten-1",
        ownerToken: "owner-a",
        now: "2026-11-13T00:00:00.000Z",
        expiresAt: "2026-11-13T01:00:00.000Z",
      });
      expect(lease.acquired).toBe(true);
      updateSyncStreamProgress(tx, {
        stallId: "ten-1",
        fenceToken: lease.lease!.fenceToken,
        acknowledgedCursor: 0,
        localTailSequence: 1,
        localTailMeasuredAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
      });
    });

    const pending = listPendingOutboxEvents(local, { stallId: "ten-1" });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.transactionGroupId).toBe("grp-1");

    const stolen = runInTransaction(local.db, (tx) =>
      acquireSyncWorkerLease(tx, {
        stallId: "ten-1",
        ownerToken: "owner-b",
        now: "2026-11-13T00:30:00.000Z",
        expiresAt: "2026-11-13T02:00:00.000Z",
      }),
    );
    expect(stolen.acquired).toBe(false);
    local.close();
  });
});
