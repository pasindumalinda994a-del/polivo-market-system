import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { Toaster } from "@polivo/ui";

import { polivoClerkAppearance } from "@/lib/auth/clerk-appearance";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polivo",
  description: "Polivo market system web application",
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
