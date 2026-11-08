import { createHash, randomBytes } from "node:crypto";

/** Cryptographically random invitation token (raw). Store only the hash. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest of a raw invitation token. */
export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Stable hash of onboarding payload fields for idempotency conflict detection. */
export function hashOnboardingPayload(payload: {
  displayName: string;
  timezone: string;
  marketLocation?: string;
  contact?: string;
}): string {
  const normalized = JSON.stringify({
    displayName: payload.displayName.trim(),
    timezone: payload.timezone.trim(),
    marketLocation: payload.marketLocation?.trim() ?? null,
    contact: payload.contact?.trim() ?? null,
  });
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
