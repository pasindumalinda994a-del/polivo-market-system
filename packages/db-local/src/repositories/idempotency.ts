import { mapIdempotencyRow, type IdempotencyRecord } from "../mapping/records.js";
import type { DbExecutor } from "./types.js";

export function getIdempotencyRecord(
  executor: DbExecutor,
  scope: string,
  idempotencyKey: string,
): IdempotencyRecord | null {
  const row = executor.db
    .prepare(
      `SELECT scope, idempotency_key, command_type, request_fingerprint,
              result_ref, completed_at, created_at
       FROM command_idempotency
       WHERE scope = ? AND idempotency_key = ?`,
    )
    .get(scope, idempotencyKey) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapIdempotencyRow(row);
}

export type InsertCompletedIdempotencyInput = {
  scope: string;
  idempotencyKey: string;
  commandType: string;
  requestFingerprint: string;
  resultRef: string;
  completedAt: string;
  createdAt: string;
};

/** Persist a completed command result. Must run inside the caller's transaction. */
export function insertCompletedIdempotencyRecord(
  executor: DbExecutor,
  input: InsertCompletedIdempotencyInput,
): void {
  executor.db
    .prepare(
      `INSERT INTO command_idempotency (
         scope, idempotency_key, command_type, request_fingerprint,
         result_ref, completed_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.scope,
      input.idempotencyKey,
      input.commandType,
      input.requestFingerprint,
      input.resultRef,
      input.completedAt,
      input.createdAt,
    );
}
