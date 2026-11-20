import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { loadReportCatalog } from "@/lib/reports/catalog";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId } = await context.params;
    await requireReportingMembership(tenantId);
    return jsonOk(loadReportCatalog());
  } catch (error) {
    return jsonError(error);
  }
}
