import Link from "next/link";

import { requirePageUser } from "@/lib/auth/require-user";
import { listAdminAuditEvents, resolvePlatformAdminAccess } from "@/lib/platform/admin";

import { PlatformShell } from "../platform-shell";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformAuditPage({ searchParams }: AuditPageProps) {
  await requirePageUser("/platform/audit");

  let isAdmin = false;
  try {
    isAdmin = await resolvePlatformAdminAccess();
  } catch {
    return <PlatformShell state="unavailable" message="Unable to verify platform access." />;
  }
  if (!isAdmin) {
    return <PlatformShell state="denied" />;
  }

  const raw = await searchParams;
  const tenantId = typeof raw.tenantId === "string" ? raw.tenantId : undefined;
  const events = await listAdminAuditEvents({ tenantId, limit: 75 });

  return (
    <PlatformShell state="allowed" title="Administrative audit" activeNav="audit">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Audit records are append-only. Ordinary administrators cannot edit or delete history.
          {tenantId ? (
            <>
              {" "}
              Filtered to{" "}
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={`/platform/stalls/${encodeURIComponent(tenantId)}`}
              >
                {tenantId}
              </Link>
              .
            </>
          ) : null}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-semibold">When</th>
                <th className="px-2 py-2 font-semibold">Tenant</th>
                <th className="px-2 py-2 font-semibold">Actor</th>
                <th className="px-2 py-2 font-semibold">Action</th>
                <th className="px-2 py-2 font-semibold">Target</th>
                <th className="px-2 py-2 font-semibold">Revision</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-3">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-3">
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      href={`/platform/stalls/${encodeURIComponent(event.tenantId)}`}
                    >
                      {event.tenantId}
                    </Link>
                  </td>
                  <td className="px-2 py-3">{event.actorSubject}</td>
                  <td className="px-2 py-3">{event.action}</td>
                  <td className="px-2 py-3">
                    {event.targetType ?? "—"}
                    {event.targetId ? ` / ${event.targetId}` : ""}
                  </td>
                  <td className="px-2 py-3">{event.configurationRevision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PlatformShell>
  );
}
