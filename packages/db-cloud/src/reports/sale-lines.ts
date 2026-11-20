import { mapReportSaleLineRow } from "./mappers.js";
import { assertRpcOk, type UserReportingClient } from "./rpc.js";
import type { ListReportSaleLinesInput, ReportSaleLineRow } from "./types.js";

export async function listReportSaleLines(
  client: UserReportingClient,
  input: ListReportSaleLinesInput,
): Promise<ReportSaleLineRow[]> {
  const data = assertRpcOk(
    "list_report_sale_lines",
    await client.rpc("list_report_sale_lines", {
      p_tenant_id: input.tenantId,
      p_stall_id: input.stallId,
      p_from_business_date: input.fromBusinessDate,
      p_to_business_date: input.toBusinessDate,
      p_max_posting_sequence: input.watermarks.maxPostingSequence,
      p_farmer_id: input.farmerId ?? null,
      p_buyer_id: input.buyerId ?? null,
      p_vegetable_id: input.vegetableId ?? null,
      p_active_only: input.activeOnly ?? false,
      p_limit: input.limit ?? null,
      p_offset: input.offset ?? 0,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapReportSaleLineRow);
}

export type { ListReportSaleLinesInput, ReportSaleLineRow };
