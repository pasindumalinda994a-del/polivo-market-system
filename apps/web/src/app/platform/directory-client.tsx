"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PlatformStallDirectoryRow } from "@polivo/contracts";
import { Button, Input, Label } from "@polivo/ui";

function blockersFor(row: PlatformStallDirectoryRow): string[] {
  const labels: string[] = [];
  if (row.blockerNoEnrolledHost) labels.push("No enrolled host");
  if (row.blockerHostContactStale) labels.push("Host contact stale");
  if (row.blockerUploadBlocked) labels.push("Upload blocked");
  if (row.blockerConfigPending) labels.push("Configuration pending");
  if (row.blockerReconciliationIssue) labels.push("Reconciliation issue");
  return labels;
}

export function PlatformDirectoryClient(props: {
  stalls: PlatformStallDirectoryRow[];
  totalCount: number;
  limit: number;
  offset: number;
  search: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(props.search);
  const [status, setStatus] = useState(props.status);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    params.set("limit", String(props.limit));
    params.set("offset", "0");
    startTransition(() => {
      router.push(`/platform?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="platform-search">Search</Label>
          <Input
            id="platform-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, id, market, contact"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-status">Status</Label>
          <select
            id="platform-status"
            className="flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Filtering…" : "Apply"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Showing {props.stalls.length} of {props.totalCount} stalls. Financial totals are not
        included. Lifecycle status is read-only; suspend/archive actions are unavailable.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-semibold">Stall</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2 font-semibold">Enrollment</th>
              <th className="px-2 py-2 font-semibold">Host contact</th>
              <th className="px-2 py-2 font-semibold">Config</th>
              <th className="px-2 py-2 font-semibold">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {props.stalls.map((row) => (
              <tr key={row.tenantId} className="border-b border-border/60">
                <td className="px-2 py-3 align-top">
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={`/platform/stalls/${encodeURIComponent(row.tenantId)}`}
                  >
                    {row.displayName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.tenantId}</p>
                  {row.marketLocation ? (
                    <p className="text-xs text-muted-foreground">{row.marketLocation}</p>
                  ) : null}
                </td>
                <td className="px-2 py-3 align-top capitalize">{row.status}</td>
                <td className="px-2 py-3 align-top">{row.enrollmentStatus.replaceAll("_", " ")}</td>
                <td className="px-2 py-3 align-top">
                  {row.lastHostContactAt
                    ? new Date(row.lastHostContactAt).toLocaleString()
                    : "No observed contact"}
                </td>
                <td className="px-2 py-3 align-top">
                  {row.configDeliveryStatus.replaceAll("_", " ")}
                  {row.configPublishedRevision != null ? (
                    <p className="text-xs text-muted-foreground">
                      pub {row.configPublishedRevision}
                      {row.configAcknowledgedRevision != null
                        ? ` / ack ${row.configAcknowledgedRevision}`
                        : " / not ack"}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-3 align-top">
                  {blockersFor(row).length === 0 ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <ul className="list-disc pl-4">
                      {blockersFor(row).map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
