import { NextResponse } from "next/server";

import { resolveTrustedDownload } from "@/lib/releases/resolve-download";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ releaseId: string }>;
};

/**
 * Trusted download redirect.
 * Accepts only a known release identifier; destination comes from the catalog.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { releaseId: rawId } = await context.params;
  const releaseId = decodeURIComponent(rawId ?? "").trim();
  const resolved = resolveTrustedDownload(releaseId);

  if (!resolved.ok) {
    const status =
      resolved.code === "UNKNOWN_RELEASE"
        ? 404
        : resolved.code === "WITHDRAWN" || resolved.code === "NOT_AVAILABLE"
          ? 410
          : 400;
    return NextResponse.json(
      {
        error: {
          code: resolved.code,
          message: resolved.message,
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  return NextResponse.redirect(resolved.downloadUrl, {
    status: 302,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
