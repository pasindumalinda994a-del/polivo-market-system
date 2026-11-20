#!/usr/bin/env node
/**
 * Phase 31/32 development sync ingest harness.
 *
 * Primary signing path (Phase 32): enrolled host credential via stall-service sync-sign
 *   POLIVO_LOCAL_DB_PATH
 *   POLIVO_HOST_CREDENTIAL_ROOT (optional)
 *   POLIVO_SYNC_INGEST_URL
 *
 * Legacy PEM fallback (dev only when secure storage is unavailable):
 *   POLIVO_SYNC_HOST_PRIVATE_KEY_PEM
 *   POLIVO_SYNC_TENANT_ID / DEVICE_ID / INSTALLATION_ID / CREDENTIAL_VERSION
 *
 * Usage:
 *   node scripts/sync-ingest-harness.mjs farmer
 *   node scripts/sync-ingest-harness.mjs replay
 *   node scripts/sync-ingest-harness.mjs sale-v1-fail
 */

import { createHash, createPrivateKey, sign, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function buildMessage(parts) {
  return [
    "polivo-ingest-v1",
    parts.tenantId,
    parts.deviceId,
    parts.installationId,
    String(parts.credentialVersion),
    parts.batchId,
    parts.bodySha256,
    parts.signedAt,
  ].join("\n");
}

function farmerBatch(tenantId, stallId, installationId, sequence = "1") {
  const now = new Date().toISOString();
  const payload = {
    farmer: {
      id: "harness-farmer-1",
      shortCode: "HF1",
      displayName: "Harness Farmer",
      contactNumber: null,
      locality: null,
      isActive: true,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
    stallId,
  };
  return {
    protocolVersion: "1",
    batchId: `batch_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    tenantId,
    stallId,
    sourceStream: {
      sourceStreamId: installationId,
      streamGeneration: 1,
      stallId,
    },
    groups: [
      {
        transactionGroupId: "grp_harness_farmer",
        complete: true,
        events: [
          {
            eventId: "evt_harness_farmer_1",
            eventType: "polivo.farmer.created",
            eventSchemaVersion: "1",
            sequence,
            transactionGroupId: "grp_harness_farmer",
            aggregateId: "harness-farmer-1",
            aggregateRevision: 1,
            occurredAt: now,
            payload,
          },
        ],
      },
    ],
  };
}

function saleV1Batch(tenantId, stallId, installationId) {
  const now = new Date().toISOString();
  return {
    protocolVersion: "1",
    batchId: `batch_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    tenantId,
    stallId,
    sourceStream: {
      sourceStreamId: installationId,
      streamGeneration: 1,
      stallId,
    },
    groups: [
      {
        transactionGroupId: "grp_harness_sale",
        complete: true,
        events: [
          {
            eventId: "evt_harness_sale_1",
            eventType: "polivo.sale.finalized",
            eventSchemaVersion: "1",
            sequence: "1",
            transactionGroupId: "grp_harness_sale",
            occurredAt: now,
            payload: {
              saleId: "sale-1",
              traderBillId: "tb-1",
              billNumber: "T-444444",
              traderId: "trader-1",
              businessDate: "2026-11-13",
              totalAmountMinor: 100,
              totalCommissionMinor: 10,
              postingId: "post-1",
              commissionPolicyId: "pol-1",
              commissionVersionId: "ver-1",
              calculationFingerprint: "a".repeat(64),
              lineCount: 1,
            },
          },
        ],
      },
    ],
  };
}

function signWithSecureStorage(rawBody) {
  const result = spawnSync("pnpm", ["--filter", "@polivo/stall-service", "sync-sign"], {
    cwd: root,
    input: rawBody,
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "sync-sign failed");
    return null;
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    console.error("sync-sign returned non-JSON output");
    return null;
  }
}

function signWithPem(rawBody, bodyObject) {
  const pem = process.env.POLIVO_SYNC_HOST_PRIVATE_KEY_PEM?.trim();
  if (!pem) {
    return null;
  }
  const privateKey = createPrivateKey(pem.includes("BEGIN") ? pem : readFileSync(pem, "utf8"));
  const tenantId = requiredEnv("POLIVO_SYNC_TENANT_ID");
  const deviceId = requiredEnv("POLIVO_SYNC_DEVICE_ID");
  const installationId = requiredEnv("POLIVO_SYNC_INSTALLATION_ID");
  const credentialVersion = Number(requiredEnv("POLIVO_SYNC_CREDENTIAL_VERSION"));
  const bodySha256 = sha256Hex(rawBody);
  const signedAt = new Date().toISOString();
  const message = buildMessage({
    tenantId,
    deviceId,
    installationId,
    credentialVersion,
    batchId: bodyObject.batchId,
    bodySha256,
    signedAt,
  });
  const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
  return {
    headers: {
      "content-type": "application/json",
      "x-polivo-tenant-id": tenantId,
      "x-polivo-device-id": deviceId,
      "x-polivo-installation-id": installationId,
      "x-polivo-credential-version": String(credentialVersion),
      "x-polivo-batch-id": bodyObject.batchId,
      "x-polivo-signed-at": signedAt,
      "x-polivo-body-sha256": bodySha256,
      "x-polivo-signature": signature,
    },
    bodySha256,
    signedAt,
    batchId: bodyObject.batchId,
  };
}

async function send(bodyObject) {
  const url = requiredEnv("POLIVO_SYNC_INGEST_URL");
  const rawBody = JSON.stringify(bodyObject);

  let signed = null;
  if (process.env.POLIVO_LOCAL_DB_PATH?.trim()) {
    signed = signWithSecureStorage(rawBody);
  }
  if (!signed) {
    signed = signWithPem(rawBody, bodyObject);
  }
  if (!signed) {
    console.error(
      "Unable to sign: set POLIVO_LOCAL_DB_PATH for secure-storage signing (preferred) or POLIVO_SYNC_HOST_PRIVATE_KEY_PEM for legacy PEM fallback.",
    );
    process.exit(1);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: signed.headers,
    body: rawBody,
    redirect: "error",
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  console.log(
    JSON.stringify(
      {
        httpStatus: response.status,
        signingPath: process.env.POLIVO_LOCAL_DB_PATH?.trim() ? "secure-storage" : "pem-fallback",
        correlationId: json.correlationId ?? null,
        committedCursor: json.committedCursor ?? null,
        allGroupsAccepted: json.allGroupsAccepted ?? null,
        groupOutcomes: json.groupOutcomes ?? null,
        error: json.code ? { code: json.code, message: json.message } : null,
        payloadHashSample: sha256Hex(
          JSON.stringify(canonicalize(bodyObject.groups[0]?.events?.[0]?.payload ?? {})),
        ),
      },
      null,
      2,
    ),
  );
}

const mode = process.argv[2] ?? "farmer";
const tenantId = process.env.POLIVO_SYNC_TENANT_ID?.trim() || requiredEnv("POLIVO_SYNC_TENANT_ID");
const stallId = process.env.POLIVO_SYNC_STALL_ID?.trim() || tenantId;
const installationId =
  process.env.POLIVO_SYNC_INSTALLATION_ID?.trim() || requiredEnv("POLIVO_SYNC_INSTALLATION_ID");

if (mode === "farmer" || mode === "replay") {
  await send(farmerBatch(tenantId, stallId, installationId, "1"));
} else if (mode === "sale-v1-fail") {
  await send(saleV1Batch(tenantId, stallId, installationId));
} else {
  console.error("Unknown mode. Use farmer | replay | sale-v1-fail");
  process.exit(1);
}
