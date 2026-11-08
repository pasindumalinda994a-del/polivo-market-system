"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  CAPABILITY_GROUPS,
  recommendedCapabilitiesForProfile,
  type PermissionCapability,
} from "@polivo/domain";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  Checkbox,
  Label,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type SidebarNavItem,
} from "@polivo/ui";
import { KeyRound, LayoutDashboard, Users } from "lucide-react";

import type { PermissionProfileSummary } from "@/lib/tenant/permission-profiles";

export type PermissionsEditorProps = {
  tenantId: string;
  displayName: string;
  profiles: PermissionProfileSummary[];
};

type ProfileRole = "billing_staff" | "cashier";

export function PermissionsEditor({ tenantId, displayName, profiles }: PermissionsEditorProps) {
  const [pending, startTransition] = useTransition();
  const [activeRole, setActiveRole] = useState<ProfileRole>("billing_staff");
  const [state, setState] = useState(() => {
    const map = new Map(profiles.map((profile) => [profile.profileRole, profile]));
    return {
      billing_staff: map.get("billing_staff") ?? {
        profileRole: "billing_staff" as const,
        capabilities: [...recommendedCapabilitiesForProfile("billing_staff")],
        revision: 1,
        updatedAt: "",
        updatedBySubject: "",
      },
      cashier: map.get("cashier") ?? {
        profileRole: "cashier" as const,
        capabilities: [...recommendedCapabilitiesForProfile("cashier")],
        revision: 1,
        updatedAt: "",
        updatedBySubject: "",
      },
    };
  });
  const [selected, setSelected] = useState<Record<ProfileRole, Set<string>>>(() => ({
    billing_staff: new Set(state.billing_staff.capabilities),
    cashier: new Set(state.cashier.capabilities),
  }));
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recommendations = useMemo(
    () => recommendedCapabilitiesForProfile(activeRole),
    [activeRole],
  );

  const navigation: SidebarNavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      available: true,
      icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
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
      active: true,
      icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  function toggleCapability(capability: PermissionCapability, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current[activeRole]);
      if (checked) {
        next.add(capability);
      } else {
        next.delete(capability);
      }
      return { ...current, [activeRole]: next };
    });
    setReviewed(false);
    setMessage(null);
  }

  function applyRecommendations() {
    setSelected((current) => ({
      ...current,
      [activeRole]: new Set(recommendations),
    }));
    setReviewed(false);
    setMessage(null);
  }

  function save() {
    setMessage(null);
    setError(null);
    if (!reviewed) {
      setError("Review the selected permissions before saving.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/permission-profiles/${activeRole}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilities: [...selected[activeRole]],
            expectedRevision: state[activeRole].revision,
            permissionsReviewed: true,
          }),
        },
      );
      const payload = (await response.json()) as {
        revision?: number;
        cloudSaveStatus?: string;
        localApplicationStatus?: string;
        message?: string;
      };
      if (!response.ok || typeof payload.revision !== "number") {
        setError(payload.message ?? "Unable to save permissions.");
        return;
      }

      setState((current) => ({
        ...current,
        [activeRole]: {
          ...current[activeRole],
          revision: payload.revision!,
          capabilities: [...selected[activeRole]],
        },
      }));
      setMessage(
        "Saved to cloud. Local application status unavailable. Desktop sync acknowledgements are not implemented yet.",
      );
      setReviewed(false);
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Permissions"
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href={`/tenants/${encodeURIComponent(tenantId)}`}
              >
                Stall overview
              </Link>
              <UserButton />
            </div>
          }
        />
      }
    >
      <PageHeader
        title={`Permissions · ${displayName}`}
        description="Configure recommended operational capabilities for billing staff and cashiers. Ownership and membership administration stay with the owner."
      />

      <Alert className="mb-4">
        <AlertTitle>Cloud versus desktop</AlertTitle>
        <AlertDescription>
          Saving updates cloud configuration only. Local application status unavailable. Do not
          treat a cloud save as applied on the desktop.
        </AlertDescription>
      </Alert>

      {message ? (
        <Alert className="mb-4">
          <AlertTitle>Saved to cloud</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="mb-4" variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as ProfileRole)}>
        <TabsList>
          <TabsTrigger value="billing_staff">Billing staff</TabsTrigger>
          <TabsTrigger value="cashier">Cashier</TabsTrigger>
        </TabsList>
        {(["billing_staff", "cashier"] as const).map((role) => (
          <TabsContent key={role} value={role} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Revision {state[role].revision}. Recommendations are starting points — review before
                save.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={applyRecommendations}>
                Load recommendations
              </Button>
            </div>

            {CAPABILITY_GROUPS.map((group) => (
              <div key={group.id} className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-semibold">{group.label}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.capabilities.map((capability) => {
                    const checked = selected[role].has(capability);
                    return (
                      <label key={capability} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={pending || role !== activeRole}
                          onCheckedChange={(value) => toggleCapability(capability, value === true)}
                        />
                        <span>
                          <span className="font-medium">{capability}</span>
                          {recommendations.includes(capability) ? (
                            <span className="ml-2 text-xs text-muted-foreground">recommended</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={reviewed}
            onCheckedChange={(value) => setReviewed(value === true)}
            disabled={pending}
          />
          <Label>I reviewed the selected permissions for this profile</Label>
        </label>
        <Button type="button" onClick={save} disabled={pending || !reviewed}>
          {pending ? "Saving…" : "Save to cloud"}
        </Button>
      </div>
    </AppShell>
  );
}
