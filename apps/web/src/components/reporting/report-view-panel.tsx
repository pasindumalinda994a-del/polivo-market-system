"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReportQuery, ReportResponse, ReportTypeDto } from "@polivo/contracts";

import { FreshnessBanner } from "./freshness-banner";
import {
  defaultRollingFilterWindow,
  ReportFilters,
  type ReportFilterValues,
} from "./report-filters";
import { ReportTable } from "./report-table";

type ViewState =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ReportResponse };

export function ReportViewPanel({
  tenantId,
  reportType,
  title,
  showAsOf = false,
  extraFilters,
}: {
  tenantId: string;
  reportType: ReportTypeDto;
  title: string;
  showAsOf?: boolean;
  extraFilters?: Partial<ReportQuery["filters"]>;
}) {
  const [filters, setFilters] = useState<ReportFilterValues>(() => defaultRollingFilterWindow());
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const generation = useRef(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedFilters.fromBusinessDate) {
      params.set("fromBusinessDate", appliedFilters.fromBusinessDate);
    }
    if (appliedFilters.toBusinessDate) {
      params.set("toBusinessDate", appliedFilters.toBusinessDate);
    }
    if (appliedFilters.asOfBusinessDate) {
      params.set("asOfBusinessDate", appliedFilters.asOfBusinessDate);
    }
    if (extraFilters) {
      for (const [key, value] of Object.entries(extraFilters)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }
    return params.toString();
  }, [appliedFilters, extraFilters]);

  useEffect(() => {
    const current = ++generation.current;
    void (async () => {
      await Promise.resolve();
      if (current !== generation.current) {
        return;
      }
      setView({ status: "loading" });
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/reports/${encodeURIComponent(reportType)}?${queryString}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (current !== generation.current) {
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setView({ status: "denied" });
        return;
      }
      if (!response.ok) {
        setView({ status: "error", message: "Unable to load this report." });
        return;
      }
      const data = (await response.json()) as ReportResponse;
      if (current !== generation.current) {
        return;
      }
      setView({ status: "ready", data });
    })();
  }, [queryString, reportType, tenantId]);

  return (
    <ReportSection title={title}>
      <FreshnessBanner tenantId={tenantId} />
      <ReportFilters
        values={filters}
        onChange={setFilters}
        onApply={() => setAppliedFilters(filters)}
        showAsOf={showAsOf}
      />
      <ReportTable state={view} />
    </ReportSection>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
