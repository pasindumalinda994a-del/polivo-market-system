import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MigrationDefinition = {
  id: string;
  name: string;
  sql: string;
  checksum: string;
};

const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/;

function checksumFor(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function resolveBundledMigrationsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "sql");
}

export function loadMigrationsFromDirectory(directory: string): MigrationDefinition[] {
  const files = readdirSync(directory)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b));

  const migrations: MigrationDefinition[] = [];

  for (const fileName of files) {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (match === null) {
      continue;
    }
    const id = match[1];
    const name = match[2];
    if (id === undefined || name === undefined) {
      throw new Error(`Invalid migration file name: ${fileName}`);
    }
    const sql = readFileSync(join(directory, fileName), "utf8");
    migrations.push({
      id,
      name,
      sql,
      checksum: checksumFor(sql),
    });
  }

  return migrations;
}

export function loadBundledMigrations(): MigrationDefinition[] {
  return loadMigrationsFromDirectory(resolveBundledMigrationsDirectory());
}

export function migrationChecksum(sql: string): string {
  return checksumFor(sql);
}
