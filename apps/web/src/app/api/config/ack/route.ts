import { configAuthHeadersSchema } from "@polivo/contracts";

import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { validationError } from "@/lib/auth/errors";
import { acknowledgeAccessConfig } from "@/lib/config/ack";

export const dynamic = "force-dynamic";

/** Host configuration acknowledgement — authenticated by Ed25519 possession. */
export async function POST(request: Request) {
  try {
    const rawBodyText = await request.text();
    const authParse = configAuthHeadersSchema.safeParse({
      tenantId: request.headers.get("x-polivo-tenant-id"),
      deviceId: request.headers.get("x-polivo-device-id"),
      installationId: request.headers.get("x-polivo-installation-id"),
      credentialVersion: Number(request.headers.get("x-polivo-credential-version")),
      requestId: request.headers.get("x-polivo-request-id"),
      signedAt: request.headers.get("x-polivo-signed-at"),
      bodySha256: request.headers.get("x-polivo-body-sha256"),
      signature: request.headers.get("x-polivo-signature"),
    });
    if (!authParse.success) {
      throw validationError(
        authParse.error.issues[0]?.message ?? "Invalid config ack authentication headers.",
      );
    }

    const result = await acknowledgeAccessConfig({
      rawBodyText,
      auth: authParse.data,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
