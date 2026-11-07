import { useEffect, useRef, useState, useTransition } from "react";
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
  hasHostTrustPins: boolean;
};

type ConnectionStatus = {
  state:
    | "unconfigured"
    | "unreachable"
    | "identity_failed"
    | "verified"
    | "signed_in"
    | "session_refresh_required"
    | "signed_out";
  pairedHostDeviceId: string | null;
  verifiedStallDisplayName: string | null;
  configuredHostLabel: string | null;
  lastSuccessfulCheckAt: string | null;
  lastErrorMessage: string | null;
  staffDisplayName: string | null;
  staffCode: string | null;
  capabilities: string[];
};

function statusTone(
  connection: ConnectionStatus | null,
  enrollment: EnrollmentStatus | null,
): "available" | "pending" | "unavailable" {
  if (connection?.state === "signed_in" || connection?.state === "verified") {
    return "available";
  }
  if (
    connection?.state === "unreachable" ||
    connection?.state === "identity_failed" ||
    connection?.state === "session_refresh_required"
  ) {
    return "pending";
  }
  if (enrollment?.pairingState === "waiting_host_confirm") {
    return "pending";
  }
  return "unavailable";
}

function statusLabel(
  connection: ConnectionStatus | null,
  enrollment: EnrollmentStatus | null,
): string {
  if (connection?.state === "signed_in" && connection.staffDisplayName) {
    return `${connection.staffDisplayName} · ${connection.verifiedStallDisplayName ?? "stall"}`;
  }
  if (connection?.state === "verified" && connection.verifiedStallDisplayName) {
    return `Connected · ${connection.verifiedStallDisplayName}`;
  }
  if (connection?.state === "unreachable") {
    return "Stall host unavailable";
  }
  if (connection?.state === "identity_failed") {
    return "Host identity could not be verified";
  }
  if (connection?.state === "session_refresh_required") {
    return connection.lastErrorMessage ?? "Sign-in required";
  }
  if (enrollment?.pairingState === "paired") {
    return `Paired to ${enrollment.stallDisplayName ?? "stall"}`;
  }
  if (enrollment?.pairingState === "waiting_host_confirm") {
    return "Waiting for host confirmation";
  }
  return "Service connection not configured";
}

export default function App() {
  const [pending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<EnrollmentStatus | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [enrollmentSecret, setEnrollmentSecret] = useState("");
  const [hostAddress, setHostAddress] = useState("127.0.0.1");
  const [hostPort, setHostPort] = useState("3040");
  const [staffCode, setStaffCode] = useState("");
  const [staffSecret, setStaffSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const staffCodeRef = useRef<HTMLInputElement>(null);
  const staffSecretRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.polivoEnrollment
      ?.getStatus()
      .then(setEnrollment)
      .catch(() => setEnrollment(null));
    void window.polivoConnection
      ?.getStatus()
      .then((status) => {
        setConnection(status);
        if (status.configuredHostLabel) {
          const [address, port] = status.configuredHostLabel.split(":");
          if (address) {
            setHostAddress(address);
          }
          if (port) {
            setHostPort(port);
          }
        }
      })
      .catch(() => setConnection(null));
  }, []);

  function enroll() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        if (!window.polivoEnrollment) {
          setError("Enrollment bridge is unavailable.");
          return;
        }
        const next = await window.polivoEnrollment.enrollTerminal({
          enrollmentSecret: enrollmentSecret.trim(),
          enrollmentBaseUrl: "http://localhost:3000",
          deploymentEnvironment: "development",
          hostServiceBaseUrl: "https://127.0.0.1:3040",
        });
        setEnrollment(next);
        setEnrollmentSecret("");
        setInfo(
          next.hasHostTrustPins
            ? "Terminal paired with host trust pins. Configure the service address next."
            : "Terminal paired, but trust pins are missing. Re-pair after upgrading the stall service.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terminal enrollment failed.");
      }
    });
  }

  function configureHost() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        if (!window.polivoConnection) {
          setError("Connection bridge is unavailable.");
          return;
        }
        const port = Number(hostPort);
        const result = await window.polivoConnection.configureOrTestHost({
          hostAddress: hostAddress.trim(),
          port: Number.isFinite(port) ? port : 3040,
        });
        const status = await window.polivoConnection.getStatus();
        setConnection(status);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setInfo(`Verified stall: ${result.verifiedStallDisplayName}`);
        queueMicrotask(() => staffCodeRef.current?.focus());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Host verification failed.");
      }
    });
  }

  function submitSignIn() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        if (!window.polivoConnection) {
          setError("Connection bridge is unavailable.");
          return;
        }
        const status = await window.polivoConnection.signIn({
          staffCode: staffCode.trim(),
          secret: staffSecret,
        });
        setStaffSecret("");
        setConnection(status);
        if (status.state !== "signed_in") {
          setError(status.lastErrorMessage ?? "Sign-in failed. Check your staff code and secret.");
          queueMicrotask(() => staffSecretRef.current?.focus());
          return;
        }
        setInfo(null);
      } catch (err) {
        setStaffSecret("");
        setError(err instanceof Error ? err.message : "Sign-in failed.");
        queueMicrotask(() => staffSecretRef.current?.focus());
      }
    });
  }

  function retryHost() {
    setError(null);
    startTransition(async () => {
      if (!window.polivoConnection) {
        return;
      }
      const status = await window.polivoConnection.retry();
      setConnection(status);
      if (status.lastErrorMessage) {
        setError(status.lastErrorMessage);
      }
    });
  }

  function signOut() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      if (!window.polivoConnection) {
        return;
      }
      const result = await window.polivoConnection.signOut();
      setConnection(result.status);
      setStaffCode("");
      setStaffSecret("");
      setInfo(
        result.serverRevocationAcknowledged
          ? "Signed out on this terminal and on the stall host."
          : "Signed out locally. Host revocation will complete when the host is reachable.",
      );
      queueMicrotask(() => staffCodeRef.current?.focus());
    });
  }

  function switchStaff() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      if (!window.polivoConnection) {
        return;
      }
      const status = await window.polivoConnection.switchStaff();
      setConnection(status);
      setStaffCode("");
      setStaffSecret("");
      queueMicrotask(() => staffCodeRef.current?.focus());
    });
  }

  const paired = enrollment?.pairingState === "paired";
  const verified =
    connection?.state === "verified" ||
    connection?.state === "signed_in" ||
    connection?.state === "session_refresh_required" ||
    connection?.state === "signed_out";
  const signedIn = connection?.state === "signed_in";
  const hostDown = connection?.state === "unreachable";
  const identityFailed = connection?.state === "identity_failed";

  return (
    <AppShell
      compactNav
      brand={<BrandMark compact />}
      navigation={navigation}
      header={<AppHeader title="Desktop workspace" />}
      statusArea={
        <StatusIndicator
          tone={statusTone(connection, enrollment)}
          label={statusLabel(connection, enrollment)}
          className="w-full justify-start bg-white/10 text-text-inverse"
        />
      }
    >
      <PageHeader
        title="Desktop application shell"
        description="Connect to the stall host, sign in as staff, then use the keyboard-first workspace. Session secrets stay in the main process."
      />

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert className="mb-4">
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      {!paired ? (
        <section className="mb-6 space-y-3 rounded-md border border-border p-4">
          <h2 className="text-base font-semibold">Terminal enrollment</h2>
          <p className="text-sm text-muted-foreground">
            Paste the one-time secret from the owner Devices page. Pair on the stall host so trust
            pins can be captured over loopback HTTPS.
          </p>
          {enrollment ? (
            <p className="text-sm">
              Installation {enrollment.installationId.slice(0, 8)}… · state{" "}
              {enrollment.pairingState}
              {enrollment.stallDisplayName ? ` · ${enrollment.stallDisplayName}` : ""}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="enrollment-secret">Enrollment secret</Label>
            <Input
              id="enrollment-secret"
              value={enrollmentSecret}
              onChange={(event) => setEnrollmentSecret(event.target.value)}
              autoComplete="off"
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            disabled={pending || enrollmentSecret.trim().length < 32}
            onClick={enroll}
          >
            Pair this terminal
          </Button>
        </section>
      ) : null}

      {paired ? (
        <section className="mb-6 space-y-3 rounded-md border border-border p-4">
          <h2 className="text-base font-semibold">1. Configure host</h2>
          <p className="text-sm text-muted-foreground">
            Paired host: {enrollment?.stallDisplayName ?? "stall"}
            {enrollment?.hostDeviceId ? ` (${enrollment.hostDeviceId})` : ""}. Enter the editable
            network address only — credentials are never stored here.
          </p>
          {!enrollment?.hasHostTrustPins ? (
            <Alert variant="destructive">
              <AlertTitle>Trust pins missing</AlertTitle>
              <AlertDescription>
                Re-pair this terminal on the stall host after upgrading the service. Do not send
                staff credentials until host identity can be verified.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="host-address">Host address</Label>
              <Input
                id="host-address"
                value={hostAddress}
                onChange={(event) => setHostAddress(event.target.value)}
                autoComplete="off"
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="host-port">Port</Label>
              <Input
                id="host-port"
                value={hostPort}
                onChange={(event) => setHostPort(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                disabled={pending}
              />
            </div>
            <Button
              type="button"
              disabled={pending || !enrollment?.hasHostTrustPins || hostAddress.trim().length === 0}
              onClick={configureHost}
            >
              Verify host
            </Button>
          </div>
          {(hostDown || identityFailed) && (
            <Button type="button" variant="secondary" disabled={pending} onClick={retryHost}>
              Retry connection
            </Button>
          )}
        </section>
      ) : null}

      {paired && verified && !identityFailed ? (
        <section className="mb-6 space-y-3 rounded-md border border-border p-4">
          <h2 className="text-base font-semibold">2. Staff sign-in</h2>
          {connection?.verifiedStallDisplayName ? (
            <p className="text-sm">
              Verified stall: <strong>{connection.verifiedStallDisplayName}</strong>
            </p>
          ) : null}
          {signedIn ? (
            <div className="space-y-3">
              <p className="text-sm">
                Signed in as {connection?.staffDisplayName}
                {connection?.staffCode ? ` (${connection.staffCode})` : ""}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={pending} onClick={switchStaff}>
                  Switch staff
                </Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={signOut}>
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!pending) {
                  submitSignIn();
                }
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="staff-code">Staff code</Label>
                <Input
                  id="staff-code"
                  ref={staffCodeRef}
                  value={staffCode}
                  onChange={(event) => setStaffCode(event.target.value)}
                  autoComplete="username"
                  disabled={pending || hostDown}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-secret">Secret</Label>
                <Input
                  id="staff-secret"
                  ref={staffSecretRef}
                  type="password"
                  value={staffSecret}
                  onChange={(event) => setStaffSecret(event.target.value)}
                  autoComplete="current-password"
                  disabled={pending || hostDown}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  pending || hostDown || staffCode.trim().length === 0 || staffSecret.length === 0
                }
              >
                Sign in
              </Button>
            </form>
          )}
        </section>
      ) : null}

      {signedIn ? (
        <EmptyState
          title="Billing workspace reserved"
          description={`Signed in to ${connection?.verifiedStallDisplayName ?? "the stall"}. Party selection, line entry, and totals will appear here in a later phase.`}
        />
      ) : (
        <EmptyState
          title="Billing workspace reserved"
          description="Verify the stall host and sign in to unlock the workspace. No financial data is shown."
        />
      )}
    </AppShell>
  );
}
