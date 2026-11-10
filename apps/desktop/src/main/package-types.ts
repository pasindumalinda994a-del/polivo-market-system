import {
  changePackageTypeStatusRequestSchema,
  createPackageTypeRequestSchema,
  listPackageTypesResponseSchema,
  packageTypeRecordSchema,
  updatePackageTypeRequestSchema,
  type ChangePackageTypeStatusRequest,
  type CreatePackageTypeRequest,
  type ListPackageTypesResponse,
  type PackageTypeRecordDto,
  type UpdatePackageTypeRequest,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type PackageTypeApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type PackageTypeApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type PackageTypeApiResult<T> = PackageTypeApiSuccess<T> | PackageTypeApiError;

function parseError(status: number, bodyText: string, fallback: string): PackageTypeApiError {
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

export async function listPackageTypes(input: {
  q?: string;
  active?: "active" | "inactive" | "all";
  limit?: number;
  cursor?: string;
}): Promise<PackageTypeApiResult<ListPackageTypesResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/package-types",
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
      return parseError(response.status, response.bodyText, "Unable to search package types.");
    }
    const data = listPackageTypesResponseSchema.parse(JSON.parse(response.bodyText));
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function createPackageType(
  input: CreatePackageTypeRequest,
  idempotencyKey?: string,
): Promise<PackageTypeApiResult<PackageTypeRecordDto>> {
  const key = idempotencyKey ?? randomUUID();
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const body = createPackageTypeRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/package-types",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to create package type.");
    }
    return { ok: true, data: packageTypeRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updatePackageType(
  packageTypeId: string,
  input: UpdatePackageTypeRequest,
  idempotencyKey?: string,
): Promise<PackageTypeApiResult<PackageTypeRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = updatePackageTypeRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/package-types/${packageTypeId}`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update package type.");
    }
    return { ok: true, data: packageTypeRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function changePackageTypeStatus(
  packageTypeId: string,
  input: ChangePackageTypeStatusRequest,
  idempotencyKey?: string,
): Promise<PackageTypeApiResult<PackageTypeRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = changePackageTypeStatusRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/package-types/${packageTypeId}/status`,
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to change package type status.",
      );
    }
    return { ok: true, data: packageTypeRecordSchema.parse(JSON.parse(response.bodyText)) };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
