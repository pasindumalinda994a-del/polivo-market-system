#!/usr/bin/env node
/**
 * Run cloud database isolation tests against a disposable Postgres environment.
 *
 * Preference order:
 * 1. Local Supabase stack when Docker is available (`supabase start`).
 * 2. Embedded Postgres with Supabase-compatible roles/auth.jwt() stub (no Docker).
 *
 * Always applies canonical migrations from supabase/migrations.
 * Does not use shared staging/production credentials.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const migrationsDir = resolve(repoRoot, "supabase", "migrations");
const compatSqlPath = resolve(
  repoRoot,
  "packages",
  "db-cloud",
  "src",
  "test",
  "isolation",
  "supabase-compat.sql",
);

function resolveSupabaseBin() {
  const winExe = resolve(repoRoot, "node_modules", "supabase", "bin", "supabase.exe");
  if (existsSync(winExe)) {
    return winExe;
  }
  const unixBin = resolve(repoRoot, "node_modules", "supabase", "bin", "supabase");
  if (existsSync(unixBin)) {
    return unixBin;
  }
  return null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    env: process.env,
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function runCapture(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
}

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(migrationsDir, name));
}

async function applySqlFile(client, filePath) {
  const sql = readFileSync(filePath, "utf8");
  await client.query(sql);
}

async function applyCanonicalSchema(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await applySqlFile(client, compatSqlPath);
    for (const file of migrationFiles()) {
      console.log(`Applying ${file.slice(repoRoot.length + 1)}...`);
      await applySqlFile(client, file);
    }
  } finally {
    await client.end();
  }
}

async function trySupabaseStack(supabaseBin) {
  const status = runCapture(supabaseBin, ["status", "-o", "env"]);
  if (status.status !== 0) {
    console.log("Attempting local Supabase stack (Docker)...");
    const start = runCapture(supabaseBin, ["start"]);
    if (start.status !== 0) {
      const detail = `${start.stderr || ""}\n${start.stdout || ""}`;
      if (/docker/i.test(detail) || /Docker Desktop/i.test(detail)) {
        return null;
      }
      console.error(detail);
      return null;
    }
  }

  const reset = run(supabaseBin, ["db", "reset", "--yes"]);
  if (reset !== 0) {
    return null;
  }

  return {
    mode: "supabase",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    cleanup: async () => {},
  };
}

async function startEmbeddedStack() {
  const databaseDir = mkdtempSync(join(tmpdir(), "polivo-cloud-pg-"));
  const port = 55432;
  const password = "polivo-test";
  const pgServer = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password,
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
  });

  console.log(`Starting embedded Postgres on port ${port}...`);
  await pgServer.initialise();
  await pgServer.start();

  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  await applyCanonicalSchema(databaseUrl);

  return {
    mode: "embedded",
    databaseUrl,
    cleanup: async () => {
      try {
        await pgServer.stop();
      } catch {
        // ignore stop errors during teardown
      }
      try {
        rmSync(databaseDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

function resolveVitestEntry() {
  const candidates = [
    resolve(repoRoot, "node_modules", "vitest", "vitest.mjs"),
    resolve(repoRoot, "node_modules", "vitest", "dist", "cli.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  if (!existsSync(migrationsDir)) {
    console.error("Missing supabase/migrations — canonical cloud migrations are required.");
    process.exit(1);
  }

  let stack = null;
  const supabaseBin = resolveSupabaseBin();
  if (supabaseBin && process.env.POLIVO_CLOUD_TEST_FORCE_EMBEDDED !== "1") {
    stack = await trySupabaseStack(supabaseBin);
  }

  if (!stack) {
    console.log(
      "Using embedded Postgres disposable environment (Supabase Docker unavailable or forced).",
    );
    stack = await startEmbeddedStack();
  } else {
    console.log("Using local Supabase stack.");
  }

  const vitestEntry = resolveVitestEntry();
  if (!vitestEntry) {
    console.error("Vitest entry not found. Run `pnpm install`.");
    await stack.cleanup();
    process.exit(1);
  }

  const env = {
    ...process.env,
    POLIVO_CLOUD_TEST_DATABASE_URL: stack.databaseUrl,
  };

  let exitCode;
  try {
    console.log(`Running isolation tests (${stack.mode})...`);
    exitCode = run(
      process.execPath,
      [
        vitestEntry,
        "run",
        "--config",
        resolve(repoRoot, "packages", "db-cloud", "vitest.db.config.ts"),
      ],
      { env },
    );
  } finally {
    await stack.cleanup();
  }

  return exitCode ?? 1;
}

const code = await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
});
process.exitCode = code;
