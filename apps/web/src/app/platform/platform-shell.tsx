"use client";

import Link from "next/link";
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
import { Building2, ClipboardList, LayoutDashboard, ScrollText } from "lucide-react";

export type PlatformShellProps =
  | { state: "allowed"; title: string; children: React.ReactNode; activeNav?: string }
  | { state: "denied" }
  | { state: "unavailable"; message: string };

export function PlatformShell(props: PlatformShellProps) {
  const activeNav = props.state === "allowed" ? (props.activeNav ?? "directory") : "directory";

  const navigation: SidebarNavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      available: true,
      active: false,
      icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "directory",
      label: "Stall directory",
      href: "/platform",
      available: true,
      active: activeNav === "directory",
      icon: <Building2 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "audit",
      label: "Admin audit",
      href: "/platform/audit",
      available: true,
      active: activeNav === "audit",
      icon: <ScrollText className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Platform administration"
          actions={
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                Scope: platform
              </span>
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
          <PageHeader title="Platform unavailable" />
          <ErrorState title="Unable to verify access" description={props.message} />
        </>
      ) : null}

      {props.state === "denied" ? (
        <>
          <PageHeader title="Access denied" />
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" aria-hidden="true" />}
            title="Platform administration required"
            description="Your account is not listed in the trusted platform administrator store. Stall ownership does not grant platform access."
          />
        </>
      ) : null}

      {props.state === "allowed" ? (
        <>
          <PageHeader title={props.title} />
          {props.children}
        </>
      ) : null}
    </AppShell>
  );
}
