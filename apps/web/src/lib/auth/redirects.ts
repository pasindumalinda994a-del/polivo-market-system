/** Default destination after a successful sign-in when no safe return path is supplied. */
export const DEFAULT_POST_AUTH_PATH = "/dashboard";

/** Paths that must not be used as post-auth return targets (avoids redirect loops). */
const AUTH_LOOP_PREFIXES = ["/sign-in", "/sign-up"] as const;

/**
 * Validates an application-managed return path.
 * Allows only same-origin absolute paths. Rejects external URLs,
 * protocol-relative URLs, backslash tricks, and auth-page loops.
 */
export function resolveSafeRedirectPath(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined) {
    return DEFAULT_POST_AUTH_PATH;
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return DEFAULT_POST_AUTH_PATH;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://polivo.invalid");
  } catch {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (parsed.origin !== "https://polivo.invalid") {
    return DEFAULT_POST_AUTH_PATH;
  }

  const path = `${parsed.pathname}${parsed.search}`;
  if (
    AUTH_LOOP_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
    )
  ) {
    return DEFAULT_POST_AUTH_PATH;
  }

  return path;
}

/** Builds the sign-in URL with an optional validated return path. */
export function buildSignInUrl(returnPath?: string | null): string {
  const safe = resolveSafeRedirectPath(returnPath);
  if (safe === DEFAULT_POST_AUTH_PATH && (returnPath === null || returnPath === undefined)) {
    return "/sign-in";
  }
  const params = new URLSearchParams({ redirect_url: safe });
  return `/sign-in?${params.toString()}`;
}

/** True when the pathname is a protected application route. */
export function isProtectedPath(pathname: string): boolean {
  // Device enrollment machine endpoints use one-time secrets + possession proofs, not Clerk sessions.
  if (pathname.startsWith("/api/device-enrollment/")) {
    return false;
  }
  // Local staff first-owner setup redeem uses a one-time setup grant secret (stall-service CLI),
  // not a Clerk session. Owner authorize under /api/tenants/.../setup-grant stays protected.
  if (pathname === "/api/local-staff/setup-grants/redeem") {
    return false;
  }
  // Permission refresh redeem uses a one-time owner-issued grant; returns live membership caps.
  if (pathname === "/api/local-staff/permission-refresh/redeem") {
    return false;
  }
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/tenants" ||
    pathname.startsWith("/tenants/") ||
    pathname === "/invitations" ||
    pathname.startsWith("/invitations/") ||
    pathname.startsWith("/api/")
  );
}
