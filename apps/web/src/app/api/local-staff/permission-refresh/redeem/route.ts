import { redeemLocalStaffPermissionRefreshRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { redeemLocalStaffPermissionRefresh } from "@/lib/local-staff/permission-refresh";

export const dynamic = "force-dynamic";

/**
 * Machine redeem for local permission refresh — authenticated by one-time refresh grant secret.
 * Returns live cloud membership capabilities + capabilities_revision (ADR 0013).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, redeemLocalStaffPermissionRefreshRequestSchema);
    const result = await redeemLocalStaffPermissionRefresh(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
