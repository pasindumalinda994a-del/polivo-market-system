import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { validationError } from "@/lib/auth/errors";
import { requireApiUser } from "@/lib/auth/require-user";
import { listAdminAuditEvents } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw validationError("Invalid audit limit.");
    }

    const events = await listAdminAuditEvents({ tenantId, limit });
    return jsonOk({ events });
  } catch (error) {
    return jsonError(error);
  }
}
