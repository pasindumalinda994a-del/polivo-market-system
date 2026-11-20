import type { Metadata } from "next";

import { absolutePublicUrl, getPublicSiteOrigin } from "@/lib/releases/site-url";

const DEFAULT_TITLE = "Polivo";
const DEFAULT_DESCRIPTION =
  "Offline-first vegetable market stall software for farmer and buyer billing, local operations, and authorized cloud reporting.";

export function buildPublicMetadata(input: {
  title: string;
  description: string;
  pathname: string;
  noIndex?: boolean;
}): Metadata {
  const canonical = absolutePublicUrl(input.pathname);
  const origin = getPublicSiteOrigin();
  const fullTitle =
    input.title === DEFAULT_TITLE ? DEFAULT_TITLE : `${input.title} · ${DEFAULT_TITLE}`;

  return {
    title: fullTitle,
    description: input.description,
    alternates: canonical ? { canonical } : undefined,
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: DEFAULT_TITLE,
      title: fullTitle,
      description: input.description,
      url: canonical ?? undefined,
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: input.description,
    },
    metadataBase: origin ? new URL(origin) : undefined,
  };
}

export { DEFAULT_DESCRIPTION, DEFAULT_TITLE };
