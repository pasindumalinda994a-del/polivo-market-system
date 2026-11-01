import { forbiddenError, unauthenticatedError, type AppError } from "../errors/app-error.js";

/**
 * Verified authorization result. Actor/device must come from a verified adapter,
 * never from trusted request-body or header fields in production.
 */
export type AuthorizedPrincipal = {
  actorRef: string;
  deviceRef: string;
  capabilities: ReadonlySet<string>;
};

export type AuthorizationRequest = {
  requiredCapability: string;
  /** Correlation only — not used as authority. */
  requestId?: string;
};

export type AuthorizationAdapter = {
  authorize: (request: AuthorizationRequest) => AuthorizedPrincipal | AppError;
};

/**
 * Production authorization until phases 14–15 supply a real implementation.
 * Fails closed: no automatic owner identity, no header trust, no HTTP bypass.
 */
export const productionFailClosedAuthorization: AuthorizationAdapter = {
  authorize: () => unauthenticatedError("Authentication is not configured."),
};

export function requireCapability(
  principal: AuthorizedPrincipal,
  capability: string,
): AppError | null {
  if (!principal.capabilities.has(capability)) {
    return forbiddenError(`Missing capability: ${capability}`);
  }
  return null;
}
