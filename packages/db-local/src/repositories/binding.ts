import {
  mapLocalInstallationRow,
  mapStallBindingRow,
  type LocalInstallationRecord,
  type StallBindingRecord,
} from "../mapping/records.js";
import { NotFoundError, RepositoryError, type DbExecutor } from "./types.js";

export function getLocalInstallation(executor: DbExecutor): LocalInstallationRecord {
  const row = executor.db.prepare(`SELECT id, created_at FROM local_installation LIMIT 1`).get() as
    Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("Local installation identity is missing.");
  }
  return mapLocalInstallationRow(row);
}

export function getStallBinding(executor: DbExecutor): StallBindingRecord {
  const row = executor.db
    .prepare(`SELECT stall_id, tenant_id, bound_at FROM stall_binding WHERE id = 1`)
    .get() as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("Stall binding is not configured for this database.");
  }
  return mapStallBindingRow(row);
}

export function tryGetStallBinding(executor: DbExecutor): StallBindingRecord | null {
  const row = executor.db
    .prepare(`SELECT stall_id, tenant_id, bound_at FROM stall_binding WHERE id = 1`)
    .get() as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapStallBindingRow(row);
}

export type InsertStallBindingInput = {
  stallId: string;
  tenantId: string;
  boundAt: string;
};

/**
 * Inserts the singleton stall binding. Refuses to overwrite an existing binding
 * (including a binding to the same stall) — recovery/replacement is a later phase.
 */
export function insertStallBinding(
  executor: DbExecutor,
  input: InsertStallBindingInput,
): StallBindingRecord {
  const existing = tryGetStallBinding(executor);
  if (existing !== null) {
    if (existing.stallId !== input.stallId || existing.tenantId !== input.tenantId) {
      throw new RepositoryError(
        "This database is already bound to another stall. Refusing to overwrite the binding.",
      );
    }
    throw new RepositoryError("Stall binding already exists for this database.");
  }

  executor.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, ?, ?, ?)`,
    )
    .run(input.stallId, input.tenantId, input.boundAt);

  return getStallBinding(executor);
}
