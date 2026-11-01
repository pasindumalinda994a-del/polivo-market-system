import {
  AppHeader,
  AppShell,
  BrandMark,
  EmptyState,
  PageHeader,
  StatusIndicator,
  type SidebarNavItem,
} from "@polivo/ui";
import { ClipboardList, LayoutDashboard, Settings, Users } from "lucide-react";

const navigation: SidebarNavItem[] = [
  {
    id: "workspace",
    label: "Workspace",
    href: "#workspace",
    available: true,
    active: true,
    icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "billing",
    label: "Billing",
    available: false,
    icon: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
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

export default function App() {
  return (
    <AppShell
      compactNav
      brand={<BrandMark compact />}
      navigation={navigation}
      header={<AppHeader title="Desktop workspace" />}
      statusArea={
        <StatusIndicator
          tone="unavailable"
          label="Service connection not configured"
          className="w-full justify-start bg-white/10 text-text-inverse"
        />
      }
    >
      <PageHeader
        title="Desktop application shell"
        description="Keyboard-first billing screens will use this workspace later. No stall service is connected yet."
      />
      <EmptyState
        title="Billing workspace reserved"
        description="Party selection, line entry, and totals will appear here in a later phase. No financial or connection data is shown."
      />
    </AppShell>
  );
}
