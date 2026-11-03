import { useEffect, useState, useTransition } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  EmptyState,
  Input,
  Label,
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

type EnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
};

export default function App() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.polivoEnrollment
      ?.getStatus()
      .then(setStatus)
      .catch(() => {
        setStatus(null);
      });
  }, []);

  function enroll() {
    setError(null);
    startTransition(async () => {
      try {
        if (!window.polivoEnrollment) {
          setError("Enrollment bridge is unavailable.");
          return;
        }
        const next = await window.polivoEnrollment.enrollTerminal({
          enrollmentSecret: secret.trim(),
          enrollmentBaseUrl: "http://localhost:3000",
          deploymentEnvironment: "development",
          hostServiceBaseUrl: "http://127.0.0.1:3040",
        });
        setStatus(next);
        setSecret("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terminal enrollment failed.");
      }
    });
  }

  const serviceLabel =
    status?.pairingState === "paired"
      ? `Paired to ${status.stallDisplayName ?? "stall"}`
      : status?.pairingState === "waiting_host_confirm"
        ? "Waiting for host confirmation"
        : "Service connection not configured";

  return (
    <AppShell
      compactNav
      brand={<BrandMark compact />}
      navigation={navigation}
      header={<AppHeader title="Desktop workspace" />}
      statusArea={
        <StatusIndicator
          tone={
            status?.pairingState === "paired"
              ? "available"
              : status?.pairingState === "waiting_host_confirm"
                ? "pending"
                : "unavailable"
          }
          label={serviceLabel}
          className="w-full justify-start bg-white/10 text-text-inverse"
        />
      }
    >
      <PageHeader
        title="Desktop application shell"
        description="Keyboard-first billing screens will use this workspace later. Terminal enrollment is available for phase 14."
      />

      <section className="mb-6 space-y-3 rounded-md border border-border p-4">
        <h2 className="text-base font-semibold">Terminal enrollment</h2>
        <p className="text-sm text-muted-foreground">
          Paste the one-time secret from the owner Devices page. Private keys stay in the main
          process via OS-protected storage.
        </p>
        {status ? (
          <p className="text-sm">
            Installation {status.installationId.slice(0, 8)}… · state {status.pairingState}
            {status.stallDisplayName ? ` · ${status.stallDisplayName}` : ""}
            {status.hostDeviceId ? ` · host ${status.hostDeviceId}` : ""}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Enrollment failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="enrollment-secret">Enrollment secret</Label>
          <Input
            id="enrollment-secret"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </div>
        <Button type="button" disabled={pending || secret.trim().length < 32} onClick={enroll}>
          Pair this terminal
        </Button>
      </section>

      <EmptyState
        title="Billing workspace reserved"
        description="Party selection, line entry, and totals will appear here in a later phase. No financial data is shown."
      />
    </AppShell>
  );
}
