import Link from "next/link";

import { Button } from "@polivo/ui";

import { PublicSiteShell } from "@/components/public-site-shell";

export default function NotFound() {
  return (
    <PublicSiteShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="text-base leading-7 text-muted-foreground">
          That address is not a public Polivo page. If you were looking for setup or downloads, use
          the links below.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/downloads">Downloads</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/support">Support</Link>
          </Button>
        </div>
      </div>
    </PublicSiteShell>
  );
}
