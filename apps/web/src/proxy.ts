import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isProtectedPath, resolveSafeRedirectPath } from "@/lib/auth/redirects";

/**
 * Next.js 16 request protection entry point (`proxy.ts`).
 * Establishes the Clerk session for the request. Protected pages and API
 * routes also re-verify identity in server helpers.
 */
export default clerkMiddleware(async (auth, request) => {
  const { pathname, search } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (userId) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      },
      { status: 401 },
    );
  }

  const signInUrl = new URL("/sign-in", request.url);
  const returnPath = resolveSafeRedirectPath(`${pathname}${search}`);
  signInUrl.searchParams.set("redirect_url", returnPath);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
