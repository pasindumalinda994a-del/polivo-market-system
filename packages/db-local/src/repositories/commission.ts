import {
  mapCommissionBandRow,
  mapCommissionBandSetRow,
  mapCommissionPolicyStateRow,
  type CommissionBandRecord,
  type CommissionBandSetRecord,
  type CommissionPolicyStateRecord,
} from "../mapping/records.js";
import { moneyMinorToSqliteInteger } from "../numeric.js";
import { RevisionConflictError, type DbExecutor } from "./types.js";

const POLICY_SELECT = `stall_id, active_band_set_id, revision, updated_at`;

const BAND_SET_SELECT = `id, stall_id, version_number, effective_from, created_at,
              created_by_staff_id, activated_at, activated_by_staff_id, previous_band_set_id`;

const BAND_SELECT = `id, stall_id, band_set_id, sort_order,
              min_price_per_kg_minor, max_price_per_kg_minor, rate_per_kg_minor`;

export function getCommissionPolicyState(
  executor: DbExecutor,
  stallId: string,
): CommissionPolicyStateRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${POLICY_SELECT}
       FROM commission_policies
       WHERE stall_id = ?`,
    )
    .get(stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapCommissionPolicyStateRow(row);
}

/** Ensure a policy pointer row exists for the stall (revision 1, unconfigured). */
export function ensureCommissionPolicyState(
  executor: DbExecutor,
  stallId: string,
  updatedAt: string,
): CommissionPolicyStateRecord {
  const existing = getCommissionPolicyState(executor, stallId);
  if (existing !== null) {
    return existing;
  }
  executor.db
    .prepare(
      `INSERT INTO commission_policies (stall_id, active_band_set_id, revision, updated_at)
       VALUES (?, NULL, 1, ?)`,
    )
    .run(stallId, updatedAt);
  const created = getCommissionPolicyState(executor, stallId);
  if (created === null) {
    throw new Error("Commission policy state insert did not persist.");
  }
  return created;
}

export function getCommissionBandSetById(
  executor: DbExecutor,
  stallId: string,
  bandSetId: string,
): CommissionBandSetRecord | null {
  const row = executor.db
    .prepare(
      `SELECT ${BAND_SET_SELECT}
       FROM commission_band_sets
       WHERE id = ? AND stall_id = ?`,
    )
    .get(bandSetId, stallId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapCommissionBandSetRow(row);
}

export function listCommissionBandsForSet(
  executor: DbExecutor,
  stallId: string,
  bandSetId: string,
): CommissionBandRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT ${BAND_SELECT}
       FROM commission_bands
       WHERE stall_id = ? AND band_set_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(stallId, bandSetId) as Record<string, unknown>[];
  return rows.map((row) => mapCommissionBandRow(row));
}

export type CommissionVersionSummary = {
  bandSet: CommissionBandSetRecord;
  bandCount: number;
};

export type ListCommissionVersionsInput = {
  stallId: string;
  limit: number;
  offset: number;
};

export type ListCommissionVersionsResult = {
  items: CommissionVersionSummary[];
  totalMatched: number;
};

export function listCommissionVersions(
  executor: DbExecutor,
  input: ListCommissionVersionsInput,
): ListCommissionVersionsResult {
  const countRow = executor.db
    .prepare(`SELECT COUNT(*) AS count FROM commission_band_sets WHERE stall_id = ?`)
    .get(input.stallId) as { count: number };
  const totalMatched = Number(countRow.count);

  const rows = executor.db
    .prepare(
      `SELECT ${BAND_SET_SELECT}
       FROM commission_band_sets
       WHERE stall_id = ?
       ORDER BY version_number DESC, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(input.stallId, input.limit, input.offset) as Record<string, unknown>[];

  const items = rows.map((row) => {
    const bandSet = mapCommissionBandSetRow(row);
    const bandCountRow = executor.db
      .prepare(
        `SELECT COUNT(*) AS count FROM commission_bands WHERE stall_id = ? AND band_set_id = ?`,
      )
      .get(input.stallId, bandSet.id) as { count: number };
    return {
      bandSet,
      bandCount: Number(bandCountRow.count),
    };
  });

  return { items, totalMatched };
}

export type ActivateCommissionBandInput = {
  id: string;
  minPricePerKgMinor: number;
  maxPricePerKgMinor: number | null;
  ratePerKgMinor: number;
};

export type ActivateCommissionPolicyInput = {
  stallId: string;
  expectedRevision: number;
  bandSetId: string;
  bands: readonly ActivateCommissionBandInput[];
  createdByStaffId: string;
  activatedByStaffId: string;
  activatedAt: string;
  updatedAt: string;
};

export type ActivateCommissionPolicyResult = {
  policyState: CommissionPolicyStateRecord;
  bandSet: CommissionBandSetRecord;
  bands: CommissionBandRecord[];
  previousActiveBandSetId: string | null;
};

/**
 * Atomically publish a new immutable band set and point the stall active pointer at it.
 * Caller must run inside runInTransaction. Domain validation belongs to the service layer.
 */
export function activateCommissionPolicyWithExpectedRevision(
  executor: DbExecutor,
  input: ActivateCommissionPolicyInput,
): ActivateCommissionPolicyResult {
  const state = ensureCommissionPolicyState(executor, input.stallId, input.updatedAt);
  if (state.revision !== input.expectedRevision) {
    throw new RevisionConflictError(
      `Commission policy revision conflict for stall ${input.stallId}.`,
    );
  }

  const previousActiveBandSetId = state.activeBandSetId;
  const nextVersionRow = executor.db
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM commission_band_sets
       WHERE stall_id = ?`,
    )
    .get(input.stallId) as { next_version: number };
  const versionNumber = Number(nextVersionRow.next_version);

  executor.db
    .prepare(
      `INSERT INTO commission_band_sets (
         id, stall_id, effective_from, created_at, version_number,
         created_by_staff_id, activated_at, activated_by_staff_id, previous_band_set_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.bandSetId,
      input.stallId,
      input.activatedAt,
      input.activatedAt,
      versionNumber,
      input.createdByStaffId,
      input.activatedAt,
      input.activatedByStaffId,
      previousActiveBandSetId,
    );

  const insertBand = executor.db.prepare(
    `INSERT INTO commission_bands (
       id, stall_id, band_set_id, sort_order,
       min_price_per_kg_minor, max_price_per_kg_minor, rate_per_kg_minor
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  input.bands.forEach((band, index) => {
    insertBand.run(
      band.id,
      input.stallId,
      input.bandSetId,
      index + 1,
      moneyMinorToSqliteInteger(band.minPricePerKgMinor),
      band.maxPricePerKgMinor === null ? null : moneyMinorToSqliteInteger(band.maxPricePerKgMinor),
      moneyMinorToSqliteInteger(band.ratePerKgMinor),
    );
  });

  const update = executor.db
    .prepare(
      `UPDATE commission_policies
       SET active_band_set_id = ?, revision = revision + 1, updated_at = ?
       WHERE stall_id = ? AND revision = ?`,
    )
    .run(input.bandSetId, input.updatedAt, input.stallId, input.expectedRevision);

  if (update.changes !== 1) {
    throw new RevisionConflictError(
      `Commission policy revision conflict for stall ${input.stallId}.`,
    );
  }

  const policyState = getCommissionPolicyState(executor, input.stallId);
  const bandSet = getCommissionBandSetById(executor, input.stallId, input.bandSetId);
  if (policyState === null || bandSet === null) {
    throw new Error("Commission policy activation did not persist.");
  }

  return {
    policyState,
    bandSet,
    bands: listCommissionBandsForSet(executor, input.stallId, input.bandSetId),
    previousActiveBandSetId,
  };
}
