import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomUUID } from "node:crypto";

import {
  getStallBinding,
  openExistingDatabaseAndVerify,
  tryGetLocalOwner,
  tryGetLocalStaffById,
  type LocalDatabase,
} from "@polivo/db-local";

import { loadConfig } from "../config.js";
import { createHttpPermissionRefreshRedeemer } from "./permission-refresh-redeem.js";
import { createHttpSetupGrantRedeemer } from "./setup-grant-redeem.js";
import {
  activateLocalStaff,
  applyLocalPermissionSnapshot,
  deactivateLocalStaff,
  resetLocalStaffCredential,
  setupFirstLocalOwner,
} from "./staff-admin.js";
import { parseCapabilitiesArgv } from "./staff-cli-capabilities.js";

async function promptSecret(label: string): Promise<string> {
  const rl = createInterface({ input, output, terminal: true });
  try {
    const value = await rl.question(`${label}: `);
    return value.trim();
  } finally {
    rl.close();
  }
}

function printOk(payload: unknown): void {
  console.log(JSON.stringify({ ok: true, ...(payload as object) }, null, 2));
}

async function withDb(): Promise<LocalDatabase> {
  const config = loadConfig();
  return openExistingDatabaseAndVerify(config.databasePath);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const now = () => new Date().toISOString();
  const createId = () => randomUUID();

  if (command === "setup-owner") {
    const database = await withDb();
    try {
      const binding = getStallBinding(database);
      const staffCode = process.argv[3]?.trim();
      if (!staffCode) {
        throw new Error("Usage: staff-cli setup-owner <staffCode>");
      }
      const setupGrantSecret =
        process.env.POLIVO_LOCAL_STAFF_SETUP_SECRET?.trim() ||
        (await promptSecret("Paste the one-time local staff setup grant secret"));
      const secret = await promptSecret("Choose local owner secret");
      const baseUrl = process.env.POLIVO_ENROLLMENT_BASE_URL?.trim() || "http://localhost:3000";
      const redeemer = createHttpSetupGrantRedeemer({ baseUrl });
      const proof = await redeemer.redeem({
        setupGrantSecret,
        tenantId: binding.tenantId,
      });
      if ("code" in proof) {
        throw new Error(proof.message);
      }
      const result = setupFirstLocalOwner(
        { database, now, createId },
        { staffCode, secret, proof },
      );
      if ("code" in result) {
        throw new Error(result.message);
      }
      printOk(result);
    } finally {
      database.close();
    }
    return;
  }

  if (command === "activate-staff") {
    const database = await withDb();
    try {
      const binding = getStallBinding(database);
      const owner = tryGetLocalOwner(database, binding.tenantId);
      if (!owner) {
        throw new Error("Local owner is not set up.");
      }
      const staffCode = process.argv[3]?.trim();
      const membershipId = process.argv[4]?.trim();
      const capsJson = process.argv[5]?.trim() || "[]";
      const revision = Number(process.argv[6] ?? "1");
      if (!staffCode || !membershipId) {
        throw new Error(
          "Usage: staff-cli activate-staff <staffCode> <cloudMembershipId> [capabilitiesJson] [sourceRevision] [displayName]",
        );
      }
      const secret = await promptSecret("New staff secret");
      const displayName = process.argv[7]?.trim() || staffCode;
      const capabilities = parseCapabilitiesArgv(capsJson);
      const result = activateLocalStaff(
        { database, now, createId },
        {
          actorStaffId: owner.id,
          staffCode,
          secret,
          displayName,
          cloudMembershipId: membershipId,
          capabilities,
          sourceRevision: revision,
        },
      );
      if ("code" in result) {
        throw new Error(result.message);
      }
      printOk(result);
    } finally {
      database.close();
    }
    return;
  }

  if (command === "reset-credential") {
    const database = await withDb();
    try {
      const binding = getStallBinding(database);
      const owner = tryGetLocalOwner(database, binding.tenantId);
      if (!owner) {
        throw new Error("Local owner is not set up.");
      }
      const staffId = process.argv[3]?.trim();
      if (!staffId) {
        throw new Error("Usage: staff-cli reset-credential <staffId>");
      }
      const newSecret = await promptSecret("New staff secret");
      const result = resetLocalStaffCredential(
        { database, now, createId },
        { actorStaffId: owner.id, staffId, newSecret },
      );
      if ("code" in result) {
        throw new Error(result.message);
      }
      printOk(result);
    } finally {
      database.close();
    }
    return;
  }

  if (command === "deactivate-staff") {
    const database = await withDb();
    try {
      const binding = getStallBinding(database);
      const owner = tryGetLocalOwner(database, binding.tenantId);
      if (!owner) {
        throw new Error("Local owner is not set up.");
      }
      const staffId = process.argv[3]?.trim();
      if (!staffId) {
        throw new Error("Usage: staff-cli deactivate-staff <staffId>");
      }
      const result = deactivateLocalStaff(
        { database, now, createId },
        { actorStaffId: owner.id, staffId },
      );
      if ("code" in result) {
        throw new Error(result.message);
      }
      printOk(result);
    } finally {
      database.close();
    }
    return;
  }

  if (command === "refresh-permissions") {
    const database = await withDb();
    try {
      const staffId = process.argv[3]?.trim();
      if (!staffId) {
        throw new Error(
          "Usage: staff-cli refresh-permissions <staffId>  (paste owner-issued refresh grant secret when prompted)",
        );
      }
      // Reject legacy argv capability/revision renewals — they are not a trusted authority (ADR 0013).
      if (process.argv[4]?.trim()) {
        throw new Error(
          "refresh-permissions no longer accepts capability JSON on argv. Owner-authorize a permission refresh grant in the web app, then paste the one-time secret here.",
        );
      }
      const staff = tryGetLocalStaffById(database, staffId);
      if (staff === null) {
        throw new Error("Staff member was not found.");
      }
      if (!staff.cloudMembershipId) {
        throw new Error("Staff member has no cloud membership id; cannot refresh from cloud.");
      }
      const refreshGrantSecret =
        process.env.POLIVO_LOCAL_STAFF_REFRESH_SECRET?.trim() ||
        (await promptSecret("Paste the one-time permission refresh grant secret"));
      const binding = getStallBinding(database);
      const baseUrl = process.env.POLIVO_ENROLLMENT_BASE_URL?.trim() || "http://localhost:3000";
      const redeemer = createHttpPermissionRefreshRedeemer({ baseUrl });
      const proof = await redeemer.redeem({
        refreshGrantSecret,
        tenantId: binding.tenantId,
        expectedMembershipId: staff.cloudMembershipId,
      });
      if ("code" in proof) {
        throw new Error(proof.message);
      }
      const result = applyLocalPermissionSnapshot(
        { database, now, createId },
        {
          staffId,
          tenantId: binding.tenantId,
          stallId: binding.stallId,
          capabilities: proof.capabilities,
          sourceRevision: proof.sourceRevision,
        },
      );
      if ("code" in result) {
        throw new Error(result.message);
      }
      printOk(result);
    } finally {
      database.close();
    }
    return;
  }

  throw new Error(
    "Usage: staff-cli <setup-owner|activate-staff|reset-credential|deactivate-staff|refresh-permissions> ...",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
