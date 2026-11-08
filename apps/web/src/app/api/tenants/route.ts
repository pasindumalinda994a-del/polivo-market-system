import { createStallRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { requireApiUser } from "@/lib/auth/require-user";
import { createStallForCurrentUser } from "@/lib/tenant/onboarding";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApiUser();
    const body = await parseJsonBody(request, createStallRequestSchema);
    const result = await createStallForCurrentUser(body);
    return jsonOk(result, result.replayed ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}
