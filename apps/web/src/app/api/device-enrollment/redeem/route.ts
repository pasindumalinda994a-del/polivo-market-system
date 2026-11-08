import { redeemEnrollmentRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { redeemEnrollmentGrant } from "@/lib/device/enrollment";

export const dynamic = "force-dynamic";

/** Device redeem endpoint — authenticated by one-time enrollment secret + possession proof. */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, redeemEnrollmentRequestSchema);
    const result = await redeemEnrollmentGrant(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
