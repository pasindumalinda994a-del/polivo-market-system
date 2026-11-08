import { auth } from "@clerk/nextjs/server";
import { createUserSupabaseClient, type AccessTokenProvider } from "@polivo/db-cloud";

import { serviceUnavailableError } from "./errors";

export type UserSupabaseClient = ReturnType<typeof createUserSupabaseClient>;

export type CreateUserCloudClientOptions = {
  /** Test adapter. Production uses Clerk auth().getToken(). */
  accessToken?: AccessTokenProvider;
};

/**
 * Request-scoped user-context Supabase client.
 * Passes the current Clerk session token through the native third-party integration.
 * Does not cache tokens globally and never falls back to privileged credentials.
 */
export function createRequestUserSupabaseClient(
  options: CreateUserCloudClientOptions = {},
): UserSupabaseClient {
  const accessToken: AccessTokenProvider =
    options.accessToken ??
    (async () => {
      try {
        const session = await auth();
        return (await session.getToken()) ?? null;
      } catch {
        throw serviceUnavailableError("Unable to obtain an authentication token.");
      }
    });

  try {
    return createUserSupabaseClient({ accessToken });
  } catch {
    throw serviceUnavailableError("Cloud data access is not configured.");
  }
}
