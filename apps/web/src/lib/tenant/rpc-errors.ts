import {
  conflictError,
  forbiddenError,
  notFoundError,
  serviceUnavailableError,
  unauthenticatedError,
  validationError,
  type WebAuthError,
} from "@/lib/auth/errors";

function extractRpcMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ");
    if (parts.length > 0) {
      return parts;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "";
}

/** Safe fields from a Supabase/PostgREST error for server logs (no tokens). */
export function summarizeRpcErrorForLog(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object") {
    const record = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      name?: unknown;
    };
    return {
      name: typeof record.name === "string" ? record.name : "PostgrestError",
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "UnknownError" };
}

/** Maps Postgres/Supabase RPC exception text to public WebAuthError codes. */
export function mapTenantRpcError(error: unknown): WebAuthError {
  const message = extractRpcMessage(error).toUpperCase();

  if (message.includes("UNAUTHENTICATED")) {
    return unauthenticatedError();
  }
  if (message.includes("FORBIDDEN")) {
    return forbiddenError("You are not allowed to perform this action.");
  }
  if (message.includes("IDEMPOTENCY_CONFLICT") || message.includes("REVISION_CONFLICT")) {
    return conflictError("Another change already applied. Refresh and try again.");
  }
  if (message.includes("LAST_OWNER")) {
    return conflictError("A stall must keep at least one active owner.");
  }
  if (message.includes("OWNERSHIP_TRANSFER_UNAVAILABLE")) {
    return conflictError("Ownership transfer is not available.");
  }
  if (message.includes("ALREADY_MEMBER")) {
    return conflictError("You already belong to this stall.");
  }
  if (message.includes("MEMBERSHIP_INACTIVE")) {
    return forbiddenError("This invitation cannot restore a previously removed membership.");
  }
  if (message.includes("EMAIL_NOT_VERIFIED")) {
    return validationError(
      "Your Clerk sign-in email must be verified to accept this invitation. Verify the email in Clerk (or mark it verified in the Dashboard for development), confirm session claims include email and email_verified, then sign out and sign in.",
    );
  }
  if (message.includes("INVALID_TOKEN")) {
    return notFoundError("This invitation is not available.");
  }
  // GRANT_NOT_FOUND must precede the broad NOT_FOUND token match.
  if (message.includes("GRANT_EXPIRED")) {
    return validationError(
      "Enrollment secret expired. Cancel or revoke the pending reservation if needed, re-authorize the affected device (host or terminal), and use the new secret within 15 minutes.",
    );
  }
  if (message.includes("GRANT_NOT_REDEEMABLE")) {
    return validationError(
      "Enrollment secret is no longer valid (revoked, cancelled, or already used).",
    );
  }
  if (message.includes("GRANT_NOT_FOUND")) {
    return validationError("Enrollment secret was not recognized.");
  }
  if (message.includes("ROLE_MISMATCH")) {
    return validationError(
      "Enrollment secret is for a different device role. Use the host or terminal flow that matches the authorization.",
    );
  }
  if (message.includes("NOT_FOUND")) {
    return notFoundError();
  }
  if (message.includes("UNKNOWN_CAPABILITY")) {
    return validationError("One or more permissions are not recognized.");
  }
  if (message.includes("HOST_ALREADY_EXISTS")) {
    return conflictError("This stall already has a host reservation or activated host.");
  }
  if (message.includes("HOST_NOT_ACTIVATED")) {
    return validationError("Authorize a terminal only after the stall host is activated.");
  }
  if (
    message.includes("GRANT_ATTEMPTS_EXCEEDED") ||
    message.includes("GRANT_NOT_CANCELLABLE") ||
    message.includes("AUTHORIZING_OWNER_INACTIVE") ||
    message.includes("ENVIRONMENT_MISMATCH") ||
    message.includes("INSTALLATION_MISMATCH") ||
    message.includes("INSTALLATION_ALREADY_REGISTERED") ||
    message.includes("DEVICE_REVOKED") ||
    message.includes("DEVICE_NOT_CONFIRMABLE") ||
    message.includes("DEVICE_NOT_RESERVABLE") ||
    message.includes("TENANT_NOT_ELIGIBLE") ||
    message.includes("INVALID_CREDENTIAL_VERSION")
  ) {
    return validationError("The enrollment request could not be completed.");
  }
  if (message.includes("INVALID_") || message.includes("INVITATION_NOT_PENDING")) {
    return validationError("The request could not be processed.");
  }

  // PostgREST / schema-cache / missing relation or function after incomplete migrate.
  if (
    message.includes("PGRST202") ||
    message.includes("SCHEMA CACHE") ||
    message.includes("COULD NOT FIND THE FUNCTION") ||
    message.includes("DOES NOT EXIST") ||
    message.includes("PERMISSION DENIED FOR FUNCTION") ||
    message.includes("PERMISSION DENIED FOR TABLE")
  ) {
    return serviceUnavailableError(
      "Required cloud database functions are missing on the linked Supabase project. Confirm forward migrations are applied (including device enrollment) and that the CLI project matches NEXT_PUBLIC_SUPABASE_URL.",
    );
  }

  // JWT rejected by Supabase third-party auth (Clerk pages may still work).
  if (
    message.includes("JWT") ||
    message.includes("PGRST301") ||
    message.includes("INVALID CLAIMS") ||
    message.includes("JWSERROR") ||
    message.includes("JWK")
  ) {
    return serviceUnavailableError(
      "Cloud database rejected the sign-in token. Confirm Clerk is configured as a Supabase third-party auth provider.",
    );
  }

  return serviceUnavailableError("Unable to complete the stall administration request.");
}
