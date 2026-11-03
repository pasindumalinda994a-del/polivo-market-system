"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  EmptyState,
  ErrorState,
  PageHeader,
  type SidebarNavItem,
} from "@polivo/ui";
import { KeyRound, LayoutDashboard, MonitorSmartphone, Users } from "lucide-react";

import type { MembershipSummary } from "@/lib/auth/memberships";

export type TenantShellProps =
  | { state: "allowed"; membership: MembershipSummary }
  | { state: "denied" }
  | { state: "unavailable"; message: string };

export function TenantShell(props: TenantShellProps) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const isOwner = props.state === "allowed" && props.membership.accessRole === "owner";
  const tenantId = props.state === "allowed" ? props.membership.tenantId : null;

  const navigation: SidebarNavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      available: true,
      active: false,
      icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
    },
    ...(isOwner && tenantId
      ? [
          {
            id: "members",
            label: "Members",
            href: `/tenants/${encodeURIComponent(tenantId)}/members`,
            available: true,
            active: false,
            icon: <Users className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "permissions",
            label: "Permissions",
            href: `/tenants/${encodeURIComponent(tenantId)}/permissions`,
            available: true,
            active: false,
            icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
          },
          {
            id: "devices",
            label: "Devices",
            href: `/tenants/${encodeURIComponent(tenantId)}/devices`,
            available: true,
            active: false,
            icon: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
          },
        ]
      : []),
  ];

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Stall context"
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href="/dashboard"
              >
                Back to dashboard
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
            description="You do not have access to this stall with the current account."
          />
        </>
      ) : null}

      {props.state === "allowed" ? (
        <>
          <PageHeader
            title={props.membership.displayName}
            description={`Role: ${props.membership.accessRole.replaceAll("_", " ")} · ${props.membership.timezone}`}
          />

          {justCreated ? (
            <Alert className="mb-4">
              <AlertTitle>Stall account created. Desktop setup is not complete.</AlertTitle>
              <AlertDescription>
                Your online stall account is ready. Device enrollment and local staff login are not
                configured yet.
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert className="mb-4">
            <AlertTitle>Permission status</AlertTitle>
            <AlertDescription>
              Cloud membership and permission settings apply to online access. Local application
              status unavailable until desktop synchronization is implemented.
            </AlertDescription>
          </Alert>

          <EmptyState
            title="Reports unavailable"
            description="Synchronized financial reports remain read-only and will appear after synchronization is implemented. Web users cannot edit synchronized financial records."
          />
        </>
      ) : null}
    </AppShell>
  );
}
