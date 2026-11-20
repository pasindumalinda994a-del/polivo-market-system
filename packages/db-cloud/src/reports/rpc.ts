import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../types.js";
import { CloudReportError } from "./errors.js";

export type UserReportingClient = SupabaseClient<Database>;

export function assertRpcOk<T>(
  label: string,
  result: { data: T; error: { message: string } | null },
): T {
  if (result.error !== null) {
    throw new CloudReportError(`${label}: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new CloudReportError(`${label}: empty response.`);
  }
  return result.data;
}

export function firstRpcRow<T>(rows: T[] | null | undefined, label: string): T {
  if (rows === null || rows === undefined || rows.length === 0) {
    throw new CloudReportError(`${label}: expected one row.`);
  }
  return rows[0]!;
}
