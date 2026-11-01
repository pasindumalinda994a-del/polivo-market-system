import {
  mapLocalInstallationRow,
  mapStallBindingRow,
  type LocalInstallationRecord,
  type StallBindingRecord,
} from "../mapping/records.js";
import { NotFoundError, type DbExecutor } from "./types.js";

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
