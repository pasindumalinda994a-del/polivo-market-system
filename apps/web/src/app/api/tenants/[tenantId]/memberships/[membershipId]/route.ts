import { updateMembershipRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { updateTenantMembership } from "@/lib/tenant/membership-admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; membershipId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId, membershipId } = await context.params;
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);

    const body = await parseJsonBody(request, updateMembershipRequestSchema);
    await updateTenantMembership(tenantId, membershipId, body);
    return jsonOk({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
