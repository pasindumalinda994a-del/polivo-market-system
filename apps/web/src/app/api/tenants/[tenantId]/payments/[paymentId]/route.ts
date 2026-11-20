import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { createUserReportingClient } from "@/lib/reports/client";
import { loadPaymentDetail } from "@/lib/reports/documents";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; paymentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId, paymentId } = await context.params;
    await requireReportingMembership(tenantId);
    const payment = await loadPaymentDetail(createUserReportingClient(), tenantId, paymentId);
    return jsonOk({ payment });
  } catch (error) {
    return jsonError(error);
  }
}