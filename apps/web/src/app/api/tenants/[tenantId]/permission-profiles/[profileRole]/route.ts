import {
  operationalProfileRoleSchema,
  updatePermissionProfileRequestSchema,
} from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import {
  assertOwnerAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
} from "@/lib/auth/memberships";
import { validationError } from "@/lib/auth/errors";
import { requireApiUser } from "@/lib/auth/require-user";
import { updatePermissionProfile } from "@/lib/tenant/permission-profiles";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tenantId: string; profileRole: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { tenantId, profileRole: rawRole } = await context.params;
    const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
    assertOwnerAccess(access);

    const roleParsed = operationalProfileRoleSchema.safeParse(rawRole);
    if (!roleParsed.success) {
      throw validationError("Unknown permission profile.");
    }

    const body = await parseJsonBody(request, updatePermissionProfileRequestSchema);
    const result = await updatePermissionProfile(tenantId, roleParsed.data, body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
