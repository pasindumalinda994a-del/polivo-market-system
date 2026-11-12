import {
  activateCommissionPolicyRequestSchema,
  activeCommissionPolicyResponseSchema,
  commissionPolicyVersionSchema,
  commissionPreviewRequestSchema,
  commissionPreviewResponseSchema,
  listCommissionPolicyVersionsResponseSchema,
  type ActivateCommissionPolicyRequest,
  type ActiveCommissionPolicyResponse,
  type CommissionPolicyVersionDto,
  type CommissionPreviewRequest,
  type CommissionPreviewResponse,
  type ListCommissionPolicyVersionsResponse,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type CommissionApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type CommissionApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type CommissionApiResult<T> = CommissionApiSuccess<T> | CommissionApiError;

function parseError(status: number, bodyText: string, fallback: string): CommissionApiError {
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

export async function getActiveCommissionPolicy(): Promise<
  CommissionApiResult<ActiveCommissionPolicyResponse>
> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/commission-policy",
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: {
          status: "unconfigured",
          stallId: "stale",
          revision: 1,
          updatedAt: new Date(0).toISOString(),
          activeVersion: null,
          rateBasis: "per_kg_minor",
          roundingRuleId: "half_up_money_times_weight_v1",
          algorithmVersion: "stall_default_bands_v1",
        },
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load commission policy.");
    }
    return {
      ok: true,
      data: activeCommissionPolicyResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listCommissionPolicyVersions(input: {
  limit?: number;
  cursor?: string;
}): Promise<CommissionApiResult<ListCommissionPolicyVersionsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: "/commission-policy/versions",
      query: {
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to list commission versions.");
    }
    return {
      ok: true,
      data: listCommissionPolicyVersionsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getCommissionPolicyVersion(
  versionId: string,
): Promise<CommissionApiResult<CommissionPolicyVersionDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/commission-policy/versions/${versionId}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load commission version.");
    }
    return {
      ok: true,
      data: commissionPolicyVersionSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function activateCommissionPolicy(
  input: ActivateCommissionPolicyRequest,
  idempotencyKey?: string,
): Promise<CommissionApiResult<ActiveCommissionPolicyResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const key = idempotencyKey ?? randomUUID();
  const body = activateCommissionPolicyRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/commission-policy/activate",
      body,
      idempotencyKey: key,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to activate commission policy.",
      );
    }
    return {
      ok: true,
      data: activeCommissionPolicyResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function previewCommission(
  input: CommissionPreviewRequest,
): Promise<CommissionApiResult<CommissionPreviewResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const body = commissionPreviewRequestSchema.parse(input);
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/commission-policy/preview",
      body,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to preview commission.");
    }
    return {
      ok: true,
      data: commissionPreviewResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
