import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { revokeTenantDevice } from "@/lib/device/enrollment";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; deviceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId, deviceId: rawDeviceId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const deviceId = decodeURIComponent(rawDeviceId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);
    const result = await revokeTenantDevice(tenantId, deviceId);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
