import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { validationError } from "@/lib/auth/errors";
import { createUserReportingClient } from "@/lib/reports/client";
import { loadBillDetail } from "@/lib/reports/documents";
import { requireReportingMembership } from "@/lib/reports/route-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tenantId: string; billKind: string; billId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { tenantId, billKind: billKindRaw, billId } = await context.params;
    await requireReportingMembership(tenantId);
    if (billKindRaw !== "trader_bill" && billKindRaw !== "farmer_bill") {
      throw validationError("Invalid bill kind.");
    }
    const bill = await loadBillDetail(
      createUserReportingClient(),
      tenantId,
      billKindRaw,
      billId,
    );
    return jsonOk({ bill });
  } catch (error) {
    return jsonError(error);
  }
}