import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { forbiddenError } from "@/lib/auth/errors";
import { requireApiUser } from "@/lib/auth/require-user";
import { getPlatformStallDetail, resolvePlatformAdminAccess } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiUser();
    if (!(await resolvePlatformAdminAccess())) {
      throw forbiddenError("Platform administration access is required.");
    }
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const detail = await getPlatformStallDetail(tenantId);
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}
