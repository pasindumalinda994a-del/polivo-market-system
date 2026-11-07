import { forbiddenError, unauthenticatedError, type AppError } from "../errors/app-error.js";
import type { DeviceProof } from "./device-proof.js";

/**
 * Verified authorization result. Actor/device must come from a verified adapter,
 * never from trusted request-body or header fields in production.
 */
export type AuthorizedPrincipal = {
  actorRef: string;
  deviceRef: string;
  capabilities: ReadonlySet<string>;
  /** Local staff session id when authenticated via staff session. */
  sessionId?: string;
};

export type AuthorizationRequest = {
  requiredCapability: string;
  /** Correlation only — not used as authority. */
  requestId?: string;
  deviceProof?: DeviceProof;
  sessionSecret?: string;
  /** HTTP method used to bind the device proof message. */
  method?: string;
  /** HTTP path used to bind the device proof message. */
  path?: string;
  /** When true, update last_activity for a qualifying user action. */
  touchActivity?: boolean;
};

export type AuthorizationAdapter = {
  authorize: (request: AuthorizationRequest) => AuthorizedPrincipal | AppError;
};

/**
 * Legacy production placeholder. Prefer `createLocalStaffAuthorizationAdapter`.
 * Retained for explicit fail-closed composition when staff auth is not wired.
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
