import {
  finalizeSaleResponseSchema,
  listSaleDraftsResponseSchema,
  listTraderBillsResponseSchema,
  saleDraftRecordSchema,
  salePreviewResponseSchema,
  traderBillRecordSchema,
  type CreateSaleDraftRequest,
  type FinalizeSaleRequest,
  type FinalizeSaleResponse,
  type ListSaleDraftsResponse,
  type ListTraderBillsResponse,
  type SaleDraftRecordDto,
  type SalePreviewResponse,
  type TraderBillRecordDto,
  type UpdateSaleDraftRequest,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type SalesBillingApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type SalesBillingApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type SalesBillingApiResult<T> = SalesBillingApiSuccess<T> | SalesBillingApiError;

function parseError(status: number, bodyText: string, fallback: string): SalesBillingApiError {
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

export async function createSaleDraft(
  input: CreateSaleDraftRequest,
  idempotencyKey?: string,
): Promise<SalesBillingApiResult<SaleDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/sales/drafts",
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to create sale draft.");
    }
    return {
      ok: true,
      data: saleDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listSaleDrafts(input?: {
  limit?: number;
  cursor?: string;
  traderId?: string;
}): Promise<SalesBillingApiResult<ListSaleDraftsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/sales/drafts",
      query: {
        limit: input?.limit !== undefined ? String(input.limit) : undefined,
        cursor: input?.cursor,
        traderId: input?.traderId,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list sale drafts.");
    }
    return {
      ok: true,
      data: listSaleDraftsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getSaleDraft(
  saleId: string,
): Promise<SalesBillingApiResult<SaleDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/sales/drafts/${saleId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load sale draft.");
    }
    return {
      ok: true,
      data: saleDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updateSaleDraft(
  saleId: string,
  input: UpdateSaleDraftRequest,
  idempotencyKey?: string,
): Promise<SalesBillingApiResult<SaleDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "PUT",
      path: `/sales/drafts/${saleId}`,
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update sale draft.");
    }
    return {
      ok: true,
      data: saleDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function abandonSaleDraft(
  saleId: string,
  input: { expectedRevision: number },
  idempotencyKey?: string,
): Promise<SalesBillingApiResult<SaleDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: `/sales/drafts/${saleId}/abandon`,
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to abandon sale draft.");
    }
    return {
      ok: true,
      data: saleDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function previewSaleDraft(
  saleId: string,
): Promise<SalesBillingApiResult<SalePreviewResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: `/sales/drafts/${saleId}/preview`,
      body: {},
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to preview sale draft.");
    }
    return {
      ok: true,
      data: salePreviewResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function finalizeSaleDraft(
  saleId: string,
  input: FinalizeSaleRequest,
  idempotencyKey?: string,
): Promise<SalesBillingApiResult<FinalizeSaleResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: `/sales/drafts/${saleId}/finalize`,
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to finalize sale.");
    }
    return {
      ok: true,
      data: finalizeSaleResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function lookupSaleFinalization(
  idempotencyKey: string,
): Promise<SalesBillingApiResult<FinalizeSaleResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/sales/finalizations/${idempotencyKey}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to look up finalization result.",
      );
    }
    return {
      ok: true,
      data: finalizeSaleResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listTraderBills(input?: {
  limit?: number;
  cursor?: string;
  traderId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
}): Promise<SalesBillingApiResult<ListTraderBillsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/trader-bills",
      query: {
        limit: input?.limit !== undefined ? String(input.limit) : undefined,
        cursor: input?.cursor,
        traderId: input?.traderId,
        businessDateFrom: input?.businessDateFrom,
        businessDateTo: input?.businessDateTo,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list trader bills.");
    }
    return {
      ok: true,
      data: listTraderBillsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getTraderBill(
  billId: string,
): Promise<SalesBillingApiResult<TraderBillRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/trader-bills/${billId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load trader bill.");
    }
    return {
      ok: true,
      data: traderBillRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
