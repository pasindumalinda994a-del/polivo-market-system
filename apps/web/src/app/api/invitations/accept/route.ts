import { acceptInvitationRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { requireApiUser } from "@/lib/auth/require-user";
import { acceptTenantInvitation } from "@/lib/tenant/invitations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApiUser();
    const body = await parseJsonBody(request, acceptInvitationRequestSchema);
    const result = await acceptTenantInvitation(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
