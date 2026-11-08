import { forbiddenError, type AppError } from "../errors/app-error.js";

export type VerifiedPermissionRefreshProof = {
  grantId: string;
  tenantId: string;
  cloudMembershipId: string;
  capabilities: string[];
  sourceRevision: number;
};

export type PermissionRefreshRedeemer = {
  redeem: (input: {
    refreshGrantSecret: string;
    tenantId: string;
    expectedMembershipId: string;
  }) => Promise<VerifiedPermissionRefreshProof | AppError>;
};

/**
 * Redeems an owner-authorized permission refresh grant via the web cloud API.
 * Live membership capabilities + capabilities_revision are the authority (ADR 0013).
 */
export function createHttpPermissionRefreshRedeemer(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): PermissionRefreshRedeemer {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async redeem({ refreshGrantSecret, tenantId, expectedMembershipId }) {
      const response = await fetchImpl(
        new URL("/api/local-staff/permission-refresh/redeem", options.baseUrl).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            refreshGrantSecret,
            tenantId,
            expectedMembershipId,
          }),
        },
      );
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
        grantId?: string;
        tenantId?: string;
        cloudMembershipId?: string;
        capabilities?: string[];
        sourceRevision?: number;
      };
      if (!response.ok) {
        return forbiddenError(
          payload.message?.trim() || "Permission refresh grant could not be redeemed.",
        );
      }
      if (
        !payload.grantId ||
        !payload.tenantId ||
        !payload.cloudMembershipId ||
        typeof payload.sourceRevision !== "number" ||
        !Array.isArray(payload.capabilities)
      ) {
        return forbiddenError("Permission refresh response was incomplete.");
      }
      if (payload.cloudMembershipId !== expectedMembershipId) {
        return forbiddenError("Permission refresh membership did not match local staff.");
      }
      return {
        grantId: payload.grantId,
        tenantId: payload.tenantId,
        cloudMembershipId: payload.cloudMembershipId,
        capabilities: payload.capabilities,
        sourceRevision: payload.sourceRevision,
      };
    },
  };
}
