import type { ReactNode } from "react";

import type { SidebarNavItem } from "@polivo/ui";

type OwnerNavOptions = {
  tenantId: string;
  activeId?: "dashboard" | "setup" | "members" | "permissions" | "devices" | "profile";
  icons: {
    dashboard: ReactNode;
    setup: ReactNode;
    members: ReactNode;
    permissions: ReactNode;
    devices: ReactNode;
  };
};

/** Shared owner administration navigation for stall web pages. */
export function buildOwnerSidebarNav(options: OwnerNavOptions): SidebarNavItem[] {
  const { tenantId, activeId, icons } = options;
  const base = `/tenants/${encodeURIComponent(tenantId)}`;
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      available: true,
      active: activeId === "dashboard",
      icon: icons.dashboard,
    },
    {
      id: "setup",
      label: "Setup",
      href: `${base}/setup`,
      available: true,
      active: activeId === "setup",
      icon: icons.setup,
    },
    {
      id: "members",
      label: "Members",
      href: `${base}/members`,
      available: true,
      active: activeId === "members",
      icon: icons.members,
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `${base}/permissions`,
      available: true,
      active: activeId === "permissions",
      icon: icons.permissions,
    },
    {
      id: "devices",
      label: "Devices",
      href: `${base}/devices`,
      available: true,
      active: activeId === "devices",
      icon: icons.devices,
    },
  ];
}
