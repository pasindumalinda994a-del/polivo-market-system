import { assertRpcOk, firstRpcRow, type UserReportingClient } from "./rpc.js";
import { mapReportingWatermarks } from "./mappers.js";
import type { ReportingWatermarks } from "./types.js";

export async function captureReportingWatermarks(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
): Promise<ReportingWatermarks> {
  const data = assertRpcOk(
    "capture_reporting_watermarks",
    await client.rpc("capture_reporting_watermarks", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
    }),
  );
  const row = firstRpcRow(data as Record<string, unknown>[], "capture_reporting_watermarks");
  return mapReportingWatermarks(row);
}