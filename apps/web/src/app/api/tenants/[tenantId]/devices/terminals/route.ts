import { authorizeTerminalEnrollmentRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";
import { authorizeTerminalEnrollment } from "@/lib/device/enrollment";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId: rawTenantId } = await context.params;
    const tenantId = decodeURIComponent(rawTenantId);
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);

    const body = await parseJsonBody(request, authorizeTerminalEnrollmentRequestSchema);
    const result = await authorizeTerminalEnrollment(tenantId, body);
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
