import { DomainError } from "@polivo/domain";

import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
  WebAuthError,
} from "@/lib/auth/errors";

export function mapReportDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    if (error.code === "SNAPSHOT_EXPIRED" || error.code === "SNAPSHOT_MISMATCH") {
      throw conflictError(error.message);
    }
    throw validationError(error.message);
  }
  throw error;
}

/** Use generic forbidden for cross-tenant or unauthorized ID probes. */
export function denyObfuscated(message = "Access denied."): never {
  throw forbiddenError(message);
}

export function rethrowAsWebError(error: unknown): never {
  if (error instanceof WebAuthError) {
    throw error;
  }
  mapReportDomainError(error);
}

export function resourceUnavailable(message = "Resource not found."): never {
  throw notFoundError(message);
}