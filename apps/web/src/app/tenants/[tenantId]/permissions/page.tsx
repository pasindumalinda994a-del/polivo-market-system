import { Suspense } from "react";

import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { listPermissionProfiles } from "@/lib/tenant/permission-profiles";

import { TenantShell } from "../tenant-shell";
import { PermissionsEditor } from "./permissions-editor";

export const dynamic = "force-dynamic";

type PermissionsPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function PermissionsPage({ params }: PermissionsPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/permissions`);
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

  const profiles = await listPermissionProfiles(tenantId);

  return (
    <PermissionsEditor
      tenantId={tenantId}
      displayName={access.membership.displayName}
      profiles={profiles}
    />
  );
}
