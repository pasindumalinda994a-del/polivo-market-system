import {
  mapPackageTypeRow,
  mapVegetableRow,
  type PackageTypeRecord,
  type VegetableRecord,
} from "../mapping/records.js";
import { RevisionConflictError, type DbExecutor } from "./types.js";
import { escapeLikePattern } from "./parties.js";

const VEGETABLE_SELECT_COLUMNS = `id, stall_id, short_code, display_name, is_active, revision,
              created_at, updated_at`;

const PACKAGE_TYPE_SELECT_COLUMNS = VEGETABLE_SELECT_COLUMNS;

export function getVegetableById(
  executor: DbExecutor,
  stallId: string,
  vegetableId: string,
): VegetableRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${VEGETABLE_SELECT_COLUMNS}
       FROM vegetables
       WHERE id = ? AND stall_id = ?`,
    )
    .get(vegetableId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapVegetableRow(row);
}

export function getVegetableByShortCode(
  executor: DbExecutor,
  stallId: string,
  shortCode: string,
): VegetableRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${VEGETABLE_SELECT_COLUMNS}
       FROM vegetables
       WHERE stall_id = ? AND short_code = ?`,
    )
    .get(stallId, shortCode) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapVegetableRow(row);
}

export type InsertVegetableInput = {
  id: string;
  stallId: string;
  shortCode: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function insertVegetable(
  executor: DbExecutor,
  input: InsertVegetableInput,
): VegetableRecord {
  executor.db
    .prepare(
      `INSERT INTO vegetables (
         id, stall_id, short_code, display_name, is_active, revision, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.shortCode,
      input.displayName,
      input.isActive ? 1 : 0,
      input.createdAt,
      input.updatedAt,
    );

  const created = getVegetableById(executor, input.stallId, input.id);
  if (created === null) {
    throw new Error("Vegetable insert did not persist.");
  }
  return created;
}

export type CatalogActiveFilter = "active" | "inactive" | "all";

export type SearchVegetablesInput = {
  stallId: string;
  query?: string;
  active: CatalogActiveFilter;
  limit: number;
  offset: number;
};

export type SearchVegetablesResult = {
  items: VegetableRecord[];
  totalMatched: number;
};

export function searchVegetables(
  executor: DbExecutor,
  input: SearchVegetablesInput,
): SearchVegetablesResult {
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
    .prepare(`SELECT COUNT(*) AS count FROM vegetables WHERE ${whereSql}`)
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
      `SELECT ${VEGETABLE_SELECT_COLUMNS}
       FROM vegetables
       WHERE ${whereSql}
       ORDER BY ${orderExact}short_code ASC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...orderParams, input.limit, input.offset) as Record<string, unknown>[];

  return {
    items: rows.map((row) => mapVegetableRow(row)),
    totalMatched,
  };
}

export type VegetableOptimisticDetailsUpdate = {
  expectedRevision: number;
  displayName: string;
  updatedAt: string;
};

export function updateVegetableWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  vegetableId: string,
  update: VegetableOptimisticDetailsUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE vegetables
       SET display_name = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(update.displayName, update.updatedAt, vegetableId, stallId, update.expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

export type VegetableStatusUpdate = {
  expectedRevision: number;
  isActive: boolean;
  updatedAt: string;
};

export function setVegetableActiveWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  vegetableId: string,
  update: VegetableStatusUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE vegetables
       SET is_active = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(update.isActive ? 1 : 0, update.updatedAt, vegetableId, stallId, update.expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

export function getPackageTypeById(
  executor: DbExecutor,
  stallId: string,
  packageTypeId: string,
): PackageTypeRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${PACKAGE_TYPE_SELECT_COLUMNS}
       FROM package_types
       WHERE id = ? AND stall_id = ?`,
    )
    .get(packageTypeId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPackageTypeRow(row);
}

export function getPackageTypeByShortCode(
  executor: DbExecutor,
  stallId: string,
  shortCode: string,
): PackageTypeRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${PACKAGE_TYPE_SELECT_COLUMNS}
       FROM package_types
       WHERE stall_id = ? AND short_code = ?`,
    )
    .get(stallId, shortCode) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapPackageTypeRow(row);
}

export type InsertPackageTypeInput = {
  id: string;
  stallId: string;
  shortCode: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function insertPackageType(
  executor: DbExecutor,
  input: InsertPackageTypeInput,
): PackageTypeRecord {
  executor.db
    .prepare(
      `INSERT INTO package_types (
         id, stall_id, short_code, display_name, is_active, revision, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.id,
      input.stallId,
      input.shortCode,
      input.displayName,
      input.isActive ? 1 : 0,
      input.createdAt,
      input.updatedAt,
    );

  const created = getPackageTypeById(executor, input.stallId, input.id);
  if (created === null) {
    throw new Error("Package type insert did not persist.");
  }
  return created;
}

export type SearchPackageTypesInput = {
  stallId: string;
  query?: string;
  active: CatalogActiveFilter;
  limit: number;
  offset: number;
};

export type SearchPackageTypesResult = {
  items: PackageTypeRecord[];
  totalMatched: number;
};

export function searchPackageTypes(
  executor: DbExecutor,
  input: SearchPackageTypesInput,
): SearchPackageTypesResult {
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
    .prepare(`SELECT COUNT(*) AS count FROM package_types WHERE ${whereSql}`)
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
      `SELECT ${PACKAGE_TYPE_SELECT_COLUMNS}
       FROM package_types
       WHERE ${whereSql}
       ORDER BY ${orderExact}short_code ASC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...orderParams, input.limit, input.offset) as Record<string, unknown>[];

  return {
    items: rows.map((row) => mapPackageTypeRow(row)),
    totalMatched,
  };
}

export type PackageTypeOptimisticDetailsUpdate = {
  expectedRevision: number;
  displayName: string;
  updatedAt: string;
};

export function updatePackageTypeWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  packageTypeId: string,
  update: PackageTypeOptimisticDetailsUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE package_types
       SET display_name = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(update.displayName, update.updatedAt, packageTypeId, stallId, update.expectedRevision);

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}

export type PackageTypeStatusUpdate = {
  expectedRevision: number;
  isActive: boolean;
  updatedAt: string;
};

export function setPackageTypeActiveWithExpectedRevision(
  executor: DbExecutor,
  stallId: string,
  packageTypeId: string,
  update: PackageTypeStatusUpdate,
): number {
  const result = executor.db
    .prepare(
      `UPDATE package_types
       SET is_active = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND stall_id = ? AND revision = ?`,
    )
    .run(
      update.isActive ? 1 : 0,
      update.updatedAt,
      packageTypeId,
      stallId,
      update.expectedRevision,
    );

  if (result.changes !== 1) {
    throw new RevisionConflictError();
  }

  return update.expectedRevision + 1;
}
