import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendOutboxEvent,
  applyPendingMigrations,
  getLocalInstallation,
  initializeNewDatabase,
  insertStallBinding,
  runInTransaction,
  upsertHostEnrollment,
} from "@polivo/db-local";
import { afterEach, describe, expect, it } from "vitest";

import { createMemorySecureStorage } from "../security/secure-storage.js";
import { generateDeviceKeyPair } from "../security/ed25519.js";
import { createOutboxSyncWorker } from "./worker.js";
import type { SyncTransport } from "./transport.js";

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

describe("outbox sync worker", () => {
  it("uploads a pending group and advances local acknowledgement", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polivo-sync-worker-"));
    temps.push(dir);
    const path = join(dir, "stall.sqlite");
    const local = initializeNewDatabase(path);
    applyPendingMigrations(local.db);
    const keys = generateDeviceKeyPair();
    const storage = createMemorySecureStorage();
    storage.setSecret("host-inst-1-v1", keys.privateKeyPkcs8);

    const installation = getLocalInstallation(local);
    runInTransaction(local.db, (tx) => {
      insertStallBinding(tx, {
        stallId: "ten-1",
        tenantId: "ten-1",
        boundAt: "2026-11-13T00:00:00.000Z",
      });
      upsertHostEnrollment(tx, {
        hostDeviceId: "host-1",
        installationId: installation.id,
        credentialRef: "host-inst-1-v1",
        credentialVersion: 1,
        activationState: "activated",
        pendingOperationId: null,
        cloudDeviceId: "cloud-host-1",
        cloudStateRevision: 1,
        activatedAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
      });
      appendOutboxEvent(tx, {
        eventId: "evt-farmer-1",
        tenantId: "ten-1",
        stallId: "ten-1",
        originatingDeviceId: "host-1",
        eventType: "polivo.farmer.created",
        eventSchemaVersion: "1",
        payloadJson: JSON.stringify({
          farmer: {
            id: "farmer-1",
            shortCode: "F1",
            displayName: "Farmer",
            contactNumber: null,
            locality: null,
            isActive: true,
            revision: 1,
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
          },
          stallId: "ten-1",
        }),
        occurredAt: "2026-11-13T00:00:00.000Z",
        transactionGroupId: "grp-1",
      });
    });

    let uploaded = 0;
    const transport: SyncTransport = {
      upload: async (signed) => {
        uploaded += 1;
        expect(signed.headers["x-polivo-signature"]).toBeTruthy();
        expect(signed.headers["x-polivo-body-sha256"]).toHaveLength(64);
        const body = JSON.parse(signed.rawBody) as {
          batchId: string;
          groups: Array<{ transactionGroupId: string; events: Array<{ eventId: string }> }>;
        };
        return {
          kind: "ack",
          status: 200,
          body: {
            protocolVersion: "1",
            correlationId: "corr-1",
            batchId: body.batchId,
            tenantId: "ten-1",
            stallId: "ten-1",
            sourceStreamId: installation.id,
            streamGeneration: 1,
            committedCursor: "1",
            nextExpectedSequence: "2",
            allGroupsAccepted: true,
            groupOutcomes: [
              {
                transactionGroupId: "grp-1",
                outcome: "applied",
                acknowledgedEventIds: ["evt-farmer-1"],
                errorCode: null,
                message: null,
                retryable: false,
              },
            ],
          },
        };
      },
    };

    const worker = createOutboxSyncWorker({
      database: local,
      secureStorage: storage,
      transport,
      ingestConfigured: true,
      configurationMessage: null,
      now: () => "2026-11-13T01:00:00.000Z",
      createId: () => "batch-test-1",
      random: () => 0.5,
      pollIntervalMs: 60_000,
    });

    worker.start();
    // Allow the first scheduled cycle to run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    worker.wake();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await worker.stop();

    expect(uploaded).toBeGreaterThanOrEqual(1);
    const row = local.db
      .prepare(`SELECT ack_state FROM sync_outbox WHERE event_id = ?`)
      .get("evt-farmer-1") as { ack_state: string };
    expect(row.ack_state).toBe("acknowledged");
    const status = worker.getStatus();
    expect(status.acknowledgedCursor).toBe("1");
    expect(["up_to_date", "uploading", "waiting_retry"]).toContain(status.state);
    local.close();
  });

  it("does not start a parallel loop on manual retry while blocked lease is held", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polivo-sync-worker-"));
    temps.push(dir);
    const path = join(dir, "stall.sqlite");
    const local = initializeNewDatabase(path);
    applyPendingMigrations(local.db);
    const keys = generateDeviceKeyPair();
    const storage = createMemorySecureStorage();
    storage.setSecret("host-inst-1-v1", keys.privateKeyPkcs8);
    const installation = getLocalInstallation(local);
    runInTransaction(local.db, (tx) => {
      insertStallBinding(tx, {
        stallId: "ten-1",
        tenantId: "ten-1",
        boundAt: "2026-11-13T00:00:00.000Z",
      });
      upsertHostEnrollment(tx, {
        hostDeviceId: "host-1",
        installationId: installation.id,
        credentialRef: "host-inst-1-v1",
        credentialVersion: 1,
        activationState: "activated",
        pendingOperationId: null,
        cloudDeviceId: "cloud-host-1",
        cloudStateRevision: 1,
        activatedAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
      });
    });

    let concurrent = 0;
    let maxConcurrent = 0;
    const transport: SyncTransport = {
      upload: async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 30));
        concurrent -= 1;
        return {
          kind: "transport_error",
          retryable: true,
          errorCode: "NETWORK_ERROR",
          message: "offline",
        };
      },
    };

    // Seed one pending event so cycles attempt uploads.
    runInTransaction(local.db, (tx) => {
      appendOutboxEvent(tx, {
        eventId: "evt-1",
        tenantId: "ten-1",
        stallId: "ten-1",
        originatingDeviceId: "host-1",
        eventType: "polivo.farmer.created",
        eventSchemaVersion: "1",
        payloadJson: JSON.stringify({ ok: true, stallId: "ten-1" }),
        occurredAt: "2026-11-13T00:00:00.000Z",
        transactionGroupId: "grp-1",
      });
    });

    const worker = createOutboxSyncWorker({
      database: local,
      secureStorage: storage,
      transport,
      ingestConfigured: true,
      configurationMessage: null,
      now: () => new Date().toISOString(),
      createId: () => `batch-${Math.random()}`,
      pollIntervalMs: 60_000,
    });
    worker.start();
    worker.wake();
    worker.requestManualRetry();
    worker.wake();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await worker.stop();
    expect(maxConcurrent).toBeLessThanOrEqual(1);
    local.close();
  });
});
