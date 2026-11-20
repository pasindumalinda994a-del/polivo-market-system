import { accountStatementQuerySchema } from "@polivo/contracts";

import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { validationError } from "@/lib/auth/errors";
import { createUserReportingClient } from "@/lib/reports/client";
import { loadPartyKindFromRoute } from "@/lib/reports/parties";
import { requireAccountsMembership } from "@/lib/reports/route-auth";
import { loadAccountStatement } from "@/lib/reports/statements";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tenantId: string; partyKind: string; partyId: string }>;
};

function parseStatementQuery(url: URL): ReturnType<typeof accountStatementQuerySchema.parse> {
  const params = url.searchParams;
  const raw = {
    fromBusinessDate: params.get("fromBusinessDate") ?? undefined,
    toBusinessDate: params.get("toBusinessDate") ?? undefined,
    dateBasis: params.get("dateBasis") ?? undefined,
    limit: params.get("limit") ? Number.parseInt(params.get("limit")!, 10) : undefined,
    cursor: params.get("cursor") ?? undefined,
    snapshotToken: params.get("snapshotToken") ?? undefined,
    movementSearch: params.get("movementSearch") ?? undefined,
    sourceTypeFilter: params.get("sourceTypeFilter") ?? undefined,
  };
  const parsed = accountStatementQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw validationError("Invalid statement query.");
  }
  return parsed.data;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { tenantId, partyKind: partyKindRaw, partyId } = await context.params;
    await requireAccountsMembership(tenantId);
    const partyKind = loadPartyKindFromRoute(partyKindRaw);
    const query = parseStatementQuery(new URL(request.url));
    const response = await loadAccountStatement(
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
