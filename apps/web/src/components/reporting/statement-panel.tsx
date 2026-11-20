"use client";

import { useEffect, useRef, useState } from "react";

import type { AccountStatementResponse } from "@polivo/contracts";
import {
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@polivo/ui";

import {
  defaultRollingFilterWindow,
  ReportFilters,
  type ReportFilterValues,
} from "./report-filters";
import { FreshnessBanner } from "./freshness-banner";

export function StatementPanel({
  tenantId,
  partyKind,
  partyId,
}: {
  tenantId: string;
  partyKind: "farmer" | "trader";
  partyId: string;
}) {
  const [filters, setFilters] = useState<ReportFilterValues>(() => defaultRollingFilterWindow());
  const [applied, setApplied] = useState(filters);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "denied" }
    | { status: "error" }
    | { status: "ready"; data: AccountStatementResponse }
  >({ status: "loading" });
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    const params = new URLSearchParams({
      fromBusinessDate: applied.fromBusinessDate,
      toBusinessDate: applied.toBusinessDate,
      dateBasis: "business_effective",
    });
    void (async () => {
      // Yield so setState is not synchronous from this effect.
      await Promise.resolve();
      if (current !== generation.current) {
        return;
      }
      setState({ status: "loading" });
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/accounts/${partyKind}/${encodeURIComponent(partyId)}/statement?${params}`,
        { cache: "no-store" },
      );
      if (current !== generation.current) {
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setState({ status: "denied" });
        return;
      }
      if (!response.ok) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", data: (await response.json()) as AccountStatementResponse });
    })();
  }, [applied, partyId, partyKind, tenantId]);

  useEffect(() => {
    generation.current += 1;
  }, [tenantId]);

  return (
    <div className="space-y-4">
      <FreshnessBanner tenantId={tenantId} />
      <ReportFilters values={filters} onChange={setFilters} onApply={() => setApplied(filters)} />
      {state.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading statement…</p>
      ) : null}
      {state.status === "denied" || state.status === "error" ? (
        <ErrorState title="Statement unavailable" description="Access denied or invalid period." />
      ) : null}
      {state.status === "ready" ? <StatementTable data={state.data} /> : null}
    </div>
  );
}

function StatementTable({ data }: { data: AccountStatementResponse }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        {data.header.partyDisplayName} · closing {data.summary.closingDirectionLabel}{" "}
        {(Math.abs(data.summary.closingBalanceMinor) / 100).toFixed(2)} LKR
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => (
            <TableRow key={item.entryId}>
              <TableCell>{item.businessDate}</TableCell>
              <TableCell>{item.description ?? item.sourceType}</TableCell>
              <TableCell className="text-right">{(item.amountMinor / 100).toFixed(2)}</TableCell>
              <TableCell className="text-right">
                {(item.runningBalanceMinor / 100).toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
