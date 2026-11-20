import { mapReportCorrectionRow } from "./mappers.js";
import { assertRpcOk, type UserReportingClient } from "./rpc.js";
import type { ReportCorrectionRow, ReportingWatermarks } from "./types.js";

export type ListReportCorrectionsInput = {
  tenantId: string;
  stallId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  watermarks: ReportingWatermarks;
  buyerId?: string;
  limit?: number;
  offset?: number;
};

export async function listReportCorrections(
  client: UserReportingClient,
  input: ListReportCorrectionsInput,
): Promise<ReportCorrectionRow[]> {
  const data = assertRpcOk(
    "list_report_corrections",
    await client.rpc("list_report_corrections", {
      p_tenant_id: input.tenantId,
      p_stall_id: input.stallId,
      p_from_business_date: input.fromBusinessDate,
      p_to_business_date: input.toBusinessDate,
      p_max_posting_sequence: input.watermarks.maxPostingSequence,
      p_buyer_id: input.buyerId ?? null,
      p_limit: input.limit ?? null,
      p_offset: input.offset ?? 0,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapReportCorrectionRow);
}