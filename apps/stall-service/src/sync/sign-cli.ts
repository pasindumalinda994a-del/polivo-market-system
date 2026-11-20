/**
 * Development helper: sign an ingest body using the enrolled host credential
 * from secure storage (same path as the production worker).
 *
 * Usage (stdin = raw JSON body bytes to transmit):
 *   pnpm --filter @polivo/stall-service sync-sign < body.json
 *
 * Env:
 *   POLIVO_LOCAL_DB_PATH (required)
 *   POLIVO_HOST_CREDENTIAL_ROOT (optional)
 *   POLIVO_SECURE_STORAGE=simulated (dev only)
 *
 * Prints JSON: { headers, bodySha256, signedAt, batchId } — never the private key.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  getStallBinding,
  openExistingDatabaseAndVerify,
  tryGetHostEnrollment,
} from "@polivo/db-local";

import { createDefaultHostSecureStorage } from "../security/secure-storage.js";
import { createHostIngestSigner } from "./signer.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const databasePath = requiredEnv("POLIVO_LOCAL_DB_PATH");
  const credentialRoot =
    process.env.POLIVO_HOST_CREDENTIAL_ROOT?.trim() ||
    join(homedir(), ".polivo", "host-credentials");

  const rawBody = readFileSync(0, "utf8");
  let parsed: { batchId?: string };
  try {
    parsed = JSON.parse(rawBody) as { batchId?: string };
  } catch {
    console.error("stdin must be valid JSON ingest body");
    process.exit(1);
  }
  if (typeof parsed.batchId !== "string" || parsed.batchId.length === 0) {
    console.error("ingest body must include batchId");
    process.exit(1);
  }

  const database = openExistingDatabaseAndVerify(databasePath);
  try {
    const host = tryGetHostEnrollment(database);
    if (!host || host.activationState !== "activated") {
      console.error("Host is not activated.");
      process.exit(1);
    }
    const binding = getStallBinding(database);
    const secureStorage = createDefaultHostSecureStorage(credentialRoot);
    const signer = createHostIngestSigner({
      database,
      secureStorage,
      stallId: binding.stallId,
      tenantId: binding.tenantId,
    });
    const signedAt = new Date().toISOString();
    // Serialize once: sign the exact stdin bytes that will be posted.
    const signed = signer.signBody({
      rawBody,
      batchId: parsed.batchId,
      signedAt,
    });
    process.stdout.write(
      `${JSON.stringify({
        headers: signed.headers,
        bodySha256: signed.bodySha256,
        signedAt: signed.signedAt,
        batchId: parsed.batchId,
      })}\n`,
    );
  } finally {
    database.close();
  }
}

void main();
