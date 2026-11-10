import {
  changeVegetableStatusRequestSchema,
  createVegetableRequestSchema,
  listVegetablesResponseSchema,
  updateVegetableRequestSchema,
  vegetableRecordSchema,
  type ChangeVegetableStatusRequest,
  type CreateVegetableRequest,
  type ListVegetablesResponse,
  type UpdateVegetableRequest,
  type VegetableRecordDto,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type VegetableApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type VegetableApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type VegetableApiResult<T> = VegetableApiSuccess<T> | VegetableApiError;

function parseError(status: number, bodyText: string, fallback: string): VegetableApiError {
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

export async function listVegetables(input: {
  q?: string;
  active?: "active" | "inactive" | "all";
  limit?: number;
  cursor?: string;
}): Promise<VegetableApiResult<ListVegetablesResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/vegetables",
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
      return parseError(response.status, response.bodyText, "Unable to search vegetables.");
    }
    const data = listVegetablesResponseSchema.parse(JSON.parse(response.bodyText));
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getVegetable(
  vegetableId: string,
): Promise<VegetableApiResult<VegetableRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/vegetables/${vegetableId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load vegetable.");
    }
    return { ok: true, data: vegetableRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function createVegetable(
  input: CreateVegetableRequest,
  idempotencyKey?: string,
): Promise<VegetableApiResult<VegetableRecordDto>> {
  const key = idempotencyKey ?? randomUUID();
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const body = createVegetableRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/vegetables",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to create vegetable.");
    }
    return { ok: true, data: vegetableRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updateVegetable(
  vegetableId: string,
  input: UpdateVegetableRequest,
  idempotencyKey?: string,
): Promise<VegetableApiResult<VegetableRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = updateVegetableRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/vegetables/${vegetableId}`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update vegetable.");
    }
    return { ok: true, data: vegetableRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function changeVegetableStatus(
  vegetableId: string,
  input: ChangeVegetableStatusRequest,
  idempotencyKey?: string,
): Promise<VegetableApiResult<VegetableRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = changeVegetableStatusRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/vegetables/${vegetableId}/status`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to change vegetable status.");
    }
    return { ok: true, data: vegetableRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
