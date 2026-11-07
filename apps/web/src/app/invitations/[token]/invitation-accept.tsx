"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  AppHeader,
  AppShell,
  BrandMark,
  Button,
  EmptyState,
  ErrorState,
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

export function InvitationAccept({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as { tenantId?: string; message?: string };
      if (!response.ok || !payload.tenantId) {
        // Prefer API public message (e.g. missing verified email claims); never invent invitation details.
        setError(
          typeof payload.message === "string" && payload.message.trim().length > 0
            ? payload.message
            : "This invitation is not available.",
        );
        return;
      }
      router.push(`/tenants/${encodeURIComponent(payload.tenantId)}`);
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Invitation"
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
        title="Accept stall invitation"
        description="Sign-in email must match the invitation. Invalid or expired invitations are not described in detail."
      />

      {error ? (
        <div className="mb-4">
          <ErrorState title="Invitation unavailable" description={error} />
        </div>
      ) : (
        <EmptyState
          title="Invitation ready"
          description="Accept to join the stall with the role and permissions recorded on the invitation."
          action={
            <Button type="button" onClick={accept} disabled={pending}>
              {pending ? "Accepting…" : "Accept invitation"}
            </Button>
          }
        />
      )}
    </AppShell>
  );
}
