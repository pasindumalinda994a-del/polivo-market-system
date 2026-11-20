import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { lookupSyncReceipts, parseReconcileAuthHeaders } from "@/lib/sync/reconcile-lookup";

export const dynamic = "force-dynamic";

/** Bounded receipt lookup — Ed25519 possession, not Clerk. */
export async function POST(request: Request) {
  try {
    const rawBodyText = await request.text();
    const auth = parseReconcileAuthHeaders(request);
    const result = await lookupSyncReceipts({ rawBodyText, auth });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
