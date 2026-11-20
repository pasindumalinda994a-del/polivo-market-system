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
import { ClipboardList, KeyRound, LayoutDashboard, MonitorSmartphone, Users } from "lucide-react";

import type { MembershipSummary } from "@/lib/auth/membership-summary";
import { buildOwnerSidebarNav } from "@/lib/tenant/owner-nav";

export type TenantShellProps =
  | { state: "allowed"; membership: MembershipSummary }
  | { state: "denied" }
  | { state: "unavailable"; message: string };

export function TenantShell(props: TenantShellProps) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const isOwner = props.state === "allowed" && props.membership.accessRole === "owner";
  const tenantId = props.state === "allowed" ? props.membership.tenantId : null;

  const navigation: SidebarNavItem[] =
    isOwner && tenantId
      ? buildOwnerSidebarNav({
          tenantId,
          icons: {
            dashboard: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
            setup: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
            members: <Users className="h-5 w-5" aria-hidden="true" />,
            permissions: <KeyRound className="h-5 w-5" aria-hidden="true" />,
            devices: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
          },
        })
      : [
          {
            id: "dashboard",
            label: "Dashboard",
            href: "/dashboard",
            available: true,
            active: false,
            icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
          },
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
                Your online stall account is ready. Continue with host enrollment and local owner
                setup from the setup overview. Device enrollment and local staff login are separate
                from this web account.
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert className="mb-4">
            <AlertTitle>Continue setup</AlertTitle>
            <AlertDescription>
              Cloud membership controls online access. Configuration delivery and local application
              status are shown on Setup and Permissions after the host acknowledges snapshots. Open{" "}
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline"
                href={`/tenants/${encodeURIComponent(props.membership.tenantId)}/setup`}
              >
                Setup overview
              </Link>{" "}
              for confirmed, awaiting, blocked, and unknown milestones.
            </AlertDescription>
          </Alert>

          <EmptyState
            title="Reporting workspace"
            description="Synchronized financial reports are read-only and appear for authorized members when cloud data exists. Freshness indicators show when reports last received evidence — sync is not a backup."
          />
        </>
      ) : null}
    </AppShell>
  );
}
