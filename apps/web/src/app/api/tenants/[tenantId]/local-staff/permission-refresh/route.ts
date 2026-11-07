import { authorizeLocalStaffPermissionRefreshRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { authorizeLocalStaffPermissionRefresh } from "@/lib/local-staff/permission-refresh";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Owner-only: issue a short-lived permission refresh grant for one membership. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);
    const body = await parseJsonBody(request, authorizeLocalStaffPermissionRefreshRequestSchema);
    const result = await authorizeLocalStaffPermissionRefresh({
      tenantId,
      membershipId: body.membershipId,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
