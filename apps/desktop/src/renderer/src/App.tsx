import { useEffect, useRef, useState, useTransition } from "react";
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
  StatusIndicator,
  type SidebarNavItem,
} from "@polivo/ui";
import {
  Banknote,
  BarChart3,
  ClipboardList,
  FileText,
  History,
  Settings,
  Sprout,
  Users,
} from "lucide-react";

import { BillingPanel } from "./billing/BillingPanel";
import { BillHistoryPanel } from "./bill-history/BillHistoryPanel";
import { BuyersPanel } from "./BuyersPanel";
import { CatalogPanel } from "./CatalogPanel";
import { CommissionSettingsPanel } from "./CommissionSettingsPanel";
import { FarmerBillingPanel } from "./farmer-billing/FarmerBillingPanel";
import { FarmersPanel } from "./FarmersPanel";
import { PaymentsPanel, type PaymentsInitialContext } from "./payments/PaymentsPanel";
import { PrintingSettingsPanel } from "./printing/PrintingSettingsPanel";
import { ReportsPanel } from "./ReportsPanel";

type DesktopView =
  | "billing"
  | "farmer-bills"
  | "bill-history"
  | "payments"
  | "reports"
  | "farmers"
  | "buyers"
  | "catalog"
  | "settings";

const DESKTOP_VIEWS = [
  "billing",
  "farmer-bills",
  "bill-history",
  "payments",
  "reports",
  "farmers",
  "buyers",
  "catalog",
  "settings",
] as const satisfies readonly DesktopView[];

function isDesktopView(id: string): id is DesktopView {
  return (DESKTOP_VIEWS as readonly string[]).includes(id);
}

function buildNavigation(activeView: DesktopView): SidebarNavItem[] {
  return [
    {
      id: "billing",
      label: "Billing",
      href: "#billing",
      available: true,
      active: activeView === "billing",
      icon: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "farmer-bills",
      label: "Farmer bills",
      href: "#farmer-bills",
      available: true,
      active: activeView === "farmer-bills",
      icon: <FileText className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "bill-history",
      label: "Bill history",
      href: "#bill-history",
      available: true,
      active: activeView === "bill-history",
      icon: <History className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "payments",
      label: "Payments",
      href: "#payments",
      available: true,
      active: activeView === "payments",
      icon: <Banknote className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "reports",
      label: "Reports",
      href: "#reports",
      available: true,
      active: activeView === "reports",
      icon: <BarChart3 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "farmers",
      label: "Farmers",
      href: "#farmers",
      available: true,
      active: activeView === "farmers",
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "buyers",
      label: "Buyers",
      href: "#buyers",
      available: true,
      active: activeView === "buyers",
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "catalog",
      label: "Catalog",
      href: "#catalog",
      available: true,
      active: activeView === "catalog",
      icon: <Sprout className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "settings",
      label: "Settings",
      href: "#settings",
      available: true,
      active: activeView === "settings",
      icon: <Settings className="h-5 w-5" aria-hidden="true" />,
    },
  ];
}

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
  const [activeView, setActiveView] = useState<DesktopView>("billing");
  const [enrollment, setEnrollment] = useState<EnrollmentStatus | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [enrollmentSecret, setEnrollmentSecret] = useState("");
  const [hostAddress, setHostAddress] = useState("127.0.0.1");
  const [hostPort, setHostPort] = useState("3040");
  const [staffCode, setStaffCode] = useState("");
  const [staffSecret, setStaffSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [staffEpoch, setStaffEpoch] = useState(0);
  const [paymentsContext, setPaymentsContext] = useState<PaymentsInitialContext | null>(null);
  const paymentsNonceRef = useRef(0);
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
        setStaffEpoch((value) => value + 1);
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
      setStaffEpoch((value) => value + 1);
      setActiveView("billing");
      setPaymentsContext(null);
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
      setStaffEpoch((value) => value + 1);
      setActiveView("billing");
      setPaymentsContext(null);
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
  const hostAvailable = signedIn && !hostDown && !identityFailed;
  const canManageParties = Boolean(connection?.capabilities.includes("parties.register_edit"));
  const canManageCatalog = Boolean(connection?.capabilities.includes("catalog.manage"));
  const canManageCommission = Boolean(connection?.capabilities.includes("commission.manage"));
  const canViewAccounts = Boolean(connection?.capabilities.includes("accounts.view"));
  const canPrepareOpening = Boolean(connection?.capabilities.includes("accounts.opening_prepare"));
  const canPostOpening = Boolean(connection?.capabilities.includes("accounts.opening_post"));
  const canCreateBill = Boolean(connection?.capabilities.includes("bills.create"));
  const canEditDraft = Boolean(connection?.capabilities.includes("bills.edit_draft"));
  const canFinalizeBill = Boolean(connection?.capabilities.includes("bills.finalize"));
  const canCorrectFinalized = Boolean(connection?.capabilities.includes("bills.correct_finalized"));
  const canCancelFinalized = Boolean(connection?.capabilities.includes("bills.cancel_finalized"));
  const canReceivePayment = Boolean(connection?.capabilities.includes("payments.receive_trader"));
  const canPayFarmer = Boolean(connection?.capabilities.includes("payments.pay_farmer"));
  const canReversePayment = Boolean(connection?.capabilities.includes("payments.reverse"));
  const canViewReports = Boolean(connection?.capabilities.includes("reports.view_financial"));
  const canExportData = Boolean(connection?.capabilities.includes("data.export"));

  function openPayments(context: Omit<PaymentsInitialContext, "nonce">) {
    paymentsNonceRef.current += 1;
    setPaymentsContext({ ...context, nonce: paymentsNonceRef.current });
    setActiveView("payments");
  }

  const staffSessionKey = signedIn ? `${connection?.staffCode ?? "staff"}:${staffEpoch}` : null;
  const navigation = buildNavigation(activeView);

  return (
    <AppShell
      compactNav
      brand={<BrandMark compact />}
      navigation={navigation}
      onNavigate={(item) => {
        if (isDesktopView(item.id)) {
          setActiveView(item.id);
        }
      }}
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

      {activeView === "farmer-bills" ? (
        <FarmerBillingPanel
          key={staffSessionKey ?? "signed-out"}
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canRead={canCreateBill || canEditDraft || canFinalizeBill}
          canIssue={canFinalizeBill}
          staffKey={staffSessionKey}
        />
      ) : activeView === "bill-history" ? (
        <BillHistoryPanel
          key={staffSessionKey ?? "signed-out"}
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canRead={
            canCreateBill ||
            canEditDraft ||
            canFinalizeBill ||
            canCorrectFinalized ||
            canCancelFinalized
          }
          canCorrect={canCorrectFinalized}
          canCancel={canCancelFinalized}
          staffKey={staffSessionKey}
          paymentKinds={[
            ...(canReceivePayment ? (["trader"] as const) : []),
            ...(canPayFarmer ? (["farmer"] as const) : []),
          ]}
          onRecordPayment={(context) =>
            openPayments({
              partyKind: context.partyKind,
              party: { ...context.party, active: true },
              bill: context.bill,
            })
          }
        />
      ) : activeView === "reports" ? (
        <ReportsPanel canView={canViewReports} canExport={canExportData} />
      ) : activeView === "payments" ? (
        <PaymentsPanel
          key={staffSessionKey ?? "signed-out"}
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canReceive={canReceivePayment}
          canPay={canPayFarmer}
          canReverse={canReversePayment}
          staffKey={staffSessionKey}
          initialContext={paymentsContext}
          onInitialContextConsumed={() => setPaymentsContext(null)}
        />
      ) : activeView === "farmers" ? (
        <FarmersPanel
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canManage={canManageParties}
          canViewAccounts={canViewAccounts}
          canPrepareOpening={canPrepareOpening}
          canPostOpening={canPostOpening}
          staffKey={staffSessionKey}
          onRecordPayout={
            canPayFarmer
              ? (farmer) => openPayments({ partyKind: "farmer", party: farmer })
              : undefined
          }
        />
      ) : activeView === "buyers" ? (
        <BuyersPanel
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canManage={canManageParties}
          canViewAccounts={canViewAccounts}
          canPrepareOpening={canPrepareOpening}
          canPostOpening={canPostOpening}
          staffKey={staffSessionKey}
          onReceivePayment={
            canReceivePayment
              ? (buyer) => openPayments({ partyKind: "trader", party: buyer })
              : undefined
          }
        />
      ) : activeView === "catalog" ? (
        <CatalogPanel
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canManage={canManageCatalog}
          staffKey={staffSessionKey}
        />
      ) : activeView === "settings" ? (
        <div className="space-y-6">
          <CommissionSettingsPanel
            key={staffSessionKey ?? "signed-out"}
            hostAvailable={hostAvailable}
            signedIn={signedIn}
            canManage={canManageCommission}
            staffKey={staffSessionKey}
          />
          <PrintingSettingsPanel hostAvailable={hostAvailable} signedIn={signedIn} />
        </div>
      ) : (
        <BillingPanel
          key={staffSessionKey ?? "signed-out"}
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canCreate={canCreateBill}
          canEditDraft={canEditDraft}
          canFinalize={canFinalizeBill}
          staffKey={staffSessionKey}
        />
      )}
    </AppShell>
  );
}
