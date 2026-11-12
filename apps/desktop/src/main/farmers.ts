import {
  changeFarmerStatusRequestSchema,
  createFarmerRequestSchema,
  farmerRecordSchema,
  listFarmersResponseSchema,
  updateFarmerRequestSchema,
  type ChangeFarmerStatusRequest,
  type CreateFarmerRequest,
  type FarmerRecordDto,
  type ListFarmersResponse,
  type UpdateFarmerRequest,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type FarmerApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type FarmerApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type FarmerApiResult<T> = FarmerApiSuccess<T> | FarmerApiError;

function parseError(status: number, bodyText: string, fallback: string): FarmerApiError {
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

export async function listFarmers(input: {
  q?: string;
  active?: "active" | "inactive" | "all";
  limit?: number;
  cursor?: string;
}): Promise<FarmerApiResult<ListFarmersResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/farmers",
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
      return parseError(response.status, response.bodyText, "Unable to search farmers.");
    }
    const data = listFarmersResponseSchema.parse(JSON.parse(response.bodyText));
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getFarmer(farmerId: string): Promise<FarmerApiResult<FarmerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/farmers/${farmerId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load farmer.");
    }
    return { ok: true, data: farmerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function createFarmer(
  input: CreateFarmerRequest,
  idempotencyKey?: string,
): Promise<FarmerApiResult<FarmerRecordDto>> {
  const key = idempotencyKey ?? randomUUID();
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const body = createFarmerRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/farmers",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to register farmer.");
    }
    return { ok: true, data: farmerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updateFarmer(
  farmerId: string,
  input: UpdateFarmerRequest,
  idempotencyKey?: string,
): Promise<FarmerApiResult<FarmerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = updateFarmerRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/farmers/${farmerId}`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update farmer.");
    }
    return { ok: true, data: farmerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function changeFarmerStatus(
  farmerId: string,
  input: ChangeFarmerStatusRequest,
  idempotencyKey?: string,
): Promise<FarmerApiResult<FarmerRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = changeFarmerStatusRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/farmers/${farmerId}/status`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to change farmer status.");
    }
    return { ok: true, data: farmerRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
