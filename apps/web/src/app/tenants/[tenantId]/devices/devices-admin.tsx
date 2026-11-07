"use client";

import { useMemo, useState, useTransition } from "react";
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
  Input,
  Label,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SidebarNavItem,
} from "@polivo/ui";
import type { TenantDeviceSummary } from "@polivo/contracts";
import { KeyRound, LayoutDashboard, MonitorSmartphone, Users } from "lucide-react";

export type DevicesAdminProps = {
  tenantId: string;
  displayName: string;
  devices: TenantDeviceSummary[];
};

function stateLabel(state: TenantDeviceSummary["enrollmentState"]): string {
  switch (state) {
    case "reserved":
      return "Pending activation";
    case "redeemed":
      return "Redeemed — awaiting confirmation";
    case "waiting_host_confirm":
      return "Waiting for host confirmation";
    case "activated":
      return "Activated";
    case "revoked":
      return "Revoked";
    default:
      return state;
  }
}

export function DevicesAdmin({
  tenantId,
  displayName,
  devices: initialDevices,
}: DevicesAdminProps) {
  const [pending, startTransition] = useTransition();
  const [devices, setDevices] = useState(initialDevices);
  const [hostLabel, setHostLabel] = useState("");
  const [terminalLabel, setTerminalLabel] = useState("");
  const [environment, setEnvironment] = useState<"development" | "staging" | "production">(
    "development",
  );
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [lastGrantId, setLastGrantId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activatedHost = useMemo(
    () => devices.find((d) => d.role === "host" && d.enrollmentState === "activated"),
    [devices],
  );
  const hasActiveHostReservation = useMemo(
    () =>
      devices.some(
        (d) =>
          d.role === "host" &&
          (d.enrollmentState === "reserved" ||
            d.enrollmentState === "redeemed" ||
            d.enrollmentState === "activated"),
      ),
    [devices],
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
      icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "devices",
      label: "Devices",
      href: `/tenants/${encodeURIComponent(tenantId)}/devices`,
      available: true,
      active: true,
      icon: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  async function refreshDevices() {
    const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/devices`);
    const payload = (await response.json()) as {
      devices?: TenantDeviceSummary[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Unable to refresh devices.");
    }
    setDevices(payload.devices ?? []);
  }

  function authorizeHost(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setOneTimeSecret(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deploymentEnvironment: environment,
            label: hostLabel.trim() || undefined,
          }),
        });
        const payload = (await response.json()) as {
          enrollmentSecret?: string;
          grantId?: string;
          reservedDeviceId?: string;
          expiresAt?: string;
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(payload.error?.message ?? "Unable to authorize host.");
          return;
        }
        setOneTimeSecret(payload.enrollmentSecret ?? null);
        setLastGrantId(payload.grantId ?? null);
        setMessage(
          `Host reserved (${payload.reservedDeviceId}). Copy the enrollment secret now — it will not be shown again. Expires ${payload.expiresAt}.`,
        );
        await refreshDevices();
      } catch {
        setError("Unable to authorize host.");
      }
    });
  }

  function authorizeTerminal(event: React.FormEvent) {
    event.preventDefault();
    if (!activatedHost) {
      setError("Activate a host before authorizing a terminal.");
      return;
    }
    setMessage(null);
    setError(null);
    setOneTimeSecret(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/devices/terminals`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hostDeviceId: activatedHost.deviceId,
              deploymentEnvironment: environment,
              label: terminalLabel.trim() || undefined,
            }),
          },
        );
        const payload = (await response.json()) as {
          enrollmentSecret?: string;
          grantId?: string;
          reservedDeviceId?: string;
          expiresAt?: string;
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(payload.error?.message ?? "Unable to authorize terminal.");
          return;
        }
        setOneTimeSecret(payload.enrollmentSecret ?? null);
        setLastGrantId(payload.grantId ?? null);
        setMessage(
          `Terminal reserved (${payload.reservedDeviceId}). Copy the enrollment secret now — it will not be shown again.`,
        );
        await refreshDevices();
      } catch {
        setError("Unable to authorize terminal.");
      }
    });
  }

  function cancelLastGrant() {
    if (!lastGrantId) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/devices/grants/${encodeURIComponent(lastGrantId)}/cancel`,
          { method: "POST" },
        );
        if (!response.ok) {
          const payload = (await response.json()) as { error?: { message?: string } };
          setError(payload.error?.message ?? "Unable to cancel enrollment.");
          return;
        }
        setOneTimeSecret(null);
        setLastGrantId(null);
        setMessage("Unused enrollment cancelled.");
        await refreshDevices();
      } catch {
        setError("Unable to cancel enrollment.");
      }
    });
  }

  function revokeDevice(deviceId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/devices/${encodeURIComponent(deviceId)}/revoke`,
          { method: "POST" },
        );
        if (!response.ok) {
          const payload = (await response.json()) as { error?: { message?: string } };
          setError(payload.error?.message ?? "Unable to revoke device.");
          return;
        }
        setMessage(`Device ${deviceId} revoked in the cloud. Host acknowledgement is separate.`);
        await refreshDevices();
      } catch {
        setError("Unable to revoke device.");
      }
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title={displayName}
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href={`/tenants/${encodeURIComponent(tenantId)}`}
              >
                Stall home
              </Link>
              <UserButton />
            </div>
          }
        />
      }
    >
      <PageHeader
        title="Devices"
        description="Authorize one Windows host for this stall and pair additional terminals. Enrollment secrets are shown once."
      />

      {message ? (
        <Alert className="mb-4">
          <AlertTitle>Enrollment update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Unable to continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {oneTimeSecret ? (
        <Alert className="mb-4">
          <AlertTitle>One-time enrollment secret</AlertTitle>
          <AlertDescription>
            <p className="mb-2 break-all font-mono text-sm">{oneTimeSecret}</p>
            <p className="text-sm">
              Keep this off screenshots, logs, and URLs. Paste it into the host activation command
              or terminal enrollment dialog on the target computer.
            </p>
            {lastGrantId ? (
              <Button
                className="mt-3"
                variant="outline"
                disabled={pending}
                onClick={cancelLastGrant}
              >
                Cancel unused enrollment
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <form className="space-y-3" onSubmit={authorizeHost}>
          <h2 className="text-lg font-semibold">Authorize host</h2>
          <p className="text-sm text-muted-foreground">
            Creates a single-use grant for the first host. An existing host requires a separate
            recovery procedure.
          </p>
          <div className="space-y-1">
            <Label htmlFor="host-label">Label (optional)</Label>
            <Input
              id="host-label"
              value={hostLabel}
              onChange={(event) => setHostLabel(event.target.value)}
              disabled={pending || hasActiveHostReservation}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="env">Deployment environment</Label>
            <select
              id="env"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as "development" | "staging" | "production")
              }
              disabled={pending}
            >
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
          </div>
          <Button type="submit" disabled={pending || hasActiveHostReservation}>
            Authorize host
          </Button>
        </form>

        <form className="space-y-3" onSubmit={authorizeTerminal}>
          <h2 className="text-lg font-semibold">Authorize terminal</h2>
          <p className="text-sm text-muted-foreground">
            Requires an activated host. The terminal pairs to that host over the local service.
          </p>
          <div className="space-y-1">
            <Label htmlFor="terminal-label">Label (optional)</Label>
            <Input
              id="terminal-label"
              value={terminalLabel}
              onChange={(event) => setTerminalLabel(event.target.value)}
              disabled={pending || !activatedHost}
            />
          </div>
          <Button type="submit" disabled={pending || !activatedHost}>
            Authorize terminal
          </Button>
        </form>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No devices authorized yet.</TableCell>
            </TableRow>
          ) : (
            devices.map((device) => (
              <TableRow key={device.deviceId}>
                <TableCell>
                  <div className="font-medium">{device.label ?? device.deviceId}</div>
                  <div className="text-xs text-muted-foreground">{device.deviceId}</div>
                </TableCell>
                <TableCell>{device.role}</TableCell>
                <TableCell>{stateLabel(device.enrollmentState)}</TableCell>
                <TableCell>{device.deploymentEnvironment}</TableCell>
                <TableCell>
                  {device.enrollmentState !== "revoked" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => revokeDevice(device.deviceId)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </AppShell>
  );
}
