"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  Badge,
  BrandMark,
  Button,
  PageHeader,
} from "@polivo/ui";
import { ClipboardList, KeyRound, LayoutDashboard, MonitorSmartphone, Users } from "lucide-react";

import type { MembershipSummary } from "@/lib/auth/membership-summary";
import {
  milestoneStatusLabel,
  type OnboardingMilestone,
  type OnboardingReadiness,
} from "@/lib/onboarding/readiness";
import { buildOwnerSidebarNav } from "@/lib/tenant/owner-nav";

export type SetupOverviewProps = {
  membership: MembershipSummary;
  readiness: OnboardingReadiness;
  isOwner: boolean;
};

function statusVariant(
  status: OnboardingMilestone["status"],
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "confirmed_complete":
      return "success";
    case "action_required":
      return "warning";
    case "awaiting_host_confirmation":
      return "info";
    case "blocked":
      return "error";
    default:
      return "neutral";
  }
}

export function SetupOverview({ membership, readiness, isOwner }: SetupOverviewProps) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const [pending, startTransition] = useTransition();
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupExpiresAt, setSetupExpiresAt] = useState<string | null>(null);
  const [downloadedNote, setDownloadedNote] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const navigation = buildOwnerSidebarNav({
    tenantId: membership.tenantId,
    activeId: "setup",
    icons: {
      dashboard: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
      setup: <ClipboardList className="h-5 w-5" aria-hidden="true" />,
      members: <Users className="h-5 w-5" aria-hidden="true" />,
      permissions: <KeyRound className="h-5 w-5" aria-hidden="true" />,
      devices: <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />,
    },
  });

  function issueSetupGrant() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/tenants/${encodeURIComponent(membership.tenantId)}/local-staff/setup-grant`,
          { method: "POST" },
        );
        const payload = (await response.json()) as {
          setupGrantSecret?: string;
          expiresAt?: string;
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(payload.error?.message ?? "Unable to issue local owner setup grant.");
          return;
        }
        setSetupSecret(payload.setupGrantSecret ?? null);
        setSetupExpiresAt(payload.expiresAt ?? null);
        setMessage(
          "Setup grant issued. Copy the secret into the host setup command now — it will not be shown again and is not stored in this browser.",
        );
      } catch {
        setError("Unable to issue local owner setup grant.");
      }
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={isOwner ? navigation : []}
      header={
        <AppHeader
          title={membership.displayName}
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href={`/tenants/${encodeURIComponent(membership.tenantId)}`}
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
        title="Setup overview"
        description="Statuses are derived from trusted server records. Unknown means no confirmation exists yet."
        actions={
          readiness.nextPermittedAction ? (
            <Button asChild>
              <Link href={readiness.nextPermittedAction.href}>
                {readiness.nextPermittedAction.label}
              </Link>
            </Button>
          ) : null
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        Overview generated at {readiness.observedAt} (server clock). Refresh to re-check current
        authorization and device state.
      </p>

      {justCreated ? (
        <Alert className="mb-4">
          <AlertTitle>Stall account created. Desktop setup is not complete.</AlertTitle>
          <AlertDescription>
            Your online stall is ready. Authorize the host next, then issue the local owner setup
            grant after activation.
          </AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert className="mb-4">
          <AlertTitle>Setup update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Unable to continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {setupSecret ? (
        <Alert className="mb-4">
          <AlertTitle>One-time local owner setup secret</AlertTitle>
          <AlertDescription>
            <p className="mb-2 break-all font-mono text-sm">{setupSecret}</p>
            {setupExpiresAt ? <p className="mb-2 text-sm">Expires at {setupExpiresAt}.</p> : null}
            <p className="text-sm">
              Redeem on the enrolled host with the stall-service owner setup flow. Do not put this
              secret in URLs, logs, analytics, or screenshots.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <ol className="mb-8 space-y-3">
        {readiness.milestones.map((milestone) => (
          <li
            key={milestone.id}
            className="rounded-md border border-border bg-bg-surface px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{milestone.title}</h2>
              <Badge variant={statusVariant(milestone.status)}>
                {milestoneStatusLabel(milestone.status)}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{milestone.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Evidence: {milestone.evidenceSource}
              {milestone.lastConfirmedAt ? ` · Last confirmed ${milestone.lastConfirmedAt}` : ""}
            </p>
            {milestone.nextActionHref && milestone.nextActionLabel ? (
              <Link
                href={milestone.nextActionHref}
                className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {milestone.nextActionLabel}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      {isOwner ? (
        <section className="mb-8 space-y-3 rounded-md border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold text-foreground">Local owner setup grant</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Web sign-in is not a desktop staff account. After the host is activated, issue a
            short-lived setup grant and redeem it on the host. Issuing a grant does not mark owner
            setup complete.
          </p>
          <Button type="button" disabled={pending} onClick={issueSetupGrant}>
            Issue local owner setup grant
          </Button>
        </section>
      ) : null}

      <section className="space-y-3 rounded-md border border-border bg-bg-surface p-4">
        <h2 className="text-lg font-semibold text-foreground">Convenience checklist</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Personal notes only. They never establish installation, enrollment, or service readiness.
        </p>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={downloadedNote}
            onChange={(event) => setDownloadedNote(event.target.checked)}
          />
          <span>I downloaded a desktop build (convenience only — not trusted evidence).</span>
        </label>
        <p className="text-sm text-muted-foreground">
          Terminal connection steps stay in the desktop app. See the{" "}
          <Link
            href="/setup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            public setup guide
          </Link>
          .
        </p>
      </section>
    </AppShell>
  );
}
