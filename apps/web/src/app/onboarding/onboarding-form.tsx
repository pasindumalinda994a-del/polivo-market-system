"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  ErrorState,
  Input,
  Label,
  PageHeader,
  type SidebarNavItem,
} from "@polivo/ui";
import { LayoutDashboard } from "lucide-react";

const navigation: SidebarNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    available: true,
    icon: <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
  },
];

const TIMEZONES = [
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "UTC",
  "Europe/London",
  "America/New_York",
] as const;

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `onboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function OnboardingForm() {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState<string>("Asia/Colombo");
  const [marketLocation, setMarketLocation] = useState("");
  const [contact, setContact] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successTenantId, setSuccessTenantId] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setSubmitError(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 1) {
      setFieldError("Stall display name is required.");
      return;
    }
    if (!timezone.trim()) {
      setFieldError("Business timezone is required.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey,
            displayName: trimmedName,
            timezone: timezone.trim(),
            ...(marketLocation.trim() ? { marketLocation: marketLocation.trim() } : {}),
            ...(contact.trim() ? { contact: contact.trim() } : {}),
          }),
        });
        const payload = (await response.json()) as {
          tenantId?: string;
          message?: string;
        };
        if (!response.ok || !payload.tenantId) {
          setSubmitError(payload.message ?? "Unable to create the stall account.");
          return;
        }
        setSuccessTenantId(payload.tenantId);
        router.push(`/tenants/${encodeURIComponent(payload.tenantId)}?created=1`);
      } catch {
        setSubmitError("Unable to create the stall account. Check your connection and try again.");
      }
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Create stall"
          actions={
            <div className="flex items-center gap-3">
              <Link
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                href="/dashboard"
              >
                Dashboard
              </Link>
              <UserButton />
            </div>
          }
        />
      }
    >
      <PageHeader
        title="Create a stall account"
        description="Creates an online stall tenant and makes you the owner. Desktop installation and device setup are not part of this step."
      />

      {submitError ? (
        <div className="mb-4">
          <ErrorState title="Could not create stall" description={submitError} />
        </div>
      ) : null}

      {successTenantId ? (
        <Alert className="mb-4">
          <AlertTitle>Stall account created. Desktop setup is not complete.</AlertTitle>
          <AlertDescription>
            Opening stall {successTenantId}. You can invite staff after the stall page loads.
          </AlertDescription>
        </Alert>
      ) : null}

      <form id={formId} className="max-w-xl space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Stall display name (required)</Label>
          <Input
            id={`${formId}-name`}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={128}
            required
            disabled={pending}
            autoComplete="organization"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-timezone`}>Business timezone (required)</Label>
          <select
            id={`${formId}-timezone`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            disabled={pending}
            required
          >
            {TIMEZONES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-location`}>Market / location (optional)</Label>
          <Input
            id={`${formId}-location`}
            value={marketLocation}
            onChange={(event) => setMarketLocation(event.target.value)}
            maxLength={256}
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-contact`}>Contact (optional)</Label>
          <Input
            id={`${formId}-contact`}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={256}
            disabled={pending}
          />
        </div>

        {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create stall account"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard">Cancel</Link>
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
