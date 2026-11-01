import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@polivo/ui";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polivo",
  description: "Polivo market system web application",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
