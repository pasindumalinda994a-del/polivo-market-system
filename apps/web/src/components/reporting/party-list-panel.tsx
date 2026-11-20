"use client";

import Link from "next/link";
import { EmptyState, ErrorState } from "@polivo/ui";

import { FreshnessBanner } from "./freshness-banner";
import { useTenantJson } from "./use-tenant-request";

type ListResponse =
  | { farmers: { partyId: string; displayName: string; shortCode: string }[] }
  | { buyers: { partyId: string; displayName: string; shortCode: string }[] };

export function PartyListPanel({
  tenantId,
  kind,
}: {
  tenantId: string;
  kind: "farmers" | "buyers";
}) {
  const path = kind === "farmers" ? "/farmers" : "/buyers";
  const state = useTenantJson<ListResponse>(tenantId, path);

  if (state.status === "loading" || state.status === "idle") {
    return <p className="text-sm text-muted-foreground">Loading {kind}…</p>;
  }
  if (state.status === "denied") {
    return <ErrorState title="Access denied" description="Reporting access is required." />;
  }
  if (state.status === "error") {
    return <ErrorState title="Unable to load list" description="Try refreshing." />;
  }

  const rows =
    kind === "farmers"
      ? (state.data as { farmers: { partyId: string; displayName: string; shortCode: string }[] })
          .farmers
      : (state.data as { buyers: { partyId: string; displayName: string; shortCode: string }[] })
          .buyers;
  const base =
    kind === "farmers"
      ? `/tenants/${encodeURIComponent(tenantId)}/farmers/`
      : `/tenants/${encodeURIComponent(tenantId)}/buyers/`;

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={tenantId} />
      {rows.length === 0 ? (
        <EmptyState title={`No ${kind} yet`} description="Synchronized party records will appear here." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li key={row.partyId} className="px-4 py-3">
              <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`${base}${encodeURIComponent(row.partyId)}`}>
                {row.displayName}
              </Link>
              <p className="text-xs text-muted-foreground">{row.shortCode}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}