import { forbiddenError, type AppError } from "../errors/app-error.js";

export type OfflineAccessDecision = true | AppError;

export type OfflineAccessPolicy = {
  readonly label: "production-fail-closed" | "production" | "TEST-ONLY";
  /**
   * Whether a new staff session may be issued at `nowIso` given the last trusted snapshot time.
   * Session absolute/idle lifetimes are also defined by this policy when not fail-closed.
   */
  allowNewSession: (input: {
    nowIso: string;
    authorityVerifiedAt: string | null;
  }) => OfflineAccessDecision;
  /** Whether an existing session may continue for a protected operation. */
  allowProtectedAccess: (input: {
    nowIso: string;
    authorityVerifiedAt: string;
    sessionIssuedAt: string;
    sessionAbsoluteExpiresAt: string;
    sessionLastActivityAt: string;
  }) => OfflineAccessDecision;
  /** Absolute session expiry timestamp for a session issued at `issuedAt`. */
  absoluteExpiresAt: (issuedAt: string) => string | AppError;
  /** Idle timeout milliseconds; AppError when production fail-closed. */
  idleTimeoutMs: () => number | AppError;
  /** Max age of authority_verified_at while disconnected. */
  maxSnapshotAgeMs: () => number | AppError;
};

const REFRESH_MESSAGE = "Stall access needs an online refresh.";
const SESSION_EXPIRED_MESSAGE = "Staff session has expired.";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Approved production durations (ADR 0013). */
export const PRODUCTION_OFFLINE_ACCESS_DURATIONS = {
  absoluteSessionLifetimeMs: 12 * HOUR_MS,
  idleTimeoutMs: 2 * HOUR_MS,
  maxSnapshotAgeMs: 7 * DAY_MS,
} as const;

/**
 * Production default until ADR 0013. Kept for explicit fail-closed tests only.
 * Composition must not use this as the default after ADR 0013.
 */
export const productionFailClosedOfflineAccessPolicy: OfflineAccessPolicy = {
  label: "production-fail-closed",
  allowNewSession: () => forbiddenError(REFRESH_MESSAGE),
  allowProtectedAccess: () => forbiddenError(REFRESH_MESSAGE),
  absoluteExpiresAt: () => forbiddenError(REFRESH_MESSAGE),
  idleTimeoutMs: () => forbiddenError(REFRESH_MESSAGE),
  maxSnapshotAgeMs: () => forbiddenError(REFRESH_MESSAGE),
};

export type TimedOfflineAccessPolicyValues = {
  absoluteSessionLifetimeMs: number;
  idleTimeoutMs: number;
  maxSnapshotAgeMs: number;
};

function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${iso}`);
  }
  return ms;
}

function addMs(iso: string, ms: number): string {
  return new Date(parseInstant(iso) + ms).toISOString();
}

/** True when age has reached or passed the configured limit (inclusive expiry). */
function isAgeExpired(nowMs: number, startIso: string, maxAgeMs: number): boolean {
  const age = nowMs - parseInstant(startIso);
  if (age < 0) {
    return true; // clock rollback
  }
  return age >= maxAgeMs;
}

function createTimedOfflineAccessPolicy(
  label: "production" | "TEST-ONLY",
  values: TimedOfflineAccessPolicyValues,
): OfflineAccessPolicy {
  if (
    values.absoluteSessionLifetimeMs < 0 ||
    values.idleTimeoutMs < 0 ||
    values.maxSnapshotAgeMs < 0
  ) {
    throw new Error(`${label} offline policy durations must be non-negative.`);
  }

  return {
    label,
    allowNewSession: ({ nowIso, authorityVerifiedAt }) => {
      if (authorityVerifiedAt === null) {
        return forbiddenError(REFRESH_MESSAGE);
      }
      if (isAgeExpired(parseInstant(nowIso), authorityVerifiedAt, values.maxSnapshotAgeMs)) {
        return forbiddenError(REFRESH_MESSAGE);
      }
      return true;
    },
    allowProtectedAccess: ({
      nowIso,
      authorityVerifiedAt,
      sessionIssuedAt,
      sessionAbsoluteExpiresAt,
      sessionLastActivityAt,
    }) => {
      const now = parseInstant(nowIso);
      if (isAgeExpired(now, authorityVerifiedAt, values.maxSnapshotAgeMs)) {
        return forbiddenError(REFRESH_MESSAGE);
      }
      if (now >= parseInstant(sessionAbsoluteExpiresAt)) {
        return forbiddenError(SESSION_EXPIRED_MESSAGE);
      }
      if (now - parseInstant(sessionIssuedAt) < 0) {
        return forbiddenError(SESSION_EXPIRED_MESSAGE);
      }
      if (isAgeExpired(now, sessionLastActivityAt, values.idleTimeoutMs)) {
        return forbiddenError(SESSION_EXPIRED_MESSAGE);
      }
      return true;
    },
    absoluteExpiresAt: (issuedAt) => addMs(issuedAt, values.absoluteSessionLifetimeMs),
    idleTimeoutMs: () => values.idleTimeoutMs,
    maxSnapshotAgeMs: () => values.maxSnapshotAgeMs,
  };
}

/**
 * Production offline/session policy with ADR 0013 durations.
 * First login offline is allowed when a non-expired snapshot exists.
 */
export function createProductionOfflineAccessPolicy(
  values: TimedOfflineAccessPolicyValues = PRODUCTION_OFFLINE_ACCESS_DURATIONS,
): OfflineAccessPolicy {
  return createTimedOfflineAccessPolicy("production", values);
}

export type TestOnlyOfflineAccessPolicyValues = TimedOfflineAccessPolicyValues;

/**
 * Explicitly labeled TEST-ONLY offline/session policy for automated tests.
 * Must never be selected as a production default.
 */
export function createTestOnlyOfflineAccessPolicy(
  values: TestOnlyOfflineAccessPolicyValues,
): OfflineAccessPolicy {
  return createTimedOfflineAccessPolicy("TEST-ONLY", values);
}
