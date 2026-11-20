"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  AppHeader,
  AppShell,
  BrandMark,
  EmptyState,
  ErrorState,
  PageHeader,
  type SidebarNavItem,
} from "@polivo/ui";
import {
  Banknote,
  CircleDollarSign,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  RefreshCw,
  Sprout,
  Store,
  Users,
  Wallet,
} from "lucide-react";

import {
  membershipHasCapability,
  type MembershipSummary,
} from "@/lib/auth/membership-summary";

export type ReportingShellProps =
  | { state: "allowed"; membership: MembershipSummary; children: React.ReactNode }
  | { state: "denied" }
  | { state: "unavailable"; message: string };

function navHref(tenantId: string, segment: string): string {
  return `/tenants/${encodeURIComponent(tenantId)}/${segment}`;
}

export function ReportingShell(props: ReportingShellProps) {
  const pathname = usePathname();
  const tenantId = props.state === "allowed" ? props.membership.tenantId : null;
  const isOwner = props.state === "allowed" && props.membership.accessRole === "owner";
  const canSyncView =
    props.state === "allowed" && membershipHasCapability(props.membership, "sync.view");

  const reportingNavigation: SidebarNavItem[] =
    tenantId === null
      ? []
      : [
          {
            id: "overview",
            label: "Overview",
            href: `/tenants/${encodeURIComponent(tenantId)}`,
            available: true,
            active:
              pathname === `/tenants/${encodeURIComponent(tenantId)}` ||
              pathname === `/tenants/${encodeURIComponent(tenantId)}/`,
            icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "sales",
            label: "Sales",
            href: navHref(tenantId, "sales"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "sales")),
            icon: <Store className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "payments",
            label: "Payments",
            href: navHref(tenantId, "payments"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "payments")),
            icon: <Banknote className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "outstanding",
            label: "Outstanding",
            href: navHref(tenantId, "outstanding"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "outstanding")),
            icon: <Wallet className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "farmers",
            label: "Farmers",
            href: navHref(tenantId, "farmers"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "farmers")),
            icon: <Sprout className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "buyers",
            label: "Buyers",
            href: navHref(tenantId, "buyers"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "buyers")),
            icon: <Users className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "prices",
            label: "Prices",
            href: navHref(tenantId, "prices"),
            available: true,
            active: pathname.startsWith(navHref(tenantId, "prices")),
            icon: <CircleDollarSign className="h-5 w-5" aria-hidden="true" />,
          },
          ...(canSyncView
            ? [
                {
                  id: "sync",
                  label: "Sync diagnostics",
                  href: navHref(tenantId, "sync-diagnostics"),
                  available: true,
                  active: pathname.startsWith(navHref(tenantId, "sync-diagnostics")),
                  icon: <RefreshCw className="h-5 w-5" aria-hidden="true" />,
                },
              ]
            : []),
          ...(isOwner
            ? [
                {
                  id: "members",
                  label: "Members",
                  href: navHref(tenantId, "members"),
                  available: true,
                  active: pathname.startsWith(navHref(tenantId, "members")),
                  icon: <Users className="h-5 w-5" aria-hidden="true" />,
                },
                {
                  id: "permissions",
                  label: "Permissions",
                  href: navHref(tenantId, "permissions"),
                  available: true,
                  active: pathname.startsWith(navHref(tenantId, "permissions")),
                  icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
                },
                {
                  id: "devices",
                  label: "Devices",
                  href: navHref(tenantId, "devices"),
                  available: true,
                  active: pathname.startsWith(navHref(tenantId, "devices")),
                  icon: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
                },
              ]
            : []),
        ];

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={[
        {
          id: "dashboard",
          label: "All stalls",
          href: "/dashboard",
          available: true,
          active: false,
          icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
        },
        ...reportingNavigation,
      ]}
      header={
        <AppHeader
          title={props.state === "allowed" ? props.membership.displayName : "Stall reporting"}
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href="/dashboard"
              >
                Stall list
              </Link>
              <UserButton />
            </div>
          }
        />
      }
    >
      {props.state === "unavailable" ? (
        <>
          <PageHeader title="Stall unavailable" />
          <ErrorState title="Unable to verify access" description={props.message} />
        </>
      ) : null}

      {props.state === "denied" ? (
        <>
          <PageHeader title="Access denied" />
          <EmptyState
            title="Access denied"
            description="You do not have financial reporting access for this stall."
          />
        </>
      ) : null}

      {props.state === "allowed" ? (
        <>
          <PageHeader
            title={props.membership.displayName}
            description={`Reporting view · ${props.membership.timezone}`}
          />
          {props.children}
        </>
      ) : null}
    </AppShell>
  );
}