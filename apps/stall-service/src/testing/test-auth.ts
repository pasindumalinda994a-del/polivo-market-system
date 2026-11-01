import type { AuthorizationAdapter, AuthorizedPrincipal } from "../auth/authorization.js";
import { forbiddenError, unauthenticatedError } from "../errors/app-error.js";

/**
 * Test-only authorization adapter. Must never be wired into production startup.
 */
export function createTestAuthorizationAdapter(options: {
  principal?: AuthorizedPrincipal | null;
}): AuthorizationAdapter {
  return {
    authorize: (request) => {
      if (options.principal === null) {
        return unauthenticatedError("Test caller is not authenticated.");
      }
      const principal = options.principal ?? {
        actorRef: "test-actor",
        deviceRef: "test-device",
        capabilities: new Set(["test.fixture"]),
      };
      if (!principal.capabilities.has(request.requiredCapability)) {
        return forbiddenError(`Missing capability: ${request.requiredCapability}`);
      }
      return principal;
    },
  };
}
