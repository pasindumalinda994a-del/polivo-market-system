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
        // Include party, catalog, commission, accounts, and bills capabilities so Phase 17–22 routes work with the legacy test adapter.
        capabilities: new Set([
          "test.fixture",
          "parties.register_edit",
          "catalog.manage",
          "commission.manage",
          "accounts.view",
          "accounts.opening_prepare",
          "accounts.opening_post",
          "accounts.opening_correct",
          "bills.create",
          "bills.edit_draft",
          "bills.finalize",
          "bills.correct_finalized",
          "bills.cancel_finalized",
          "payments.receive_trader",
          "payments.pay_farmer",
          "payments.record_cheque",
          "payments.reverse",
        ]),
      };
      if (!principal.capabilities.has(request.requiredCapability)) {
        return forbiddenError(`Missing capability: ${request.requiredCapability}`);
      }
      return principal;
    },
  };
}
