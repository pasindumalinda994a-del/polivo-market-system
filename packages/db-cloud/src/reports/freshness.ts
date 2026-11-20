import { mapStallReportingFreshness } from "./mappers.js";
import { assertRpcOk, firstRpcRow, type UserReportingClient } from "./rpc.js";
import type { StallReportingFreshness } from "./types.js";

export async function getStallReportingFreshness(
  client: UserReportingClient,
  tenantId: string,
): Promise<StallReportingFreshness> {
  const data = assertRpcOk(
    "get_stall_reporting_freshness",
    await client.rpc("get_stall_reporting_freshness", { p_tenant_id: tenantId }),
  );
  const row = firstRpcRow(data as Record<string, unknown>[], "get_stall_reporting_freshness");
  return mapStallReportingFreshness(row);
}