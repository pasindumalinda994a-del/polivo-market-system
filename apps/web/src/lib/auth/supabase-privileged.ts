import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@polivo/db-cloud/types";

import { serviceUnavailableError } from "./errors";

/**
 * Server-only privileged Supabase client for device enrollment redeem/confirm.
 * Must never be imported into client components or shipped to desktop/Electron.
 * Does not replace user-context clients for ordinary dashboard reads.
 */
export function createPrivilegedSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw serviceUnavailableError("Privileged cloud enrollment access is not configured.");
  }

  return createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
