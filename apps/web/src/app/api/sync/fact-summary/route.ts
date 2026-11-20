import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { getSyncFactSummary, parseReconcileAuthHeaders } from "@/lib/sync/reconcile-lookup";

export const dynamic = "force-dynamic";

/** Scoped fact summary for reconciliation — Ed25519 possession, not Clerk. */
export async function POST(request: Request) {
  try {
    const rawBodyText = await request.text();
    const auth = parseReconcileAuthHeaders(request);
    const result = await getSyncFactSummary({ rawBodyText, auth });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
