import { NextResponse } from "next/server";

import {
  httpStatusForError,
  redactForLog,
  serviceUnavailableError,
  toPublicApiError,
} from "@/lib/auth/errors";
import { listActiveMemberships } from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * Private session probe for authenticated clients and automated tests.
 * Never returns session tokens.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    const memberships = await listActiveMemberships(user.subject);

    if (memberships.status === "unavailable") {
      throw serviceUnavailableError(memberships.message);
    }

    return NextResponse.json(
      {
        authenticated: true,
        membershipCount: memberships.memberships.length,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("auth.session.failed", redactForLog({ name: (error as Error)?.name }));
    return NextResponse.json(toPublicApiError(error), {
      status: httpStatusForError(error),
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }
}
