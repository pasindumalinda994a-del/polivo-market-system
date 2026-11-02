import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadUserCloudConfig, type UserCloudConfig, CloudConfigError } from "./config.js";
import type { Database } from "./types.js";

export type AccessTokenProvider = () => Promise<string | null> | string | null;

export type CreateUserSupabaseClientOptions = {
  /** Verified Clerk (or test) session token supplier. Required — no privileged fallback. */
  accessToken: AccessTokenProvider;
  /** Optional explicit config; defaults to process.env via loadUserCloudConfig. */
  config?: UserCloudConfig;
};

/**
 * Request-scoped user-context Supabase client.
 * Pass the verified token from the future Clerk layer (phase 12).
 * Does not share tokens via a mutable global client. Does not log tokens.
 * Does not fall back to service-role / secret credentials.
 */
export function createUserSupabaseClient(
  options: CreateUserSupabaseClientOptions,
): SupabaseClient<Database> {
  if (typeof options.accessToken !== "function") {
    throw new CloudConfigError(
      "createUserSupabaseClient requires an accessToken provider. Privileged credentials are not a fallback.",
    );
  }

  const config = options.config ?? loadUserCloudConfig();

  return createClient<Database>(config.supabaseUrl, config.supabasePublishableKey, {
    accessToken: async () => {
      const token = await options.accessToken();
      if (token === null || token === undefined || token.trim() === "") {
        throw new CloudConfigError(
          "Missing access token for user-context Supabase client. Privileged credentials are not a fallback.",
        );
      }
      return token;
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
