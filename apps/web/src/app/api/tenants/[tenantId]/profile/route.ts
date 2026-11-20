import { updateStallProfileRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { resolvePlatformAdminAccess } from "@/lib/platform/admin";
import { getStallAdminProfile, updateStallAdminProfile } from "@/lib/tenant/stall-profile";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);

    const isPlatformAdmin = await resolvePlatformAdminAccess();
    if (!isPlatformAdmin) {
      const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
      assertOwnerAccess(access);
    }

    const profile = await getStallAdminProfile(tenantId);
    return jsonOk(profile);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);

    const isPlatformAdmin = await resolvePlatformAdminAccess();
    if (!isPlatformAdmin) {
      const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
      assertOwnerAccess(access);
    }

    const body = await parseJsonBody(request, updateStallProfileRequestSchema);
    const result = await updateStallAdminProfile(tenantId, body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
