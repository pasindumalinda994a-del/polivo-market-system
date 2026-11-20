/**
 * Validated public site origin for canonical URLs, Open Graph, and sitemap.
 * Prefer NEXT_PUBLIC_APP_URL. Fall back to VERCEL_URL only when it is HTTPS-capable.
 * Returns null when no trusted origin is configured (skip absolute canonicals).
 */
export function getPublicSiteOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return normalizeOrigin(configured);
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const withScheme =
      vercel.startsWith("http://") || vercel.startsWith("https://") ? vercel : `https://${vercel}`;
    return normalizeOrigin(withScheme);
  }

  return null;
}

function normalizeOrigin(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  // Reject obvious open-redirect style paths in the base URL.
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    return null;
  }
  return parsed.origin;
}

export function absolutePublicUrl(pathname: string): string | null {
  const origin = getPublicSiteOrigin();
  if (!origin) {
    return null;
  }
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return null;
  }
  return `${origin}${pathname}`;
}

/** Public marketing routes included in sitemap / indexing. */
export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/features",
  "/how-it-works",
  "/downloads",
  "/setup",
  "/support",
  "/privacy",
  "/terms",
] as const;
