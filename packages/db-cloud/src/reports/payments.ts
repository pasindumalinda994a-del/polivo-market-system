import { mapReportPaymentRow } from "./mappers.js";
import { assertRpcOk, type UserReportingClient } from "./rpc.js";
import type { ListReportPaymentsInput, ReportPaymentRow } from "./types.js";

export async function listReportPayments(
  client: UserReportingClient,
  input: ListReportPaymentsInput,
): Promise<ReportPaymentRow[]> {
  const data = assertRpcOk(
    "list_report_payments",
    await client.rpc("list_report_payments", {
      p_tenant_id: input.tenantId,
      p_stall_id: input.stallId,
      p_from_business_date: input.fromBusinessDate,
      p_to_business_date: input.toBusinessDate,
      p_max_payment_recorded_at: input.watermarks.maxPaymentRecordedAt,
      p_max_payment_id: input.watermarks.maxPaymentId,
      p_max_allocation_created_at: input.watermarks.maxAllocationCreatedAt,
      p_max_allocation_id: input.watermarks.maxAllocationId,
      p_farmer_id: input.farmerId ?? null,
      p_buyer_id: input.buyerId ?? null,
      p_payment_method: input.paymentMethod ?? null,
      p_payment_direction: input.paymentDirection ?? null,
      p_payment_status: input.paymentStatus ?? null,
      p_limit: input.limit ?? null,
      p_offset: input.offset ?? 0,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapReportPaymentRow);
}

export type { ListReportPaymentsInput, ReportPaymentRow };