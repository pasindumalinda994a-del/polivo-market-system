import type { VerifiedOwnerSetupProof } from "./staff-admin.js";
import { forbiddenError, type AppError } from "../errors/app-error.js";

export type SetupGrantRedeemer = {
  redeem: (input: {
    setupGrantSecret: string;
    tenantId: string;
  }) => Promise<VerifiedOwnerSetupProof | AppError>;
};

/**
 * Redeems a local-staff setup grant via the web cloud API.
 * Distinct from Phase 14 device enrollment grants.
 */
export function createHttpSetupGrantRedeemer(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): SetupGrantRedeemer {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async redeem({ setupGrantSecret, tenantId }) {
      const response = await fetchImpl(
        new URL("/api/local-staff/setup-grants/redeem", options.baseUrl).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ setupGrantSecret, tenantId }),
        },
      );
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
        tenantId?: string;
        cloudMembershipId?: string;
        ownerDisplayName?: string;
        capabilities?: string[];
        sourceRevision?: number;
        grantId?: string;
      };
      if (!response.ok) {
        return forbiddenError(
          payload.message?.trim() || "Local staff setup grant could not be redeemed.",
        );
      }
      if (
        !payload.tenantId ||
        !payload.cloudMembershipId ||
        !payload.ownerDisplayName ||
        !payload.grantId ||
        typeof payload.sourceRevision !== "number" ||
        !Array.isArray(payload.capabilities)
      ) {
        return forbiddenError("Local staff setup grant response was incomplete.");
      }
      return {
        tenantId: payload.tenantId,
        cloudMembershipId: payload.cloudMembershipId,
        ownerDisplayName: payload.ownerDisplayName,
        capabilities: payload.capabilities,
        sourceRevision: payload.sourceRevision,
        grantId: payload.grantId,
      };
    },
  };
}

/** Test-only redeemer that returns a fixed verified proof. */
export function createTestOnlySetupGrantRedeemer(
  proof: VerifiedOwnerSetupProof,
): SetupGrantRedeemer {
  return {
    async redeem({ setupGrantSecret, tenantId }) {
      if (setupGrantSecret.length < 32) {
        return forbiddenError("Setup grant secret is invalid.");
      }
      if (tenantId !== proof.tenantId) {
        return forbiddenError("Setup proof does not match the bound stall tenant.");
      }
      return proof;
    },
  };
}
