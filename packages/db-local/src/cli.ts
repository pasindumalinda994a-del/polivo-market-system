import { initializeNewDatabase, openExistingDatabase } from "./connection.js";
import { applyPendingMigrations, getMigrationStatus } from "./migrations/runner.js";
import { requireAbsoluteDatabasePath } from "./paths.js";

function readDbPathFromEnv(): string {
  const raw = process.env.POLIVO_LOCAL_DB_PATH;
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(
      [
        "POLIVO_LOCAL_DB_PATH is required and must be an absolute filesystem path outside the repository for operational use.",
        'PowerShell: $env:POLIVO_LOCAL_DB_PATH = "C:\\PolivoData\\stall.sqlite"',
        "cmd.exe: set POLIVO_LOCAL_DB_PATH=C:\\PolivoData\\stall.sqlite",
      ].join(" "),
    );
  }
  return requireAbsoluteDatabasePath(raw);
}

function printStatus(path: string): void {
  const local = openExistingDatabase(path);
  try {
    const status = getMigrationStatus(local.db);
    console.log(
      JSON.stringify(
        {
          path: local.path,
          applied: status.applied,
          pending: status.pending.map((migration) => ({
            id: migration.id,
            name: migration.name,
            checksum: migration.checksum,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    local.close();
  }
}

function runInit(path: string): void {
  const local = initializeNewDatabase(path);
  try {
    const status = getMigrationStatus(local.db);
    console.log(
      JSON.stringify(
        {
          action: "init",
          path: local.path,
          applied: status.applied,
        },
        null,
        2,
      ),
    );
  } finally {
    local.close();
  }
}

function runMigrate(path: string): void {
  const local = openExistingDatabase(path);
  try {
    const applied = applyPendingMigrations(local.db);
    console.log(
      JSON.stringify(
        {
          action: "migrate",
          path: local.path,
          newlyApplied: applied,
        },
        null,
        2,
      ),
    );
  } finally {
    local.close();
  }
}

function main(argv: string[]): void {
  const command = argv[0];
  if (command === undefined) {
    throw new Error("Usage: db-local <init|migrate|status>");
  }

  const path = readDbPathFromEnv();

  switch (command) {
    case "init":
      runInit(path);
      return;
    case "migrate":
      runMigrate(path);
      return;
    case "status":
      printStatus(path);
      return;
    default:
      throw new Error(`Unknown command "${command}". Use init, migrate, or status.`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: "error", msg: message }));
  process.exitCode = 1;
}
