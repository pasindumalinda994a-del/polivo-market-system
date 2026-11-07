import {
  getStallBinding,
  tryGetCapabilitySnapshot,
  tryGetLocalStaffById,
  tryGetStaffCredential,
  tryGetStaffSessionByVerifier,
  updateSessionActivity,
  type LocalDatabase,
} from "@polivo/db-local";
import { areKnownCapabilities } from "@polivo/domain";

import { forbiddenError, unauthenticatedError, type AppError } from "../errors/app-error.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";
import type {
  AuthorizationAdapter,
  AuthorizationRequest,
  AuthorizedPrincipal,
} from "./authorization.js";
import { verifyDeviceProof } from "./device-proof.js";
import type { OfflineAccessPolicy } from "./offline-access-policy.js";
import { hashSessionSecret } from "./staff-credentials.js";

export type LocalStaffAuthorizationDeps = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  offlinePolicy: OfflineAccessPolicy;
  now: () => string;
};

function parseCapabilities(json: string): ReadonlySet<string> | AppError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return forbiddenError("Local permission snapshot is invalid.");
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
    return forbiddenError("Local permission snapshot is invalid.");
  }
  if (!areKnownCapabilities(parsed)) {
    return forbiddenError("Local permission snapshot contains unknown capabilities.");
  }
  return new Set(parsed);
}

/**
 * Production local staff + device authorization adapter.
 * Offline access still fails closed when `offlinePolicy` is the production default (ADR 0011).
 */
export function createLocalStaffAuthorizationAdapter(
  deps: LocalStaffAuthorizationDeps,
): AuthorizationAdapter {
  return {
    authorize(request: AuthorizationRequest): AuthorizedPrincipal | AppError {
      if (!request.deviceProof || !request.sessionSecret) {
        return unauthenticatedError("Authentication is required.");
      }
      if (!request.method || !request.path) {
        return unauthenticatedError("Device proof context is incomplete.");
      }

      const nowIso = deps.now();
      const device = verifyDeviceProof({
        database: deps.database,
        secureStorage: deps.secureStorage,
        proof: request.deviceProof,
        method: request.method,
        path: request.path,
        nowIso,
      });
      if ("code" in device) {
        return device;
      }

      const session = tryGetStaffSessionByVerifier(
        deps.database,
        hashSessionSecret(request.sessionSecret),
      );
      if (session === null || session.revokedAt !== null) {
        return unauthenticatedError("Staff session is invalid.");
      }
      if (session.deviceId !== device.deviceId) {
        return unauthenticatedError("Staff session is invalid.");
      }

      const binding = getStallBinding(deps.database);
      if (session.tenantId !== binding.tenantId) {
        return unauthenticatedError("Staff session is invalid.");
      }

      const staff = tryGetLocalStaffById(deps.database, session.staffId);
      if (staff === null || staff.status !== "active") {
        return unauthenticatedError("Staff session is invalid.");
      }
      const credential = tryGetStaffCredential(deps.database, staff.id);
      if (credential === null || credential.credentialRevision !== session.credentialRevision) {
        return unauthenticatedError("Staff session is invalid.");
      }

      const snapshot = tryGetCapabilitySnapshot(deps.database, staff.id);
      if (snapshot === null) {
        return forbiddenError("Stall access needs an online refresh.");
      }
      if (snapshot.tenantId !== session.tenantId || snapshot.stallId !== binding.stallId) {
        return forbiddenError("Stall access needs an online refresh.");
      }

      const policyOk = deps.offlinePolicy.allowProtectedAccess({
        nowIso,
        authorityVerifiedAt: snapshot.authorityVerifiedAt,
        sessionIssuedAt: session.issuedAt,
        sessionAbsoluteExpiresAt: session.absoluteExpiresAt,
        sessionLastActivityAt: session.lastActivityAt,
      });
      if (policyOk !== true) {
        return policyOk;
      }

      const capabilities = parseCapabilities(snapshot.capabilitiesJson);
      if ("code" in capabilities) {
        return capabilities;
      }
      if (!capabilities.has(request.requiredCapability)) {
        return forbiddenError(`Missing capability: ${request.requiredCapability}`);
      }

      if (request.touchActivity) {
        updateSessionActivity(deps.database, session.id, nowIso);
      }

      return {
        actorRef: staff.id,
        deviceRef: device.deviceId,
        capabilities,
        sessionId: session.id,
      };
    },
  };
}
