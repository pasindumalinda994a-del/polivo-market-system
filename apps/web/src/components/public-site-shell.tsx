import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark, Button } from "@polivo/ui";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/downloads", label: "Downloads" },
  { href: "/setup", label: "Setup guide" },
  { href: "/support", label: "Support" },
] as const;

type PublicSiteShellProps = {
  children: ReactNode;
};

/**
 * Public marketing shell — separate from authenticated AppShell navigation.
 */
export function PublicSiteShell({ children }: PublicSiteShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-bg-surface focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark />
          </Link>

          <nav aria-label="Public" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <BrandMark compact />
            <p className="max-w-sm text-sm text-muted-foreground">
              Local-first stall operations with authorized cloud reporting. Sync is not a backup.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Terms
            </Link>
            <Link
              href="/support"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Support
            </Link>
            <Link
              href="/downloads"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Downloads
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
