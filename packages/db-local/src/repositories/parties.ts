import { mapPartyRow, type PartyRecord } from "../mapping/records.js";
import type { DbExecutor } from "./types.js";

export function getFarmerById(
  executor: DbExecutor,
  stallId: string,
  farmerId: string,
): PartyRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, short_code, display_name, is_active, created_at, updated_at
       FROM farmers
       WHERE id = ? AND stall_id = ?`,
    )
    .get(farmerId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPartyRow(row, "farmers");
}

export function getTraderById(
  executor: DbExecutor,
  stallId: string,
  traderId: string,
): PartyRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, stall_id, short_code, display_name, is_active, created_at, updated_at
       FROM traders
       WHERE id = ? AND stall_id = ?`,
    )
    .get(traderId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPartyRow(row, "traders");
}
