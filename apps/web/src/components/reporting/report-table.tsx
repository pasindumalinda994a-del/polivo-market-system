"use client";

import type { ReportResponse } from "@polivo/contracts";
import {
  EmptyState,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@polivo/ui";

export function ReportTable({
  state,
}: {
  state:
    | { status: "loading" }
    | { status: "denied" }
    | { status: "error"; message: string }
    | { status: "ready"; data: ReportResponse };
}) {
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading report…</p>;
  }
  if (state.status === "denied") {
    return <ErrorState title="Access denied" description="You cannot view this report." />;
  }
  if (state.status === "error") {
    return <ErrorState title="Report unavailable" description={state.message} />;
  }
  if (state.data.rows.length === 0) {
    return (
      <EmptyState
        title="No rows for this filter"
        description={state.data.emptyReason ?? "Try widening the date range."}
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Label</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.data.rows.map((row) => (
          <TableRow key={row.rowId}>
            <TableCell>{row.businessDate ?? "—"}</TableCell>
            <TableCell>{row.label}</TableCell>
            <TableCell>{row.statusLabel ?? "—"}</TableCell>
            <TableCell>{row.sourceRef ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
