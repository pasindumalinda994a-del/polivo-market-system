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
import { KeyRound, LayoutDashboard, Users } from "lucide-react";

import type { InvitationSummary } from "@/lib/tenant/invitations";
import type { TenantMemberSummary } from "@/lib/tenant/membership-admin";
import type { PermissionProfileSummary } from "@/lib/tenant/permission-profiles";

export type MembersAdminProps = {
  tenantId: string;
  displayName: string;
  members: TenantMemberSummary[];
  invitations: InvitationSummary[];
  profiles: PermissionProfileSummary[];
  currentSubject: string;
};

export function MembersAdmin({
  tenantId,
  displayName,
  members: initialMembers,
  invitations: initialInvitations,
  profiles,
  currentSubject,
}: MembersAdminProps) {
  const [pending, startTransition] = useTransition();
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"billing_staff" | "cashier">("billing_staff");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const profileCaps = useMemo(() => {
    const map = new Map(profiles.map((profile) => [profile.profileRole, profile.capabilities]));
    return map;
  }, [profiles]);

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
      active: true,
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `/tenants/${encodeURIComponent(tenantId)}/permissions`,
      available: true,
      icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  function createInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setCopiedLink(null);

    startTransition(async () => {
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          accessRole: role,
          capabilities: profileCaps.get(role) ?? [],
        }),
      });
      const payload = (await response.json()) as {
        acceptPath?: string;
        invitationId?: string;
        expiresAt?: string;
        message?: string;
      };
      if (!response.ok || !payload.acceptPath || !payload.invitationId) {
        setError(payload.message ?? "Unable to create invitation.");
        return;
      }

      const absolute = `${window.location.origin}${payload.acceptPath}`;
      setCopiedLink(absolute);
      setInvitations((current) => [
        {
          invitationId: payload.invitationId!,
          emailNormalized: email.trim().toLowerCase(),
          accessRole: role,
          status: "pending",
          expiresAt: payload.expiresAt ?? "",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setEmail("");
      setMessage("Invitation created. Copy the link now — the token is shown only once.");
    });
  }

  function deactivateMember(membershipId: string) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/memberships/${encodeURIComponent(membershipId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "inactive" }),
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Unable to update membership.");
        return;
      }
      setMembers((current) =>
        current.map((member) =>
          member.membershipId === membershipId ? { ...member, status: "inactive" } : member,
        ),
      );
      setMessage("Member access deactivated. Historical records are retained.");
    });
  }

  function revokeInvitation(invitationId: string) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Unable to revoke invitation.");
        return;
      }
      setInvitations((current) => current.filter((item) => item.invitationId !== invitationId));
      setMessage("Invitation revoked.");
    });
  }

  return (
    <AppShell
      brand={<BrandMark />}
      navigation={navigation}
      header={
        <AppHeader
          title="Members"
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
        title={`Members · ${displayName}`}
        description="Owner-only membership administration. Removing access does not delete bills, payments, or audit history."
      />

      {message ? (
        <Alert className="mb-4">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="mb-4" variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {copiedLink ? (
        <Alert className="mb-4">
          <AlertTitle>Copyable invitation link</AlertTitle>
          <AlertDescription>
            <code className="break-all text-xs">{copiedLink}</code>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Invite member</h2>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createInvite}>
          <div className="space-y-2 sm:min-w-[240px]">
            <Label htmlFor="invite-email">Recipient email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Profile</Label>
            <select
              id="invite-role"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value as "billing_staff" | "cashier")}
              disabled={pending}
            >
              <option value="billing_staff">Billing staff</option>
              <option value="cashier">Cashier</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            Create invitation
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Capabilities are taken from the current cloud profile for the selected role. Ownership
          cannot be invited or transferred. After create, copy the invitation link and send it to
          the recipient — Polivo does not email invites, and recipients will not see pending
          invitations on their dashboard.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Active and inactive members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.membershipId}>
                <TableCell className="font-mono text-xs">{member.externalSubject}</TableCell>
                <TableCell>{member.accessRole.replaceAll("_", " ")}</TableCell>
                <TableCell>{member.status}</TableCell>
                <TableCell>
                  {member.accessRole !== "owner" &&
                  member.status === "active" &&
                  member.externalSubject !== currentSubject ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => deactivateMember(member.membershipId)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.invitationId}>
                  <TableCell>{invitation.emailNormalized}</TableCell>
                  <TableCell>{invitation.accessRole.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-sm">{invitation.expiresAt}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => revokeInvitation(invitation.invitationId)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </AppShell>
  );
}
