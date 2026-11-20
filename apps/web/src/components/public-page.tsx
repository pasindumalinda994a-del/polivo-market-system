import type { ReactNode } from "react";

type PublicPageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/** Shared content width and heading pattern for public informational pages. */
export function PublicPage({ title, description, children }: PublicPageProps) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <header className="mb-10 max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
      </header>
      <div className="space-y-10">{children}</div>
    </div>
  );
}

type PublicSectionProps = {
  title: string;
  children: ReactNode;
};

export function PublicSection({ title, children }: PublicSectionProps) {
  return (
    <section className="max-w-3xl space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}
