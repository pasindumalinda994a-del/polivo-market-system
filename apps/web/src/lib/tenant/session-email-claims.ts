import { redactForLog, validationError } from "@/lib/auth/errors";

const SESSION_TOKEN_GUIDANCE =
  'A verified sign-in email is required to accept this invitation. In the Clerk Dashboard (not Supabase) → Sessions → Customize session token use "email": "{{user.primary_email_address}}" and "email_verified": "{{user.email_verified}}" (not primary_email_address_verified), then sign out and sign in.';

const EMAIL_UNVERIFIED_GUIDANCE =
  "Your Clerk sign-in email is not verified yet. Verify it (check your inbox, or in Clerk Dashboard → Users mark the primary email verified for development), then sign out and sign in before accepting the invitation.";

const STALE_TOKEN_GUIDANCE =
  "Your Clerk account email is verified, but this session token still reports email_verified as false. Sign out and sign in to refresh the session, then accept the invitation again.";

export type ClerkPrimaryEmailStatus = "verified" | "unverified" | "unknown";

function normalizeClaimText(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isClaimVerified(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === "string") {
    const normalized = normalizeClaimText(value);
    return normalized === "true" || normalized === "t" || normalized === "1";
  }
  return false;
}

function isExplicitlyFalse(value: unknown): boolean {
  if (value === false || value === 0) {
    return true;
  }
  if (typeof value === "string") {
    const normalized = normalizeClaimText(value);
    return normalized === "false" || normalized === "f" || normalized === "0" || normalized === "";
  }
  return false;
}

function readEmailClaim(claims: Record<string, unknown>): string {
  const raw = claims.email;
  return typeof raw === "string" ? raw.trim() : "";
}

function readEmailVerifiedRaw(claims: Record<string, unknown>): unknown {
  if (claims.email_verified !== undefined) {
    return claims.email_verified;
  }
  return claims.emailVerified;
}

export type SessionEmailClaimAssessment = {
  hasEmail: boolean;
  hasEmailVerifiedClaim: boolean;
  emailVerifiedOk: boolean;
  emailVerifiedIsFalse: boolean;
  emailVerifiedType: string;
};

export function assessSessionEmailClaims(
  claims: Record<string, unknown> | null | undefined,
): SessionEmailClaimAssessment {
  const record = claims && typeof claims === "object" ? claims : {};
  const email = readEmailClaim(record);
  const rawVerified = readEmailVerifiedRaw(record);
  const hasEmailVerifiedClaim = rawVerified !== undefined;
  return {
    hasEmail: email.length > 0,
    hasEmailVerifiedClaim,
    emailVerifiedOk: isClaimVerified(rawVerified),
    emailVerifiedIsFalse: hasEmailVerifiedClaim && isExplicitlyFalse(rawVerified),
    emailVerifiedType: rawVerified === null ? "null" : typeof rawVerified,
  };
}

export type RequireVerifiedEmailOptions = {
  /** Primary email verification from Clerk `currentUser()`, when available. */
  clerkPrimaryEmailStatus?: ClerkPrimaryEmailStatus;
};

/**
 * Ensures the accept path has a JWT email and a verified identity.
 * Prefers canonical email_verified claims; trusts Clerk currentUser when verified
 * and the claim is not explicitly false (handles non-canonical claim strings).
 */
export function requireVerifiedEmailSessionClaims(
  claims: Record<string, unknown> | null | undefined,
  options: RequireVerifiedEmailOptions = {},
): void {
  const assessment = assessSessionEmailClaims(claims);

  if (assessment.hasEmail && assessment.emailVerifiedOk) {
    return;
  }

  // Trust Clerk user object when primary email is verified and claim is not explicitly false.
  if (
    assessment.hasEmail &&
    options.clerkPrimaryEmailStatus === "verified" &&
    !assessment.emailVerifiedIsFalse
  ) {
    return;
  }

  console.error(
    "tenant.invitation.accept_session_claims_incomplete",
    redactForLog({
      hasEmail: assessment.hasEmail,
      hasEmailVerifiedClaim: assessment.hasEmailVerifiedClaim,
      emailVerifiedOk: assessment.emailVerifiedOk,
      emailVerifiedIsFalse: assessment.emailVerifiedIsFalse,
      emailVerifiedType: assessment.emailVerifiedType,
      clerkPrimaryEmailStatus: options.clerkPrimaryEmailStatus ?? "unknown",
    }),
  );

  if (
    assessment.hasEmail &&
    assessment.emailVerifiedIsFalse &&
    options.clerkPrimaryEmailStatus === "verified"
  ) {
    throw validationError(STALE_TOKEN_GUIDANCE);
  }

  if (assessment.emailVerifiedIsFalse || options.clerkPrimaryEmailStatus === "unverified") {
    throw validationError(EMAIL_UNVERIFIED_GUIDANCE);
  }

  throw validationError(SESSION_TOKEN_GUIDANCE);
}
