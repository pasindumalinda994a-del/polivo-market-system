"use client";

import type { ReportResponse } from "@polivo/contracts";

import { FreshnessBanner } from "./freshness-banner";
import { MetricCards } from "./metric-cards";
import { defaultRollingFilterWindow } from "./report-filters";
import { useTenantJson } from "./use-tenant-request";

function formatMinor(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `LKR ${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OverviewPanel({ tenantId }: { tenantId: string }) {
  const filters = defaultRollingFilterWindow();
  const params = new URLSearchParams({
    fromBusinessDate: filters.fromBusinessDate,
    toBusinessDate: filters.toBusinessDate,
  });
  const sales = useTenantJson<ReportResponse>(
    tenantId,
    `/reports/sales_summary?${params.toString()}`,
  );

  const loading = sales.status === "loading" || sales.status === "idle";
  const summary =
    sales.status === "ready"
      ? sales.data.summary
      : { gross_sale_minor: null, commission_minor: null, payment_net_minor: null };

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={tenantId} />
      <MetricCards
        loading={loading}
        cards={[
          {
            id: "gross",
            label: "Gross sales",
            value: loading ? "—" : formatMinor(summary.gross_sale_minor as number | undefined),
          },
          {
            id: "commission",
            label: "Commission",
            value: loading ? "—" : formatMinor(summary.commission_minor as number | undefined),
          },
          {
            id: "payments",
            label: "Net payments",
            value: loading ? "—" : formatMinor(summary.payment_net_minor as number | undefined),
            hint: "Payment summary loads on the Payments tab.",
          },
          {
            id: "window",
            label: "Date window",
            value: loading ? "—" : `${filters.fromBusinessDate} → ${filters.toBusinessDate}`,
          },
        ]}
      />
      {sales.status === "denied" ? (
        <p className="text-sm text-muted-foreground">
          Reporting access is required to view metrics.
        </p>
      ) : null}
    </div>
  );
}
