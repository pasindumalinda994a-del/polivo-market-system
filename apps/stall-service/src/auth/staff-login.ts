import {
  appendSecurityAuditEvent,
  clearLoginAttempt,
  getStallBinding,
  insertStaffSession,
  revokeActiveSessionsForDevice,
  revokeStaffSession,
  tryGetCapabilitySnapshot,
  tryGetLocalStaffByCode,
  tryGetLocalStaffById,
  tryGetLoginAttempt,
  tryGetStaffCredential,
  tryGetStaffSessionByVerifier,
  upsertLoginAttempt,
  type LocalDatabase,
} from "@polivo/db-local";
import { effectiveLocalCapabilities } from "@polivo/domain";

import {
  forbiddenError,
  rateLimitedError,
  unauthenticatedError,
  type AppError,
} from "../errors/app-error.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";
import { verifyDeviceProof, type DeviceProof, type VerifiedDevice } from "./device-proof.js";
import type { OfflineAccessPolicy } from "./offline-access-policy.js";
import {
  generateSessionSecret,
  hashSessionSecret,
  verifyStaffSecret,
} from "./staff-credentials.js";

const MAX_ATTEMPTS_PER_WINDOW = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;

export type StaffLoginDeps = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  offlinePolicy: OfflineAccessPolicy;
  now: () => string;
  createId: () => string;
};

export type StaffLoginInput = {
  staffCode: string;
  secret: string;
  deviceProof: DeviceProof;
  method: string;
  path: string;
  requestId?: string;
};

export type StaffLoginResult = {
  sessionSecret: string;
  sessionId: string;
  staffId: string;
  deviceId: string;
  displayName: string;
  authorityVerifiedAt: string;
  absoluteExpiresAt: string;
};

export type CurrentSessionResult = {
  sessionId: string;
  staffId: string;
  staffCode: string;
  displayName: string;
  deviceId: string;
  capabilities: string[];
  authorityVerifiedAt: string;
  issuedAt: string;
  absoluteExpiresAt: string;
  lastActivityAt: string;
};

function parseInstant(iso: string): number {
  return Date.parse(iso);
}

function ensureDevice(
  deps: StaffLoginDeps,
  proof: DeviceProof,
  method: string,
  path: string,
): VerifiedDevice | AppError {
  return verifyDeviceProof({
    database: deps.database,
    secureStorage: deps.secureStorage,
    proof,
    method,
    path,
    nowIso: deps.now(),
  });
}

function checkThrottle(deps: StaffLoginDeps, deviceId: string, staffCode: string): AppError | null {
  const nowIso = deps.now();
  const now = parseInstant(nowIso);
  const attempt = tryGetLoginAttempt(deps.database, deviceId, staffCode);
  if (attempt === null) {
    return null;
  }
  if (attempt.lockedUntil !== null && parseInstant(attempt.lockedUntil) > now) {
    return rateLimitedError("Too many sign-in attempts. Try again later.");
  }
  const windowAge = now - parseInstant(attempt.windowStartedAt);
  if (windowAge <= ATTEMPT_WINDOW_MS && attempt.attemptCount >= MAX_ATTEMPTS_PER_WINDOW) {
    return rateLimitedError("Too many sign-in attempts. Try again later.");
  }
  return null;
}

function recordFailedAttempt(
  deps: StaffLoginDeps,
  deviceId: string,
  staffCode: string,
  requestId: string | undefined,
): void {
  const nowIso = deps.now();
  const now = parseInstant(nowIso);
  const existing = tryGetLoginAttempt(deps.database, deviceId, staffCode);
  let windowStartedAt = nowIso;
  let attemptCount = 1;
  let lockedUntil: string | null = null;

  if (existing !== null) {
    const windowAge = now - parseInstant(existing.windowStartedAt);
    if (windowAge <= ATTEMPT_WINDOW_MS) {
      windowStartedAt = existing.windowStartedAt;
      attemptCount = existing.attemptCount + 1;
    }
  }
  if (attemptCount >= MAX_ATTEMPTS_PER_WINDOW) {
    lockedUntil = new Date(now + LOCKOUT_MS).toISOString();
  }

  upsertLoginAttempt(deps.database, {
    deviceId,
    staffCode,
    windowStartedAt,
    attemptCount,
    lockedUntil,
    updatedAt: nowIso,
  });

  const binding = getStallBinding(deps.database);
  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: binding.tenantId,
    stallId: binding.stallId,
    deviceRef: deviceId,
    action: "staff.login_failed",
    targetType: "staff_code",
    targetId: staffCode,
    occurredAt: nowIso,
    correlationRef: requestId ?? null,
    detailsJson: JSON.stringify({ reason: "invalid_credentials_or_policy" }),
  });
}

export function signInLocalStaff(
  deps: StaffLoginDeps,
  input: StaffLoginInput,
): StaffLoginResult | AppError {
  const device = ensureDevice(deps, input.deviceProof, input.method, input.path);
  if ("code" in device) {
    return device;
  }

  const binding = getStallBinding(deps.database);
  const throttle = checkThrottle(deps, device.deviceId, input.staffCode);
  if (throttle !== null) {
    return throttle;
  }

  const staff = tryGetLocalStaffByCode(deps.database, binding.tenantId, input.staffCode);
  const credential = staff !== null ? tryGetStaffCredential(deps.database, staff.id) : null;
  const secretOk =
    staff !== null &&
    staff.status === "active" &&
    credential !== null &&
    verifyStaffSecret(input.secret, credential.verifier);

  if (!secretOk || staff === null || credential === null) {
    recordFailedAttempt(deps, device.deviceId, input.staffCode, input.requestId);
    return unauthenticatedError("Invalid staff credentials.");
  }

  const snapshot = tryGetCapabilitySnapshot(deps.database, staff.id);
  const policyOk = deps.offlinePolicy.allowNewSession({
    nowIso: deps.now(),
    authorityVerifiedAt: snapshot?.authorityVerifiedAt ?? null,
  });
  if (policyOk !== true) {
    appendSecurityAuditEvent(deps.database, {
      id: deps.createId(),
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      deviceRef: device.deviceId,
      actorRef: staff.id,
      action: "staff.login_policy_denied",
      targetType: "staff",
      targetId: staff.id,
      occurredAt: deps.now(),
      correlationRef: input.requestId ?? null,
      detailsJson: JSON.stringify({ reason: "offline_policy" }),
    });
    return policyOk;
  }

  if (snapshot === null) {
    return forbiddenError("Stall access needs an online refresh.");
  }

  const issuedAt = deps.now();
  const absoluteExpiresAt = deps.offlinePolicy.absoluteExpiresAt(issuedAt);
  if (typeof absoluteExpiresAt !== "string") {
    return absoluteExpiresAt;
  }

  clearLoginAttempt(deps.database, device.deviceId, input.staffCode);
  revokeActiveSessionsForDevice(deps.database, device.deviceId, issuedAt);

  const sessionSecret = generateSessionSecret();
  const sessionId = deps.createId();
  insertStaffSession(deps.database, {
    id: sessionId,
    tenantId: binding.tenantId,
    staffId: staff.id,
    deviceId: device.deviceId,
    verifier: hashSessionSecret(sessionSecret),
    credentialRevision: credential.credentialRevision,
    issuedAt,
    absoluteExpiresAt,
    lastActivityAt: issuedAt,
  });

  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: binding.tenantId,
    stallId: binding.stallId,
    actorRef: staff.id,
    deviceRef: device.deviceId,
    action: "staff.login_succeeded",
    targetType: "session",
    targetId: sessionId,
    occurredAt: issuedAt,
    correlationRef: input.requestId ?? null,
    detailsJson: null,
  });

  return {
    sessionSecret,
    sessionId,
    staffId: staff.id,
    deviceId: device.deviceId,
    displayName: staff.displayName,
    authorityVerifiedAt: snapshot.authorityVerifiedAt,
    absoluteExpiresAt,
  };
}

export function lookupCurrentSession(
  deps: StaffLoginDeps,
  input: {
    deviceProof: DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
): CurrentSessionResult | AppError {
  const device = ensureDevice(deps, input.deviceProof, input.method, input.path);
  if ("code" in device) {
    return device;
  }
  const session = tryGetStaffSessionByVerifier(
    deps.database,
    hashSessionSecret(input.sessionSecret),
  );
  if (session === null || session.revokedAt !== null || session.deviceId !== device.deviceId) {
    return unauthenticatedError("Staff session is invalid.");
  }
  const staff = tryGetLocalStaffById(deps.database, session.staffId);
  if (staff === null || staff.status !== "active") {
    return unauthenticatedError("Staff session is invalid.");
  }
  const snapshot = tryGetCapabilitySnapshot(deps.database, staff.id);
  if (snapshot === null) {
    return forbiddenError("Stall access needs an online refresh.");
  }
  const policyOk = deps.offlinePolicy.allowProtectedAccess({
    nowIso: deps.now(),
    authorityVerifiedAt: snapshot.authorityVerifiedAt,
    sessionIssuedAt: session.issuedAt,
    sessionAbsoluteExpiresAt: session.absoluteExpiresAt,
    sessionLastActivityAt: session.lastActivityAt,
  });
  if (policyOk !== true) {
    return policyOk;
  }
  let snapshotCapabilities: string[] = [];
  try {
    const parsed = JSON.parse(snapshot.capabilitiesJson) as unknown;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      snapshotCapabilities = parsed;
    }
  } catch {
    return forbiddenError("Local permission snapshot is invalid.");
  }

  const capabilities = effectiveLocalCapabilities({
    isLocalOwner: staff.isLocalOwner,
    snapshotCapabilities,
  });

  return {
    sessionId: session.id,
    staffId: staff.id,
    staffCode: staff.staffCode,
    displayName: staff.displayName,
    deviceId: device.deviceId,
    capabilities,
    authorityVerifiedAt: snapshot.authorityVerifiedAt,
    issuedAt: session.issuedAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    lastActivityAt: session.lastActivityAt,
  };
}

export function signOutLocalStaff(
  deps: StaffLoginDeps,
  input: {
    deviceProof: DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
    requestId?: string;
  },
): { signedOut: true } | AppError {
  const device = ensureDevice(deps, input.deviceProof, input.method, input.path);
  if ("code" in device) {
    return device;
  }
  const session = tryGetStaffSessionByVerifier(
    deps.database,
    hashSessionSecret(input.sessionSecret),
  );
  if (session !== null && session.deviceId === device.deviceId && session.revokedAt === null) {
    const nowIso = deps.now();
    revokeStaffSession(deps.database, session.id, nowIso);
    appendSecurityAuditEvent(deps.database, {
      id: deps.createId(),
      tenantId: session.tenantId,
      stallId: getStallBinding(deps.database).stallId,
      actorRef: session.staffId,
      deviceRef: device.deviceId,
      action: "staff.logout",
      targetType: "session",
      targetId: session.id,
      occurredAt: nowIso,
      correlationRef: input.requestId ?? null,
      detailsJson: null,
    });
  }
  return { signedOut: true };
}
