import type { BillType } from "../mapping/records.js";
import { SequenceConfigurationError, type DbExecutor } from "./types.js";

/** Upper bound for allocated sequence numbers (safe integer). */
export const BILL_SEQUENCE_MAX_VALUE = Number.MAX_SAFE_INTEGER;

/** Approved trader (buyer) bill sequence start (ADR 0003 / Phase 22). */
export const TRADER_BILL_SEQUENCE_START = 444_444;

/** Approved farmer bill sequence start (ADR 0003; used from Phase 24). */
export const FARMER_BILL_SEQUENCE_START = 111_111;

/** Approved payment receipt/payout sequence start (ADR 0017 / Phase 26). */
export const PAYMENT_SEQUENCE_START = 100_001;

export type PaymentSequenceType = "receipt" | "payout";

/**
 * Ensure per-type bill sequences exist for a stall without resetting configured values.
 * Seeds trader at 444444 and farmer at 111111 when rows are missing.
 */
export function ensureBillSequencesForStall(executor: DbExecutor, stallId: string): void {
  executor.db
    .prepare(
      `INSERT OR IGNORE INTO bill_sequences (stall_id, bill_type, next_value)
       VALUES (?, 'trader', ?)`,
    )
    .run(stallId, TRADER_BILL_SEQUENCE_START);
  executor.db
    .prepare(
      `INSERT OR IGNORE INTO bill_sequences (stall_id, bill_type, next_value)
       VALUES (?, 'farmer', ?)`,
    )
    .run(stallId, FARMER_BILL_SEQUENCE_START);
}

/**
 * Atomically allocate the next bill sequence for a stall and bill type.
 * Requires a configured bill_sequences row. Does not use MAX(bill_number)+1.
 * Must participate in the caller's transaction.
 */
export function allocateNextBillSequence(
  executor: DbExecutor,
  stallId: string,
  billType: BillType,
): number {
  const current = executor.db
    .prepare(
      `SELECT next_value
       FROM bill_sequences
       WHERE stall_id = ? AND bill_type = ?`,
    )
    .get(stallId, billType) as { next_value: number | bigint } | undefined;

  if (current === undefined) {
    throw new SequenceConfigurationError(
      `Bill sequence is not configured for stall "${stallId}" and type "${billType}".`,
    );
  }

  const nextValue =
    typeof current.next_value === "bigint" ? Number(current.next_value) : current.next_value;

  if (!Number.isSafeInteger(nextValue) || nextValue < 0) {
    throw new SequenceConfigurationError(
      `Bill sequence next_value is invalid for stall "${stallId}" and type "${billType}".`,
    );
  }

  if (nextValue > BILL_SEQUENCE_MAX_VALUE) {
    throw new SequenceConfigurationError(
      `Bill sequence next_value exceeds the supported numeric bound for stall "${stallId}" and type "${billType}".`,
    );
  }

  // Allocate current next_value, then advance for the following caller.
  const allocated = nextValue;
  const advanced = allocated + 1;
  if (advanced > BILL_SEQUENCE_MAX_VALUE) {
    throw new SequenceConfigurationError(
      `Allocating the next bill sequence would exceed the supported numeric bound.`,
    );
  }

  const result = executor.db
    .prepare(
      `UPDATE bill_sequences
       SET next_value = ?
       WHERE stall_id = ? AND bill_type = ? AND next_value = ?`,
    )
    .run(advanced, stallId, billType, allocated);

  if (result.changes !== 1) {
    throw new SequenceConfigurationError(
      "Bill sequence allocation lost a race inside the transaction.",
    );
  }

  return allocated;
}

/**
 * Ensure per-type payment sequences exist for a stall without resetting configured values.
 */
export function ensurePaymentSequencesForStall(executor: DbExecutor, stallId: string): void {
  executor.db
    .prepare(
      `INSERT OR IGNORE INTO payment_sequences (stall_id, payment_type, next_value)
       VALUES (?, 'receipt', ?)`,
    )
    .run(stallId, PAYMENT_SEQUENCE_START);
  executor.db
    .prepare(
      `INSERT OR IGNORE INTO payment_sequences (stall_id, payment_type, next_value)
       VALUES (?, 'payout', ?)`,
    )
    .run(stallId, PAYMENT_SEQUENCE_START);
}

/**
 * Atomically allocate the next payment sequence for a stall and payment type.
 * Must participate in the caller's transaction.
 */
export function allocateNextPaymentSequence(
  executor: DbExecutor,
  stallId: string,
  paymentType: PaymentSequenceType,
): number {
  const current = executor.db
    .prepare(
      `SELECT next_value
       FROM payment_sequences
       WHERE stall_id = ? AND payment_type = ?`,
    )
    .get(stallId, paymentType) as { next_value: number | bigint } | undefined;

  if (current === undefined) {
    throw new SequenceConfigurationError(
      `Payment sequence is not configured for stall "${stallId}" and type "${paymentType}".`,
    );
  }

  const nextValue =
    typeof current.next_value === "bigint" ? Number(current.next_value) : current.next_value;

  if (!Number.isSafeInteger(nextValue) || nextValue < 0) {
    throw new SequenceConfigurationError(
      `Payment sequence next_value is invalid for stall "${stallId}" and type "${paymentType}".`,
    );
  }

  if (nextValue > BILL_SEQUENCE_MAX_VALUE) {
    throw new SequenceConfigurationError(
      `Payment sequence next_value exceeds the supported numeric bound for stall "${stallId}" and type "${paymentType}".`,
    );
  }

  const allocated = nextValue;
  const advanced = allocated + 1;
  if (advanced > BILL_SEQUENCE_MAX_VALUE) {
    throw new SequenceConfigurationError(
      `Allocating the next payment sequence would exceed the supported numeric bound.`,
    );
  }

  const result = executor.db
    .prepare(
      `UPDATE payment_sequences
       SET next_value = ?
       WHERE stall_id = ? AND payment_type = ? AND next_value = ?`,
    )
    .run(advanced, stallId, paymentType, allocated);

  if (result.changes !== 1) {
    throw new SequenceConfigurationError(
      "Payment sequence allocation lost a race inside the transaction.",
    );
  }

  return allocated;
}
