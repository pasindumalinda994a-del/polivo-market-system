"use client";

import { EmptyState, ErrorState } from "@polivo/ui";
import Link from "next/link";

import { FreshnessBanner } from "./freshness-banner";
import { useTenantJson } from "./use-tenant-request";

type FarmersResponse = { farmers: { partyId: string; displayName: string }[] };
type BuyersResponse = { buyers: { partyId: string; displayName: string }[] };

export function OutstandingPanel({ tenantId }: { tenantId: string }) {
  const farmers = useTenantJson<FarmersResponse>(tenantId, "/farmers");
  const buyers = useTenantJson<BuyersResponse>(tenantId, "/buyers");

  const loading = farmers.status === "loading" || buyers.status === "loading";
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading parties…</p>;
  }
  if (farmers.status === "denied" || buyers.status === "denied") {
    return <ErrorState title="Access denied" description="Outstanding requires reporting access." />;
  }
  if (farmers.status !== "ready" || buyers.status !== "ready") {
    return <ErrorState title="Unable to load parties" description="Try refreshing the page." />;
  }

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={tenantId} />
      <p className="text-sm text-muted-foreground">
        Open a farmer or buyer to view outstanding obligations at a cutoff date.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <PartyLinks
          title="Farmers"
          emptyLabel="No farmers synchronized yet."
          links={farmers.data.farmers.map((farmer) => ({
            href: `/tenants/${encodeURIComponent(tenantId)}/statements/farmer/${encodeURIComponent(farmer.partyId)}`,
            label: farmer.displayName,
          }))}
        />
        <PartyLinks
          title="Buyers"
          emptyLabel="No buyers synchronized yet."
          links={buyers.data.buyers.map((buyer) => ({
            href: `/tenants/${encodeURIComponent(tenantId)}/statements/trader/${encodeURIComponent(buyer.partyId)}`,
            label: buyer.displayName,
          }))}
        />
      </div>
    </div>
  );
}

function PartyLinks({
  title,
  links,
  emptyLabel,
}: {
  title: string;
  links: { href: string; label: string }[];
  emptyLabel: string;
}) {
  if (links.length === 0) {
    return <EmptyState title={title} description={emptyLabel} />;
  }
  return (
    <SectionCard>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="text-primary underline-offset-4 hover:underline" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border p-4">{children}</div>;
}