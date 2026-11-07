import { confirmEnrollmentRequestSchema } from "@polivo/contracts";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/route-helpers";
import { confirmDeviceEnrollment } from "@/lib/device/enrollment";

export const dynamic = "force-dynamic";

/** Device confirm endpoint — authenticated by installation possession proof. */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, confirmEnrollmentRequestSchema);
    const result = await confirmDeviceEnrollment(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
