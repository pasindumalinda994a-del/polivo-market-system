import {
  farmerBillPreviewResponseSchema,
  farmerBillRecordSchema,
  issueFarmerBillResponseSchema,
  listFarmerBillsResponseSchema,
  listFarmerSalesResponseSchema,
  type FarmerBillPreviewRequest,
  type FarmerBillPreviewResponse,
  type FarmerBillRecordDto,
  type IssueFarmerBillRequest,
  type IssueFarmerBillResponse,
  type ListFarmerBillsResponse,
  type ListFarmerSalesResponse,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type FarmerBillingApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type FarmerBillingApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type FarmerBillingApiResult<T> = FarmerBillingApiSuccess<T> | FarmerBillingApiError;

function parseError(status: number, bodyText: string, fallback: string): FarmerBillingApiError {
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

export async function listFarmerSales(input: {
  farmerId: string;
  limit?: number;
  cursor?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  vegetableId?: string;
  traderId?: string;
  inclusionStatus?: "unbilled" | "billed";
}): Promise<FarmerBillingApiResult<ListFarmerSalesResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/farmer-sales",
      query: {
        farmerId: input.farmerId,
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
        businessDateFrom: input.businessDateFrom,
        businessDateTo: input.businessDateTo,
        vegetableId: input.vegetableId,
        traderId: input.traderId,
        inclusionStatus: input.inclusionStatus,
      },
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: {
          summary: {
            farmerId: input.farmerId,
            matchingLineCount: 0,
            unbilledLineCount: 0,
            billedLineCount: 0,
            totalNetWeightHundredths: 0,
            totalSaleAmountMinor: 0,
            totalCommissionMinor: 0,
            totalFarmerReceivesMinor: 0,
          },
          items: [],
          nextCursor: null,
        },
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list farmer sales.");
    }
    return {
      ok: true,
      data: listFarmerSalesResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function previewFarmerBill(
  input: FarmerBillPreviewRequest,
): Promise<FarmerBillingApiResult<FarmerBillPreviewResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/farmer-bills/preview",
      body: input,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to preview farmer bill.");
    }
    return {
      ok: true,
      data: farmerBillPreviewResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function issueFarmerBill(
  input: IssueFarmerBillRequest,
  idempotencyKey?: string,
): Promise<FarmerBillingApiResult<IssueFarmerBillResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/farmer-bills/issue",
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to issue farmer bill.");
    }
    return {
      ok: true,
      data: issueFarmerBillResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function lookupFarmerBillIssuance(
  idempotencyKey: string,
): Promise<FarmerBillingApiResult<IssueFarmerBillResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/farmer-bills/issuances/${idempotencyKey}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to look up farmer bill issuance.",
      );
    }
    return {
      ok: true,
      data: issueFarmerBillResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listFarmerBills(input?: {
  limit?: number;
  cursor?: string;
  farmerId?: string;
  billNumber?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
}): Promise<FarmerBillingApiResult<ListFarmerBillsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/farmer-bills",
      query: {
        limit: input?.limit !== undefined ? String(input.limit) : undefined,
        cursor: input?.cursor,
        farmerId: input?.farmerId,
        billNumber: input?.billNumber,
        businessDateFrom: input?.businessDateFrom,
        businessDateTo: input?.businessDateTo,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: true, data: { items: [], nextCursor: null }, stale: true };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list farmer bills.");
    }
    return {
      ok: true,
      data: listFarmerBillsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getFarmerBill(
  billId: string,
): Promise<FarmerBillingApiResult<FarmerBillRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/farmer-bills/${billId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load farmer bill.");
    }
    return {
      ok: true,
      data: farmerBillRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
