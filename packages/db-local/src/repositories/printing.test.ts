import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeNewDatabase, type LocalDatabase } from "../connection.js";
import { loadBundledMigrations } from "../migrations/registry.js";
import { runInTransaction } from "../transactions.js";
import {
  getPrintAttemptById,
  getPrintJobByDocument,
  insertPrintAttempt,
  insertPrintJob,
  listPrintAttemptsForJob,
  markPrintAttemptSubmitting,
  reportPrintAttemptOutcome,
  upsertStallPrintIdentity,
} from "./printing.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-printing-"));
  tempRoots.push(root);
  const local = track(initializeNewDatabase(join(root, "test.sqlite")));
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, 'stall-1', 'tenant-1', '2026-11-12T00:00:00.000Z')`,
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
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("printing repository", () => {
  it("includes migration 015 in the bundled set", () => {
    const migrations = loadBundledMigrations();
    expect(migrations.some((migration) => migration.id === "015")).toBe(true);
  });

  it("stores jobs/attempts and reports outcomes without a printed flag on bills", () => {
    const local = createBoundDb();
    const now = "2026-11-12T10:00:00.000Z";

    runInTransaction(local.db, (tx) => {
      upsertStallPrintIdentity(tx, {
        displayName: "Test Stall",
        address: "Lane 1",
        updatedAt: now,
      });

      const job = insertPrintJob(tx, {
        id: "job-1",
        stallId: "stall-1",
        documentKind: "test_page",
        documentId: "test-1",
        paperProfile: "thermal-80mm-test",
        templateId: "test_page",
        templateVersion: "1",
        payloadHash: "abc",
        statementSnapshotToken: null,
        createOperationId: "create-1",
        createdByStaffId: "staff-1",
        createdByDeviceId: "device-1",
        createdAt: now,
        updatedAt: now,
      });

      expect(getPrintJobByDocument(tx, "stall-1", "test_page", "test-1")?.id).toBe(job.id);

      const attempt = insertPrintAttempt(tx, {
        id: "att-1",
        jobId: job.id,
        stallId: "stall-1",
        classification: "initial",
        reprintReason: null,
        outcome: "prepared",
        printerSystemName: "Printer A",
        paperProfile: "thermal-80mm-test",
        templateId: "test_page",
        templateVersion: "1",
        payloadHash: "abc",
        attemptReference: "A-1",
        prepareOperationId: "prep-1",
        requestedByStaffId: "staff-1",
        requestedByDeviceId: "device-1",
        preparedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      markPrintAttemptSubmitting(tx, {
        stallId: "stall-1",
        attemptId: attempt.id,
        submittingAt: now,
        updatedAt: now,
      });
      reportPrintAttemptOutcome(tx, {
        stallId: "stall-1",
        attemptId: attempt.id,
        outcome: "accepted_by_print_system",
        outcomeDetail: "spooler accepted",
        reportOperationId: "report-1",
        reportedAt: now,
        updatedAt: now,
      });

      const loaded = getPrintAttemptById(tx, "stall-1", attempt.id);
      expect(loaded?.outcome).toBe("accepted_by_print_system");
      expect(listPrintAttemptsForJob(tx, "stall-1", job.id, 10)).toHaveLength(1);
    });
  });
});
