import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { forbiddenError, validationError } from "@/lib/auth/errors";
import { requireApiUser } from "@/lib/auth/require-user";
import { listAdminAuditEvents, resolvePlatformAdminAccess } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiUser();
    if (!(await resolvePlatformAdminAccess())) {
      throw forbiddenError("Platform administration access is required.");
    }

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? undefined;
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
