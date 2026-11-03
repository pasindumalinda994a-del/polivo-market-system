import type { ReactNode } from "react";

import { BrandMark } from "@polivo/ui";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/**
 * Compact Polivo-themed shell for Clerk authentication pages.
 * Form-first on small screens; restrained brand panel on wider screens.
 */
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <aside className="hidden flex-col justify-between border-r border-border bg-navigation px-10 py-12 text-primary-foreground lg:flex">
          <BrandMark className="text-primary-foreground" />
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="max-w-sm text-sm leading-6 text-primary-foreground/80">{description}</p>
          </div>
          <p className="text-xs text-primary-foreground/60">Polivo Market System</p>
        </aside>

        <section className="flex flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mb-8 space-y-3 lg:hidden">
            <BrandMark />
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="mx-auto w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}
