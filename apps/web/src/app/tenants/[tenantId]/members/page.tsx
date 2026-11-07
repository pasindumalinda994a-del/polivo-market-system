import { Suspense } from "react";

import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { listPendingInvitations } from "@/lib/tenant/invitations";
import { listTenantMembers } from "@/lib/tenant/membership-admin";
import { listPermissionProfiles } from "@/lib/tenant/permission-profiles";

import { TenantShell } from "../tenant-shell";
import { MembersAdmin } from "./members-admin";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function MembersPage({ params }: MembersPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/members`);
  const access = await resolveTenantAccess(user.subject, tenantId);

  if (access.status === "unavailable") {
    return (
      <Suspense>
        <TenantShell state="unavailable" message={access.message} />
      </Suspense>
    );
  }

  if (access.status === "denied" || access.membership.accessRole !== "owner") {
    return (
      <Suspense>
        <TenantShell state="denied" />
      </Suspense>
    );
  }

  const [members, invitations, profiles] = await Promise.all([
    listTenantMembers(tenantId),
    listPendingInvitations(tenantId),
    listPermissionProfiles(tenantId),
  ]);

  return (
    <MembersAdmin
      tenantId={tenantId}
      displayName={access.membership.displayName}
      members={members}
      invitations={invitations}
      profiles={profiles}
      currentSubject={user.subject}
    />
  );
}
