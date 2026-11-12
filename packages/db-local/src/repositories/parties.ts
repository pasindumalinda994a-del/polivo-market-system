import {
  mapBuyerRow,
  mapFarmerRow,
  mapPartyRow,
  type BuyerRecord,
  type FarmerRecord,
  type PartyRecord,
} from "../mapping/records.js";
import { RevisionConflictError, type DbExecutor } from "./types.js";

const FARMER_SELECT_COLUMNS = `id, stall_id, short_code, display_name, is_active, revision,
              contact_number, locality, created_at, updated_at`;

export function getFarmerById(
  executor: DbExecutor,
  stallId: string,
  farmerId: string,
): FarmerRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${FARMER_SELECT_COLUMNS}
       FROM farmers
       WHERE id = ? AND stall_id = ?`,
    )
    .get(farmerId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapFarmerRow(row);
}

export function getFarmerByShortCode(
  executor: DbExecutor,
  stallId: string,
  shortCode: string,
): FarmerRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${FARMER_SELECT_COLUMNS}
       FROM farmers
       WHERE stall_id = ? AND short_code = ?`,
    )
    .get(stallId, shortCode) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapFarmerRow(row);
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

export type InsertFarmerInput = {
  id: string;
  stallId: string;
  shortCode: string;
  displayName: string;
  contactNumber: string | null;
  locality: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function insertFarmer(executor: DbExecutor, input: InsertFarmerInput): FarmerRecord {
  executor.db
    .prepare(
      `INSERT INTO farmers (
         id, stall_id, short_code, display_name, is_active, revision,
         contact_number, locality, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.shortCode,
      input.displayName,
      input.isActive ? 1 : 0,
      input.contactNumber,
      input.locality,
      input.createdAt,
      input.updatedAt,
    );

  const created = getFarmerById(executor, input.stallId, input.id);
  if (created === null) {
    throw new Error("Farmer insert did not persist.");
  }
  return created;
}

/** Escape LIKE metacharacters so user input is treated as literal text. */
export function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export type FarmerActiveFilter = "active" | "inactive" | "all";

export type SearchFarmersInput = {
  stallId: string;
  query?: string;
  active: FarmerActiveFilter;
  limit: number;
  offset: number;
};

export type SearchFarmersResult = {
  items: FarmerRecord[];
  totalMatched: number;
};

/**
 * Search farmers for operational lookup.
 * Exact short-code matches are ranked first; remaining ties use short_code, id.
 * Case and Unicode: SQLite LIKE is case-insensitive for ASCII by default;
 * Sinhala and other Unicode comparisons follow the SQLite build's NOCASE rules
 * (typically case-sensitive for non-ASCII). Exact short-code uses `=`.
 */
export function searchFarmers(
  executor: DbExecutor,
  input: SearchFarmersInput,
): SearchFarmersResult {
  const conditions: string[] = ["stall_id = ?"];
  const params: Array<string | number> = [input.stallId];

  if (input.active === "active") {
    conditions.push("is_active = 1");
  } else if (input.active === "inactive") {
    conditions.push("is_active = 0");
  }

  const trimmedQuery = input.query?.trim() ?? "";
  if (trimmedQuery.length > 0) {
    const escaped = escapeLikePattern(trimmedQuery);
    conditions.push(
      `(short_code = ? OR short_code LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')`,
    );
    params.push(trimmedQuery, `${escaped}%`, `%${escaped}%`);
  }

  const whereSql = conditions.join(" AND ");

  const countRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM farmers WHERE ${whereSql}`)
    .get(...params) as { count: number };
  const totalMatched = Number(countRow.count);

  const orderParams = [...params];
  let orderExact = "";
  if (trimmedQuery.length > 0) {
    orderExact = `CASE WHEN short_code = ? THEN 0 ELSE 1 END, `;
    orderParams.push(trimmedQuery);
  }

  const rows = executor.db
    .prepare(
      `SELECT ${FARMER_SELECT_COLUMNS}
       FROM farmers
       WHERE ${whereSql}
       ORDER BY ${orderExact}short_code ASC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...orderParams, input.limit, input.offset) as Record<string, unknown>[];

  return {
    items: rows.map((row) => mapFarmerRow(row)),
    totalMatched,
  };
}

export type FarmerOptimisticDetailsUpdate = {
  expectedRevision: number;
  displayName?: string;
  contactNumber?: string | null;
  locality?: string | null;
  updatedAt: string;
};

/**
 * Update farmer details when revision matches. Short code is not editable here.
 * Returns the new revision.
 */
export function updateFarmerWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  farmerId: string,
  update: FarmerOptimisticDetailsUpdate,
): number {
  const sets: string[] = ["revision = revision + 1", "updated_at = ?"];
  const params: Array<string | number | null> = [update.updatedAt];

  if (update.displayName !== undefined) {
    sets.push("display_name = ?");
    params.push(update.displayName);
  }
  if (update.contactNumber !== undefined) {
    sets.push("contact_number = ?");
    params.push(update.contactNumber);
  }
  if (update.locality !== undefined) {
    sets.push("locality = ?");
    params.push(update.locality);
  }

  params.push(farmerId, stallId, update.expectedRevision);

  const result = executor.db
    .prepare(
      `UPDATE farmers
       SET ${sets.join(", ")}
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(...params);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

export type FarmerStatusUpdate = {
  expectedRevision: number;
  isActive: boolean;
  updatedAt: string;
};

export function setFarmerActiveWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  farmerId: string,
  update: FarmerStatusUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE farmers
       SET is_active = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(update.isActive ? 1 : 0, update.updatedAt, farmerId, stallId, update.expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

const BUYER_SELECT_COLUMNS = `id, stall_id, short_code, display_name, is_active, revision,
              contact_number, locality, created_at, updated_at`;

export function getBuyerById(
  executor: DbExecutor,
  stallId: string,
  buyerId: string,
): BuyerRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${BUYER_SELECT_COLUMNS}
       FROM traders
       WHERE id = ? AND stall_id = ?`,
    )
    .get(buyerId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapBuyerRow(row);
}

export function getBuyerByShortCode(
  executor: DbExecutor,
  stallId: string,
  shortCode: string,
): BuyerRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${BUYER_SELECT_COLUMNS}
       FROM traders
       WHERE stall_id = ? AND short_code = ?`,
    )
    .get(stallId, shortCode) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapBuyerRow(row);
}

export type InsertBuyerInput = {
  id: string;
  stallId: string;
  shortCode: string;
  displayName: string;
  contactNumber: string | null;
  locality: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function insertBuyer(executor: DbExecutor, input: InsertBuyerInput): BuyerRecord {
  executor.db
    .prepare(
      `INSERT INTO traders (
         id, stall_id, short_code, display_name, is_active, revision,
         contact_number, locality, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.shortCode,
      input.displayName,
      input.isActive ? 1 : 0,
      input.contactNumber,
      input.locality,
      input.createdAt,
      input.updatedAt,
    );

  const created = getBuyerById(executor, input.stallId, input.id);
  if (created === null) {
    throw new Error("Buyer insert did not persist.");
  }
  return created;
}

export type BuyerActiveFilter = "active" | "inactive" | "all";

export type SearchBuyersInput = {
  stallId: string;
  query?: string;
  active: BuyerActiveFilter;
  limit: number;
  offset: number;
};

export type SearchBuyersResult = {
  items: BuyerRecord[];
  totalMatched: number;
};

/**
 * Search buyers stored on the traders table.
 * Exact short-code matches are ranked first; remaining ties use short_code, id.
 */
export function searchBuyers(executor: DbExecutor, input: SearchBuyersInput): SearchBuyersResult {
  const conditions: string[] = ["stall_id = ?"];
  const params: Array<string | number> = [input.stallId];

  if (input.active === "active") {
    conditions.push("is_active = 1");
  } else if (input.active === "inactive") {
    conditions.push("is_active = 0");
  }

  const trimmedQuery = input.query?.trim() ?? "";
  if (trimmedQuery.length > 0) {
    const escaped = escapeLikePattern(trimmedQuery);
    conditions.push(
      `(short_code = ? OR short_code LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')`,
    );
    params.push(trimmedQuery, `${escaped}%`, `%${escaped}%`);
  }

  const whereSql = conditions.join(" AND ");

  const countRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM traders WHERE ${whereSql}`)
    .get(...params) as { count: number };
  const totalMatched = Number(countRow.count);

  const orderParams = [...params];
  let orderExact = "";
  if (trimmedQuery.length > 0) {
    orderExact = `CASE WHEN short_code = ? THEN 0 ELSE 1 END, `;
    orderParams.push(trimmedQuery);
  }

  const rows = executor.db
    .prepare(
      `SELECT ${BUYER_SELECT_COLUMNS}
       FROM traders
       WHERE ${whereSql}
       ORDER BY ${orderExact}short_code ASC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...orderParams, input.limit, input.offset) as Record<string, unknown>[];

  return {
    items: rows.map((row) => mapBuyerRow(row)),
    totalMatched,
  };
}

export type BuyerOptimisticDetailsUpdate = {
  expectedRevision: number;
  displayName?: string;
  contactNumber?: string | null;
  locality?: string | null;
  updatedAt: string;
};

export function updateBuyerWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  buyerId: string,
  update: BuyerOptimisticDetailsUpdate,
): number {
  const sets: string[] = ["revision = revision + 1", "updated_at = ?"];
  const params: Array<string | number | null> = [update.updatedAt];

  if (update.displayName !== undefined) {
    sets.push("display_name = ?");
    params.push(update.displayName);
  }
  if (update.contactNumber !== undefined) {
    sets.push("contact_number = ?");
    params.push(update.contactNumber);
  }
  if (update.locality !== undefined) {
    sets.push("locality = ?");
    params.push(update.locality);
  }

  params.push(buyerId, stallId, update.expectedRevision);

  const result = executor.db
    .prepare(
      `UPDATE traders
       SET ${sets.join(", ")}
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(...params);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

export type BuyerStatusUpdate = {
  expectedRevision: number;
  isActive: boolean;
  updatedAt: string;
};

export function setBuyerActiveWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  buyerId: string,
  update: BuyerStatusUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE traders
       SET is_active = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(update.isActive ? 1 : 0, update.updatedAt, buyerId, stallId, update.expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}
