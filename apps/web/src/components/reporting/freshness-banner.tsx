"use client";

import { Alert, AlertDescription, AlertTitle } from "@polivo/ui";

import type { FreshnessPresentation } from "@/lib/reports/freshness";
import { useTenantJson } from "./use-tenant-request";

export function FreshnessBanner({ tenantId }: { tenantId: string }) {
  const state = useTenantJson<FreshnessPresentation>(tenantId, "/freshness");
  if (state.status === "loading" || state.status === "idle") {
    return (
      <Alert className="mb-4">
        <AlertTitle>Checking cloud freshness</AlertTitle>
        <AlertDescription>Loading synchronization metadata…</AlertDescription>
      </Alert>
    );
  }
  if (state.status === "denied" || state.status === "error") {
    return null;
  }
  return (
    <Alert className="mb-4">
      <AlertTitle>{state.data.title}</AlertTitle>
      <AlertDescription>{state.data.description}</AlertDescription>
    </Alert>
  );
}
