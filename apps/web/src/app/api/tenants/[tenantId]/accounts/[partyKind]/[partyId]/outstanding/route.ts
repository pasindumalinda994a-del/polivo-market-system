import { outstandingObligationsQuerySchema } from "@polivo/contracts";

import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { validationError } from "@/lib/auth/errors";
import { createUserReportingClient } from "@/lib/reports/client";
import { loadPartyKindFromRoute } from "@/lib/reports/parties";
import { requireAccountsMembership } from "@/lib/reports/route-auth";
import { loadOutstandingObligations } from "@/lib/reports/statements";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tenantId: string; partyKind: string; partyId: string }>;
};

function parseOutstandingQuery(url: URL) {
  const params = url.searchParams;
  const raw = {
    asOfBusinessDate: params.get("asOfBusinessDate") ?? undefined,
    limit: params.get("limit") ? Number.parseInt(params.get("limit")!, 10) : undefined,
    cursor: params.get("cursor") ?? undefined,
    snapshotToken: params.get("snapshotToken") ?? undefined,
  };
  const parsed = outstandingObligationsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw validationError("Invalid outstanding query.");
  }
  return parsed.data;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { tenantId, partyKind: partyKindRaw, partyId } = await context.params;
    await requireAccountsMembership(tenantId);
    const partyKind = loadPartyKindFromRoute(partyKindRaw);
    const query = parseOutstandingQuery(new URL(request.url));
    const response = await loadOutstandingObligations(
      createUserReportingClient(),
      tenantId,
      partyKind,
      partyId,
      query,
      new Date().toISOString(),
    );
    return jsonOk(response);
  } catch (error) {
    return jsonError(error);
  }
}