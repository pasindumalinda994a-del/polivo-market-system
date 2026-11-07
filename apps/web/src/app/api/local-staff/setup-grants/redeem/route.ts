import { redeemLocalStaffSetupGrantRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { redeemLocalStaffSetupGrant } from "@/lib/local-staff/setup-grants";

export const dynamic = "force-dynamic";

/** Machine redeem for first-owner setup — authenticated by one-time setup grant secret. */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, redeemLocalStaffSetupGrantRequestSchema);
    const result = await redeemLocalStaffSetupGrant(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
