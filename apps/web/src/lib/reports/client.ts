import type { UserReportingClient } from "@polivo/db-cloud";

import { createRequestUserSupabaseClient } from "@/lib/auth/supabase-user";

export function createUserReportingClient(): UserReportingClient {
  return createRequestUserSupabaseClient() as UserReportingClient;
}

/** Single-stall tenants: stall identifier matches tenant id (ADR sync ingest binding). */
export function stallBinding(tenantId: string): { tenantId: string; stallId: string } {
  return { tenantId, stallId: tenantId };
}
