import Link from "next/link";

import { Button } from "@polivo/ui";

import { buildPublicMetadata, DEFAULT_DESCRIPTION } from "@/lib/public/metadata";

export const metadata = buildPublicMetadata({
  title: "Polivo",
  description: DEFAULT_DESCRIPTION,
  pathname: "/",
});

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-border bg-[linear-gradient(180deg,#F6F8FA_0%,#EAF7EE_55%,#F6F8FA_100%)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Polivo</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Market stall billing that keeps working when the internet does not
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Polivo helps wholesale vegetable stalls manage farmers, buyers, package weights,
            commissions, bills, payments, and reports. One local host holds the stall database;
            additional terminals connect on the LAN; the web dashboard shows synchronized data for
            authorized users.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/downloads">Download desktop application</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:grid-cols-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Local-first operations</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The stall host runs the service and SQLite database. Billing continues during internet
            outages while the host and local network remain available.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Keyboard-first billing</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Desktop terminals are built for fast farmer, vegetable, weight, and price entry with
            configurable commission rules.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Authorized web reporting</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Cloud reports use synchronized data only. Freshness is shown honestly — sync is not a
            backup, and web sign-in is not a local staff account.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Continue setup</h2>
            <p className="text-sm text-muted-foreground">
              Create or join a stall online, then enroll the host and finish local owner setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/setup">Open setup guide</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
