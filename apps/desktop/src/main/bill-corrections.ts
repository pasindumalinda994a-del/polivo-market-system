import {
  billHistoryChainDetailSchema,
  listBillHistoryResponseSchema,
  saleCorrectionCommitResponseSchema,
  saleCorrectionEligibilityResponseSchema,
  saleCorrectionPreviewResponseSchema,
  type BillHistoryChainDetailDto,
  type ListBillHistoryQuery,
  type ListBillHistoryResponse,
  type SaleCorrectionCommitRequest,
  type SaleCorrectionCommitResponse,
  type SaleCorrectionEligibilityResponse,
  type SaleCorrectionPreviewRequest,
  type SaleCorrectionPreviewResponse,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type BillCorrectionsApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type BillCorrectionsApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type BillCorrectionsApiResult<T> = BillCorrectionsApiSuccess<T> | BillCorrectionsApiError;

type CorrectionRecoveryState = {
  idempotencyKey: string;
  saleId: string;
  action: "correct" | "reverse";
  savedAt: string;
};

let correctionRecovery: CorrectionRecoveryState | null = null;

function parseError(status: number, bodyText: string, fallback: string): BillCorrectionsApiError {
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

export async function listBillHistory(
  query: ListBillHistoryQuery,
): Promise<BillCorrectionsApiResult<ListBillHistoryResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/bill-history",
      query: {
        billType: query.billType,
        billNumber: query.billNumber,
        partyQuery: query.partyQuery,
        businessDateFrom: query.businessDateFrom,
        businessDateTo: query.businessDateTo,
        issueDateFrom: query.issueDateFrom,
        issueDateTo: query.issueDateTo,
        documentStatus: query.documentStatus,
        correctionPresence: query.correctionPresence,
        limit: query.limit !== undefined ? String(query.limit) : undefined,
        cursor: query.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null, totalCount: 0 }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list bill history.");
    }
    return {
      ok: true,
      data: listBillHistoryResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to list bill history.",
    };
  }
}

export async function getBillHistoryDetail(input: {
  billType: "trader" | "farmer";
  billId: string;
}): Promise<BillCorrectionsApiResult<BillHistoryChainDetailDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/bill-history/${input.billType}/${encodeURIComponent(input.billId)}`,
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: false,
        code: "STALE",
        message: "Response ignored after connection change.",
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load bill detail.");
    }
    return {
      ok: true,
      data: billHistoryChainDetailSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to load bill detail.",
    };
  }
}

export async function getCorrectionEligibility(
  saleId: string,
): Promise<BillCorrectionsApiResult<SaleCorrectionEligibilityResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/sales/${encodeURIComponent(saleId)}/correction-eligibility`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to check eligibility.");
    }
    return {
      ok: true,
      data: saleCorrectionEligibilityResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to check eligibility.",
    };
  }
}

export async function previewCorrection(
  body: SaleCorrectionPreviewRequest,
): Promise<BillCorrectionsApiResult<SaleCorrectionPreviewResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/sales/corrections/preview",
      body,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to preview correction.");
    }
    return {
      ok: true,
      data: saleCorrectionPreviewResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to preview correction.",
    };
  }
}

export async function commitCorrection(
  body: SaleCorrectionCommitRequest,
  idempotencyKey?: string,
): Promise<BillCorrectionsApiResult<SaleCorrectionCommitResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = ensureIdempotencyKey(idempotencyKey);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/sales/corrections",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to commit correction.");
    }
    return {
      ok: true,
      data: saleCorrectionCommitResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to commit correction.",
    };
  }
}

export async function lookupCorrection(
  idempotencyKey: string,
): Promise<BillCorrectionsApiResult<SaleCorrectionCommitResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/sales/corrections/${encodeURIComponent(idempotencyKey)}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to look up correction outcome.",
      );
    }
    return {
      ok: true,
      data: saleCorrectionCommitResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Unable to look up correction outcome.",
    };
  }
}

export function getCorrectionRecovery(): CorrectionRecoveryState | null {
  return correctionRecovery;
}

export function setCorrectionRecovery(state: CorrectionRecoveryState): void {
  correctionRecovery = state;
}

export function clearCorrectionRecovery(): void {
  correctionRecovery = null;
}
