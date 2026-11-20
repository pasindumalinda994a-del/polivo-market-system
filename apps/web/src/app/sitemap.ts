import type { MetadataRoute } from "next";

import { PUBLIC_INDEXABLE_PATHS, getPublicSiteOrigin } from "@/lib/releases/site-url";

/**
 * Public sitemap only. Authenticated routes, invitation tokens, and setup-token
 * URLs are excluded. Robots directives are indexing guidance, not access control.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicSiteOrigin();
  if (!origin) {
    return [];
  }

  const lastModified = new Date();
  return PUBLIC_INDEXABLE_PATHS.map((pathname) => ({
    url: `${origin}${pathname}`,
    lastModified,
    changeFrequency: pathname === "/" ? "weekly" : "monthly",
    priority: pathname === "/" ? 1 : 0.7,
  }));
}
