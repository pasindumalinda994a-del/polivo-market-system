import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { buildSignInUrl } from "./redirects";
import { unauthenticatedError, type WebAuthError } from "./errors";

export type AuthenticatedWebUser = {
  /** Opaque Clerk subject. Do not treat as email or parse as UUID. */
  subject: string;
};

export type AuthSessionPort = {
  getUserId: () => Promise<string | null>;
};

async function defaultAuthSession(): Promise<string | null> {
  const session = await auth();
  return session.userId;
}

/**
 * Requires a verified Clerk session for page/server rendering.
 * Redirects unauthenticated callers to sign-in with a safe return path.
 */
export async function requirePageUser(
  returnPath = "/dashboard",
  sessionPort: AuthSessionPort = { getUserId: defaultAuthSession },
): Promise<AuthenticatedWebUser> {
  const userId = await sessionPort.getUserId();
  if (!userId) {
    redirect(buildSignInUrl(returnPath));
  }
  return { subject: userId };
}

/**
 * Requires a verified Clerk session for API route handlers.
 * Throws WebAuthError UNAUTHENTICATED when no session is present.
 */
export async function requireApiUser(
  sessionPort: AuthSessionPort = { getUserId: defaultAuthSession },
): Promise<AuthenticatedWebUser> {
  const userId = await sessionPort.getUserId();
  if (!userId) {
    throw unauthenticatedError();
  }
  return { subject: userId };
}

export function isWebAuthError(error: unknown): error is WebAuthError {
  return error instanceof Error && error.name === "WebAuthError";
}
