import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { validationError } from "@/lib/auth/errors";
import { createUserReportingClient } from "@/lib/reports/client";
import { loadReport } from "@/lib/reports/load-report";
import { parseReportQueryFromSearchParams } from "@/lib/reports/parse-query";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; reportType: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { tenantId, reportType } = await context.params;
    await requireReportingMembership(tenantId);
    const url = new URL(request.url);
    let query;
    try {
      query = parseReportQueryFromSearchParams(reportType, url.searchParams);
    } catch {
      throw validationError("Invalid report query parameters.");
    }
    const body = await loadReport(
      createUserReportingClient(),
      tenantId,
      query,
      new Date().toISOString(),
    );
    return jsonOk(body);
  } catch (error) {
    return jsonError(error);
  }
}