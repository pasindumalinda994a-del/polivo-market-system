import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { createUserReportingClient } from "@/lib/reports/client";
import { listFarmers } from "@/lib/reports/parties";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId } = await context.params;
    await requireReportingMembership(tenantId);
    const farmers = await listFarmers(createUserReportingClient(), tenantId);
    return jsonOk({ farmers });
  } catch (error) {
    return jsonError(error);
  }
}
