"use client";

import type { FreshnessPresentation } from "@/lib/reports/freshness";
import { ErrorState } from "@polivo/ui";

import { useTenantJson } from "./use-tenant-request";

export function SyncDiagnosticsPanel({ tenantId }: { tenantId: string }) {
  const state = useTenantJson<FreshnessPresentation>(tenantId, "/freshness");
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading sync diagnostics…</p>;
  }
  if (state.status === "denied") {
    return <ErrorState title="Access denied" description="sync.view is required." />;
  }
  if (state.status === "error") {
    return <ErrorState title="Diagnostics unavailable" description="Unable to load freshness." />;
  }
  if (state.status !== "ready") {
    return null;
  }
  const { freshness } = state.data;
  return (
    <dl className="grid gap-3 rounded-lg border p-4 text-sm">
      <div>
        <dt className="font-medium">Freshness label</dt>
        <dd className="text-muted-foreground">{state.data.label}</dd>
      </div>
      <div>
        <dt className="font-medium">Last host contact</dt>
        <dd className="text-muted-foreground">{freshness.lastHostContactAt ?? "—"}</dd>
      </div>
      <div>
        <dt className="font-medium">Last applied upload</dt>
        <dd className="text-muted-foreground">
          {freshness.lastAppliedUploadGroupId ?? "—"} @ {freshness.lastAppliedUploadAt ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Applied max posting sequence</dt>
        <dd className="text-muted-foreground">{freshness.appliedMaxPostingSequence}</dd>
      </div>
      <div>
        <dt className="font-medium">Committed cloud cursor</dt>
        <dd className="text-muted-foreground">
          {freshness.committedCloudCursor} ({freshness.committedCloudCursorObservedAt ?? "—"})
        </dd>
      </div>
    </dl>
  );
}
