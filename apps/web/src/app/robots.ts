import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "@/lib/releases/site-url";

/**
 * Indexing guidance only — not an access-control mechanism.
 * Disallow authenticated and tokenized routes from crawlers.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getPublicSiteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/onboarding",
        "/tenants",
        "/invitations",
        "/platform",
        "/api",
        "/sign-in",
        "/sign-up",
        "/dev",
      ],
    },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
