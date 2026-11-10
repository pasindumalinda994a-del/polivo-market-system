import {
  buyerRecordSchema,
  changeBuyerStatusRequestSchema,
  createBuyerRequestSchema,
  listBuyersResponseSchema,
  updateBuyerRequestSchema,
  type BuyerRecordDto,
  type ChangeBuyerStatusRequest,
  type CreateBuyerRequest,
  type ListBuyersResponse,
  type UpdateBuyerRequest,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type BuyerApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type BuyerApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type BuyerApiResult<T> = BuyerApiSuccess<T> | BuyerApiError;

function parseError(status: number, bodyText: string, fallback: string): BuyerApiError {
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

export async function listBuyers(input: {
  q?: string;
  active?: "active" | "inactive" | "all";
  limit?: number;
  cursor?: string;
}): Promise<BuyerApiResult<ListBuyersResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/buyers",
      query: {
        q: input.q,
        active: input.active,
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to search buyers.");
    }
    const data = listBuyersResponseSchema.parse(JSON.parse(response.bodyText));
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getBuyer(buyerId: string): Promise<BuyerApiResult<BuyerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/buyers/${buyerId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load buyer.");
    }
    return { ok: true, data: buyerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function createBuyer(
  input: CreateBuyerRequest,
  idempotencyKey?: string,
): Promise<BuyerApiResult<BuyerRecordDto>> {
  const key = idempotencyKey ?? randomUUID();
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const body = createBuyerRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/buyers",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to register buyer.");
    }
    return { ok: true, data: buyerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updateBuyer(
  buyerId: string,
  input: UpdateBuyerRequest,
  idempotencyKey?: string,
): Promise<BuyerApiResult<BuyerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = updateBuyerRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/buyers/${buyerId}`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update buyer.");
    }
    return { ok: true, data: buyerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function changeBuyerStatus(
  buyerId: string,
  input: ChangeBuyerStatusRequest,
  idempotencyKey?: string,
): Promise<BuyerApiResult<BuyerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = changeBuyerStatusRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/buyers/${buyerId}/status`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to change buyer status.");
    }
    return { ok: true, data: buyerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
