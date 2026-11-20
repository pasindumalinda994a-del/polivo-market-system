"use client";

import Link from "next/link";
import { Button, ErrorState } from "@polivo/ui";

import { FreshnessBanner } from "./freshness-banner";
import { useTenantJson } from "./use-tenant-request";

type DetailResponse = {
  farmer?: {
    partyId: string;
    displayName: string;
    shortCode: string;
    balanceMinor: number;
    maxPostingSequence: number;
  };
  buyer?: {
    partyId: string;
    displayName: string;
    shortCode: string;
    balanceMinor: number;
    maxPostingSequence: number;
  };
};

export function PartyDetailPanel({
  tenantId,
  partyKind,
  partyId,
}: {
  tenantId: string;
  partyKind: "farmer" | "trader";
  partyId: string;
}) {
  const path =
    partyKind === "farmer"
      ? `/farmers/${encodeURIComponent(partyId)}`
      : `/buyers/${encodeURIComponent(partyId)}`;
  const state = useTenantJson<DetailResponse>(tenantId, path);

  if (state.status === "loading" || state.status === "idle") {
    return <p className="text-sm text-muted-foreground">Loading party…</p>;
  }
  if (state.status === "denied" || state.status === "error") {
    return <ErrorState title="Party unavailable" description="Access denied or record missing." />;
  }

  const record = state.data.farmer ?? state.data.buyer;
  if (!record) {
    return <ErrorState title="Party unavailable" description="Record could not be loaded." />;
  }

  const statementHref = `/tenants/${encodeURIComponent(tenantId)}/statements/${partyKind === "farmer" ? "farmer" : "trader"}/${encodeURIComponent(partyId)}`;
  const balance = (record.balanceMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={tenantId} />
      <SectionCard>
        <h2 className="text-xl font-semibold">{record.displayName}</h2>
        <p className="text-sm text-muted-foreground">{record.shortCode}</p>
        <p className="mt-3 text-lg">
          Balance at watermark seq {record.maxPostingSequence}: LKR {balance}
        </p>
        <Button asChild className="mt-4">
          <Link href={statementHref}>View statement</Link>
        </Button>
      </SectionCard>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border p-4">{children}</div>;
}
