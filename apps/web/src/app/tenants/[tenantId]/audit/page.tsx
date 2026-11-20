import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { AppHeader, AppShell, BrandMark, PageHeader, type SidebarNavItem } from "@polivo/ui";
import {
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Settings2,
  Users,
} from "lucide-react";

import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { listAdminAuditEvents } from "@/lib/platform/admin";

import { TenantShell } from "../tenant-shell";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function StallAuditPage({ params }: AuditPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/audit`);
  const access = await resolveTenantAccess(user.subject, tenantId);

  if (access.status === "unavailable") {
    return <TenantShell state="unavailable" message={access.message} />;
  }

  if (access.status === "denied" || access.membership.accessRole !== "owner") {
    return <TenantShell state="denied" />;
  }

  const events = await listAdminAuditEvents({ tenantId, limit: 75 });

  const navigation: SidebarNavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      available: true,
      icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "setup",
      label: "Setup",
      href: `/tenants/${encodeURIComponent(tenantId)}/setup`,
      available: true,
      icon: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "profile",
      label: "Profile",
      href: `/tenants/${encodeURIComponent(tenantId)}/profile`,
      available: true,
      icon: <Settings2 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "members",
      label: "Members",
      href: `/tenants/${encodeURIComponent(tenantId)}/members`,
      available: true,
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `/tenants/${encodeURIComponent(tenantId)}/permissions`,
      available: true,
      icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "devices",
      label: "Devices",
      href: `/tenants/${encodeURIComponent(tenantId)}/devices`,
      available: true,
      icon: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "audit",
      label: "Audit",
      href: `/tenants/${encodeURIComponent(tenantId)}/audit`,
      available: true,
      active: true,
      icon: <ScrollText className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Stall administration"
          actions={
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                Scope: {access.membership.displayName}
              </span>
              <UserButton />
            </div>
          }
        />
      }
    >
      <PageHeader
        title="Administrative audit"
        description="Append-only history for membership, profile, device, and permission changes in this stall."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-semibold">When</th>
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
      <p className="mt-4 text-sm">
        <Link
          className="font-semibold text-primary underline-offset-4 hover:underline"
          href={`/tenants/${encodeURIComponent(tenantId)}/sync-diagnostics`}
        >
          Open sync diagnostics
        </Link>
      </p>
    </AppShell>
  );
}
