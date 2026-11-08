import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { authorizeLocalStaffSetupGrant } from "@/lib/local-staff/setup-grants";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Owner-only: issue a short-lived local staff first-owner setup grant. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);
    const result = await authorizeLocalStaffSetupGrant(tenantId);
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
