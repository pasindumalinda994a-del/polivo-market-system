import type {
  AllocateExistingPaymentResponse,
  PaymentOperationResult,
  PaymentPostResponse,
  PaymentRecordDto,
  PaymentReversalCommitResponse,
} from "@polivo/contracts";

import type { PaymentCommitRecovery } from "../../../preload/index";

type ApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

export type CommitOutcome =
  /** The commit response was received. */
  | { status: "ok"; data: unknown }
  /** The response was lost, but the stored operation outcome was found. */
  | { status: "recovered"; operation: PaymentOperationResult }
  /** Definite failure; recovery was cleared. */
  | { status: "failed"; message: string }
  /** Outcome unknown; recovery is kept so the same operation can be retried or looked up. */
  | { status: "unknown"; message: string };

const UNKNOWN_OUTCOME_CODES = new Set(["SERVICE_UNAVAILABLE", "INTERNAL_ERROR", "TIMEOUT"]);

function bridge() {
  const payments = window.polivoPayments;
  if (!payments) {
    throw new Error("Payments bridge is unavailable.");
  }
  return payments;
}

export async function sendCommit(
  record: PaymentCommitRecovery,
  payload: Record<string, unknown> = record.payload,
): Promise<ApiResult<unknown>> {
  const payments = bridge();
  switch (record.kind) {
    case "post":
      return payments.post(payload, record.idempotencyKey);
    case "allocate":
      return payments.allocate(payload, record.idempotencyKey);
    case "reverse":
      return payments.reverse(payload, record.idempotencyKey);
  }
}

export async function lookupOperation(
  record: Pick<PaymentCommitRecovery, "kind" | "idempotencyKey">,
): Promise<{ ok: true; operation: PaymentOperationResult } | { ok: false; message: string }> {
  try {
    const lookup = await bridge().lookupOperation(record.idempotencyKey, record.kind);
    if (lookup.ok) {
      return { ok: true, operation: lookup.data as PaymentOperationResult };
    }
    return { ok: false, message: lookup.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Lookup failed." };
  }
}

/**
 * Persist recovery metadata first, send the commit, and resolve unknown outcomes through the
 * stored idempotent operation. Recovery is cleared only after a known outcome.
 */
export async function commitWithRecovery(record: PaymentCommitRecovery): Promise<CommitOutcome> {
  const payments = bridge();
  const stored = await payments.setRecovery(record);
  if (!stored.ok) {
    return { status: "failed", message: stored.message };
  }

  let result: ApiResult<unknown>;
  try {
    result = await sendCommit(record);
  } catch (error) {
    return {
      status: "unknown",
      message: `${error instanceof Error ? error.message : "Commit interrupted."} The outcome is unknown.`,
    };
  }

  if (result.ok) {
    await payments.clearRecovery();
    return { status: "ok", data: result.data };
  }

  if (UNKNOWN_OUTCOME_CODES.has(result.code) || result.conflict) {
    const lookup = await lookupOperation(record);
    if (lookup.ok) {
      await payments.clearRecovery();
      return { status: "recovered", operation: lookup.operation };
    }
    if (!result.conflict) {
      return {
        status: "unknown",
        message: `${result.message} The outcome is unknown; the same operation can be retried safely.`,
      };
    }
  }

  await payments.clearRecovery();
  return { status: "failed", message: result.message };
}

/** Pull the payment a commit response is about (for reversal: the reversal payment). */
export function paymentFromCommitData(
  kind: PaymentCommitRecovery["kind"],
  data: unknown,
): PaymentRecordDto {
  switch (kind) {
    case "post":
      return (data as PaymentPostResponse).payment;
    case "allocate":
      return (data as AllocateExistingPaymentResponse).payment;
    case "reverse":
      return (data as PaymentReversalCommitResponse).reversalPayment;
  }
}

export async function loadPayment(paymentId: string): Promise<PaymentRecordDto | string> {
  const result = await bridge().get(paymentId);
  return result.ok ? (result.data as PaymentRecordDto) : result.message;
}
