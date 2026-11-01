"use client";

import {
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  PageHeader,
  type SidebarNavItem,
} from "@polivo/ui";
import { BarChart3, LayoutDashboard, Settings, Users } from "lucide-react";

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

export function DashboardShell() {
  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={<AppHeader title="Web dashboard" />}
    >
      <PageHeader
        title="Dashboard"
        description="Read-only reporting views will appear here after synchronization is available."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                Shell details
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dashboard shell</DialogTitle>
                <DialogDescription>
                  This dialog confirms focus management for the shared UI package. No account or
                  financial data is loaded.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <p className="text-sm text-muted-foreground">Press Escape to close.</p>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <EmptyState
        title="No dashboard data yet"
        description="This shell is a presentation foundation only. Authentication, tenants, and synchronized reports are not configured."
      />
    </AppShell>
  );
}
