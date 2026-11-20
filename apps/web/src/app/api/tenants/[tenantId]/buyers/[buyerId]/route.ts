import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { createUserReportingClient } from "@/lib/reports/client";
import { getBuyerDetail } from "@/lib/reports/parties";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; buyerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId, buyerId } = await context.params;
    await requireReportingMembership(tenantId);
    const detail = await getBuyerDetail(
      createUserReportingClient(),
      tenantId,
      buyerId,
      new Date().toISOString(),
    );
    return jsonOk({ buyer: detail });
  } catch (error) {
    return jsonError(error);
  }
}