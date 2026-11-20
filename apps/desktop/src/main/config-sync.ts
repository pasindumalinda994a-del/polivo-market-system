import {
  configWorkerRefreshResponseSchema,
  configWorkerStatusSchema,
  type ConfigWorkerRefreshResponse,
  type ConfigWorkerStatus,
} from "@polivo/contracts";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
  readCurrentSession,
} from "./connection.js";

export type ConfigSyncApiError = {
  ok: false;
  code: string;
  message: string;
};

export type ConfigSyncApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type ConfigSyncApiResult<T> = ConfigSyncApiSuccess<T> | ConfigSyncApiError;

const UNAUTHENTICATED: ConfigSyncApiError = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "Staff session required.",
};

function parseError(status: number, bodyText: string, fallback: string): ConfigSyncApiError {
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
  };
}

async function hostCall<T>(args: {
  method: "GET" | "POST";
  path: string;
  fallback: string;
  parse: (value: unknown) => T;
}): Promise<ConfigSyncApiResult<T>> {
  if (!isStaffSignedIn()) {
    return UNAUTHENTICATED;
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: args.method,
      path: args.path,
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, args.fallback);
    }
    const data = args.parse(JSON.parse(response.bodyText));
    if (getConnectionRequestGeneration() !== generation) {
      return { ok: true, data, stale: true };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : args.fallback,
    };
  }
}

export async function getConfigSyncStatus(): Promise<ConfigSyncApiResult<ConfigWorkerStatus>> {
  return hostCall({
    method: "GET",
    path: "/config/status",
    fallback: "Unable to load access configuration status.",
    parse: (value) => configWorkerStatusSchema.parse(value),
  });
}

export async function refreshConfigSyncNow(): Promise<
  ConfigSyncApiResult<ConfigWorkerRefreshResponse>
> {
  const result = await hostCall({
    method: "POST",
    path: "/config/refresh",
    fallback: "Unable to request configuration refresh.",
    parse: (value) => configWorkerRefreshResponseSchema.parse(value),
  });
  // Pull may apply a new access snapshot; refresh session caps without ending the session.
  if (result.ok && isStaffSignedIn()) {
    await readCurrentSession();
  }
  return result;
}
