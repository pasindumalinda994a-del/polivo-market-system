import {
  allocateExistingPaymentPreviewResponseSchema,
  allocateExistingPaymentResponseSchema,
  eligibleObligationsResponseSchema,
  listPaymentsResponseSchema,
  paymentOperationResultSchema,
  paymentPostResponseSchema,
  paymentPreviewResponseSchema,
  paymentRecordSchema,
  paymentReversalCommitResponseSchema,
  paymentReversalPreviewResponseSchema,
  type AllocateExistingPaymentPreviewRequest,
  type AllocateExistingPaymentPreviewResponse,
  type AllocateExistingPaymentRequest,
  type AllocateExistingPaymentResponse,
  type EligibleObligationsQuery,
  type EligibleObligationsResponse,
  type ListPaymentsResponse,
  type PaymentOperationResult,
  type PaymentPostRequest,
  type PaymentPostResponse,
  type PaymentPreviewRequest,
  type PaymentPreviewResponse,
  type PaymentRecordDto,
  type PaymentReversalCommitRequest,
  type PaymentReversalCommitResponse,
  type PaymentReversalPreviewRequest,
  type PaymentReversalPreviewResponse,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";
import {
  clearPaymentCommitRecovery,
  readPaymentCommitRecovery,
  writePaymentCommitRecovery,
  type PaymentCommitRecoveryRecord,
} from "./payment-commit-recovery.js";

export type PaymentsApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type PaymentsApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type PaymentsApiResult<T> = PaymentsApiSuccess<T> | PaymentsApiError;

export type PaymentOperationCommandType = "post" | "allocate" | "reverse";

function parseError(status: number, bodyText: string, fallback: string): PaymentsApiError {
  let code = "INTERNAL_ERROR";
  try {
    const parsed = JSON.parse(bodyText) as { code?: string; message?: string };
    if (typeof parsed.code === "string") {
      code = parsed.code;
    }
  } catch {
    // ignore
  }
  return {
    ok: false,
    code,
    message: mapHostApiError(status, bodyText, fallback),
    conflict: status === 409 || code === "CONFLICT",
  };
}

function ensureIdempotencyKey(idempotencyKey?: string): string {
  return idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey : randomUUID();
}

const UNAUTHENTICATED: PaymentsApiError = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "Staff session required.",
};

function unavailable(error: unknown): PaymentsApiError {
  return {
    ok: false,
    code: "SERVICE_UNAVAILABLE",
    message: error instanceof Error ? error.message : "Stall host unavailable",
  };
}

type RequestArgs<T> = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  fallback: string;
  parse: (value: unknown) => T;
};

async function hostCall<T>(args: RequestArgs<T>): Promise<PaymentsApiResult<T>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  try {
    const response = await authenticatedHostRequest({
      method: args.method,
      path: args.path,
      query: args.query,
      body: args.body,
      idempotencyKey: args.idempotencyKey,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, args.fallback);
    }
    return { ok: true, data: args.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return unavailable(error);
  }
}

export async function listEligibleObligations(
  input: EligibleObligationsQuery,
): Promise<PaymentsApiResult<EligibleObligationsResponse>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/payments/obligations",
      query: {
        partyKind: input.partyKind,
        partyId: input.partyId,
        direction: input.direction,
      },
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: {
          partyKind: input.partyKind,
          partyId: input.partyId,
          direction: input.direction,
          accountBalanceMinor: 0,
          obligations: [],
        },
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load payment obligations.");
    }
    return {
      ok: true,
      data: eligibleObligationsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return unavailable(error);
  }
}

export function previewPayment(
  input: PaymentPreviewRequest,
): Promise<PaymentsApiResult<PaymentPreviewResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments/preview",
    body: input,
    fallback: "Unable to preview payment.",
    parse: (value) => paymentPreviewResponseSchema.parse(value),
  });
}

export function postPayment(
  input: PaymentPostRequest,
  idempotencyKey?: string,
): Promise<PaymentsApiResult<PaymentPostResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments",
    body: input,
    idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    fallback: "Unable to post payment.",
    parse: (value) => paymentPostResponseSchema.parse(value),
  });
}

export async function listPayments(input?: {
  partyKind?: "trader" | "farmer";
  partyId?: string;
  direction?: "receive" | "pay";
  status?: "posted" | "reversed";
  businessDateFrom?: string;
  businessDateTo?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaymentsApiResult<ListPaymentsResponse>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/payments",
      query: {
        partyKind: input?.partyKind,
        partyId: input?.partyId,
        direction: input?.direction,
        status: input?.status,
        businessDateFrom: input?.businessDateFrom,
        businessDateTo: input?.businessDateTo,
        limit: input?.limit !== undefined ? String(input.limit) : undefined,
        cursor: input?.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null, totalCount: 0 }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list payments.");
    }
    return {
      ok: true,
      data: listPaymentsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return unavailable(error);
  }
}

export function getPayment(paymentId: string): Promise<PaymentsApiResult<PaymentRecordDto>> {
  return hostCall({
    method: "GET",
    path: `/payments/${paymentId}`,
    fallback: "Unable to load payment.",
    parse: (value) => paymentRecordSchema.parse(value),
  });
}

export function previewAllocate(
  input: AllocateExistingPaymentPreviewRequest,
): Promise<PaymentsApiResult<AllocateExistingPaymentPreviewResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments/allocate/preview",
    body: input,
    fallback: "Unable to preview allocation.",
    parse: (value) => allocateExistingPaymentPreviewResponseSchema.parse(value),
  });
}

export function allocateExisting(
  input: AllocateExistingPaymentRequest,
  idempotencyKey?: string,
): Promise<PaymentsApiResult<AllocateExistingPaymentResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments/allocate",
    body: input,
    idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    fallback: "Unable to allocate payment.",
    parse: (value) => allocateExistingPaymentResponseSchema.parse(value),
  });
}

export function previewReversal(
  input: PaymentReversalPreviewRequest,
): Promise<PaymentsApiResult<PaymentReversalPreviewResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments/reversals/preview",
    body: input,
    fallback: "Unable to preview payment reversal.",
    parse: (value) => paymentReversalPreviewResponseSchema.parse(value),
  });
}

export function reversePayment(
  input: PaymentReversalCommitRequest,
  idempotencyKey?: string,
): Promise<PaymentsApiResult<PaymentReversalCommitResponse>> {
  return hostCall({
    method: "POST",
    path: "/payments/reversals",
    body: input,
    idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    fallback: "Unable to reverse payment.",
    parse: (value) => paymentReversalCommitResponseSchema.parse(value),
  });
}

export function lookupPaymentOperation(
  idempotencyKey: string,
  commandType?: PaymentOperationCommandType,
): Promise<PaymentsApiResult<PaymentOperationResult>> {
  return hostCall({
    method: "GET",
    path: `/payments/operations/${encodeURIComponent(idempotencyKey)}`,
    query: { commandType },
    fallback: "Unable to look up payment operation.",
    parse: (value) => paymentOperationResultSchema.parse(value),
  });
}

export function getPaymentCommitRecovery(): PaymentCommitRecoveryRecord | null {
  return readPaymentCommitRecovery();
}

export function setPaymentCommitRecovery(record: PaymentCommitRecoveryRecord): void {
  writePaymentCommitRecovery(record);
}

export function clearPaymentCommitRecoveryRecord(): void {
  clearPaymentCommitRecovery();
}
