import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { cancelEnrollmentGrant } from "@/lib/device/enrollment";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; grantId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId, grantId: rawGrantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const grantId = decodeURIComponent(rawGrantId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);
    await cancelEnrollmentGrant(tenantId, grantId);
    return jsonOk({ cancelled: true });
  } catch (error) {
    return jsonError(error);
  }
}
