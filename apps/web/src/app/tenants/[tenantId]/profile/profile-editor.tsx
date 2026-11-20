"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  Input,
  Label,
  PageHeader,
  Textarea,
  type SidebarNavItem,
} from "@polivo/ui";
import {
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Settings2,
  Users,
} from "lucide-react";

export function StallProfileEditor(props: {
  tenantId: string;
  displayName: string;
  initial: {
    displayName: string;
    timezone: string;
    marketLocation: string;
    contact: string;
    adminNotes: string;
    expectedRevision: number;
    status: string;
  };
  deliverySummary: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(props.initial.displayName);
  const [timezone, setTimezone] = useState(props.initial.timezone);
  const [marketLocation, setMarketLocation] = useState(props.initial.marketLocation);
  const [contact, setContact] = useState(props.initial.contact);
  const [adminNotes, setAdminNotes] = useState(props.initial.adminNotes);
  const [expectedRevision, setExpectedRevision] = useState(props.initial.expectedRevision);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      href: `/tenants/${encodeURIComponent(props.tenantId)}/setup`,
      available: true,
      icon: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "profile",
      label: "Profile",
      href: `/tenants/${encodeURIComponent(props.tenantId)}/profile`,
      available: true,
      active: true,
      icon: <Settings2 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "members",
      label: "Members",
      href: `/tenants/${encodeURIComponent(props.tenantId)}/members`,
      available: true,
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `/tenants/${encodeURIComponent(props.tenantId)}/permissions`,
      available: true,
      icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "devices",
      label: "Devices",
      href: `/tenants/${encodeURIComponent(props.tenantId)}/devices`,
      available: true,
      icon: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "audit",
      label: "Audit",
      href: `/tenants/${encodeURIComponent(props.tenantId)}/audit`,
      available: true,
      icon: <ScrollText className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${encodeURIComponent(props.tenantId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          timezone,
          marketLocation: marketLocation || undefined,
          contact: contact || undefined,
          adminNotes,
          expectedRevision,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        profileRevision?: number;
      };
      if (!response.ok) {
        setError(payload.message ?? "Unable to save profile.");
        return;
      }
      if (payload.profileRevision) {
        setExpectedRevision(payload.profileRevision);
      }
      setMessage("Profile saved to cloud.");
      router.refresh();
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

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
                Scope: {props.displayName}
              </span>
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href={`/tenants/${encodeURIComponent(props.tenantId)}`}
              >
                Reports
              </Link>
              <UserButton />
            </div>
          }
        />
      }
    >
      <PageHeader
        title="Stall profile"
        description={`Lifecycle status ${props.initial.status} is read-only. Suspend and archive actions are unavailable.`}
      />

      <Alert className="mb-4">
        <AlertTitle>Configuration delivery</AlertTitle>
        <AlertDescription>{props.deliverySummary}</AlertDescription>
      </Alert>

      <form className="space-y-4" onSubmit={onSubmit}>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert>
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="stall-display-name">Display name</Label>
            <Input
              id="stall-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={128}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stall-timezone">Timezone</Label>
            <Input
              id="stall-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
              maxLength={64}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stall-market">Market / location</Label>
            <Input
              id="stall-market"
              value={marketLocation}
              onChange={(event) => setMarketLocation(event.target.value)}
              maxLength={256}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stall-contact">Contact</Label>
            <Input
              id="stall-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={256}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stall-notes">Administrative notes</Label>
          <Textarea
            id="stall-notes"
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
            maxLength={2000}
            rows={4}
          />
        </div>
        <p className="text-xs text-muted-foreground">Expected revision: {expectedRevision}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
          <Link
            className="inline-flex items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
            href={`/tenants/${encodeURIComponent(props.tenantId)}/sync-diagnostics`}
          >
            Sync diagnostics
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
