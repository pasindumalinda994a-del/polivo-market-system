import type { LocalDatabase } from "@polivo/db-local";
import { getStallBinding, NotFoundError } from "@polivo/db-local";

import type { AuthorizedPrincipal } from "../auth/authorization.js";
import { conflictError, internalError, notFoundError, type AppError } from "../errors/app-error.js";

export type ExecutionContext = {
  tenantId: string;
  stallId: string;
  actorRef: string;
  deviceRef: string;
  capability: string;
  requestId: string;
  idempotencyKey?: string;
};

export type ResolvedBinding = {
  tenantId: string;
  stallId: string;
};

/**
 * Load the bound stall identity. Tenant identity must agree with the local database binding.
 */
export function resolveBoundStall(database: LocalDatabase): ResolvedBinding | AppError {
  try {
    const binding = getStallBinding(database);
    return { tenantId: binding.tenantId, stallId: binding.stallId };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFoundError("Stall binding is not configured.");
    }
    return internalError("Failed to resolve stall binding.", error);
  }
}

export function buildExecutionContext(input: {
  binding: ResolvedBinding;
  principal: AuthorizedPrincipal;
  capability: string;
  requestId: string;
  idempotencyKey?: string;
  /** Optional asserted tenant; must match binding when provided. */
  assertedTenantId?: string;
}): ExecutionContext | AppError {
  if (input.assertedTenantId !== undefined && input.assertedTenantId !== input.binding.tenantId) {
    return conflictError("Request tenant does not match the bound local database.");
  }

  return {
    tenantId: input.binding.tenantId,
    stallId: input.binding.stallId,
    actorRef: input.principal.actorRef,
    deviceRef: input.principal.deviceRef,
    capability: input.capability,
    requestId: input.requestId,
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

/**
 * Idempotency scope includes tenant, stall, and command identity.
 * Actor/device are included when the command is scoped per principal.
 */
export function buildIdempotencyScope(input: {
  tenantId: string;
  stallId: string;
  commandType: string;
  actorRef?: string;
  deviceRef?: string;
}): string {
  const parts = [input.tenantId, input.stallId, input.commandType];
  if (input.actorRef !== undefined) {
    parts.push(`actor:${input.actorRef}`);
  }
  if (input.deviceRef !== undefined) {
    parts.push(`device:${input.deviceRef}`);
  }
  return parts.join(":");
}
