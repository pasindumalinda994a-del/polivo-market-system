import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { Toaster } from "@polivo/ui";

import { polivoClerkAppearance } from "@/lib/auth/clerk-appearance";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from "@/lib/public/metadata";
import { getPublicSiteOrigin } from "@/lib/releases/site-url";

import "./globals.css";

const siteOrigin = getPublicSiteOrigin();

export const metadata: Metadata = {
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${DEFAULT_TITLE}`,
  },
  description: DEFAULT_DESCRIPTION,
  metadataBase: siteOrigin ? new URL(siteOrigin) : undefined,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClerkProvider appearance={polivoClerkAppearance} afterSignOutUrl="/">
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
