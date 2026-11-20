import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { createUserReportingClient } from "@/lib/reports/client";
import { getFarmerDetail } from "@/lib/reports/parties";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; farmerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId, farmerId } = await context.params;
    await requireReportingMembership(tenantId);
    const detail = await getFarmerDetail(
      createUserReportingClient(),
      tenantId,
      farmerId,
      new Date().toISOString(),
    );
    return jsonOk({ farmer: detail });
  } catch (error) {
    return jsonError(error);
  }
}