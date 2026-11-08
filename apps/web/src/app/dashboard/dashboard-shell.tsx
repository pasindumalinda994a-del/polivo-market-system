"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  type SidebarNavItem,
} from "@polivo/ui";
import { BarChart3, LayoutDashboard, Settings, Users } from "lucide-react";

import type { MembershipSummary } from "@/lib/auth/memberships";

const navigation: SidebarNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    available: true,
    active: true,
    icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "reports",
    label: "Reports",
    available: false,
    icon: <BarChart3 className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "farmers",
    label: "Farmers",
    available: false,
    icon: <Users className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "buyers",
    label: "Buyers",
    available: false,
    icon: <Users className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "settings",
    label: "Settings",
    available: false,
    icon: <Settings className="h-5 w-5" aria-hidden="true" />,
  },
];

export type DashboardShellProps = {
  membershipState: "none" | "active" | "unavailable";
  memberships: MembershipSummary[];
  unavailableMessage?: string;
};

export function DashboardShell({
  membershipState,
  memberships,
  unavailableMessage,
}: DashboardShellProps) {
  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Web dashboard"
          actions={
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Signed in</span>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          }
        />
      }
    >
      <PageHeader
        title="Dashboard"
        description="Choose a stall to open, or create a stall account. Desktop setup is separate."
        actions={
          <Button asChild>
            <Link href="/onboarding">Create stall</Link>
          </Button>
        }
      />

      {membershipState === "unavailable" ? (
        <ErrorState
          title="Memberships unavailable"
          description={
            unavailableMessage ??
            "Stall memberships could not be loaded. Try again shortly, or sign in again if the problem continues."
          }
        />
      ) : null}

      {membershipState === "none" ? (
        <EmptyState
          title="No stall connected"
          description="Your account is signed in, but it is not connected to a stall yet. If a stall owner invited you, open the invitation link they shared while signed in with the invited email — pending invites do not appear on this dashboard. Or create a stall account to continue. Desktop setup is not included in this step."
          action={
            <Button asChild>
              <Link href="/onboarding">Create a stall account</Link>
            </Button>
          }
        />
      ) : null}

      {membershipState === "active" ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Connected stalls</AlertTitle>
            <AlertDescription>
              Select a stall to open. When you belong to more than one stall, Polivo does not pick
              one automatically. Switching stalls uses a separate route and re-checks membership.
            </AlertDescription>
          </Alert>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {memberships.map((membership) => (
              <li
                key={membership.membershipId}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foreground">{membership.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    Role: {membership.accessRole.replaceAll("_", " ")} · {membership.timezone}
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/tenants/${encodeURIComponent(membership.tenantId)}`}
                >
                  Open stall
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AppShell>
  );
}
