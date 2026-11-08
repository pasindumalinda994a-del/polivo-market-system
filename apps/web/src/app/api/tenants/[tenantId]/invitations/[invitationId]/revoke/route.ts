import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { revokeTenantInvitation } from "@/lib/tenant/invitations";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; invitationId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId, invitationId } = await context.params;
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);

    await revokeTenantInvitation(tenantId, invitationId);
    return jsonOk({ revoked: true });
  } catch (error) {
    return jsonError(error);
  }
}
