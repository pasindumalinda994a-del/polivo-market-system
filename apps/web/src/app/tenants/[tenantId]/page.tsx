import { Suspense } from "react";

import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";

import { TenantShell } from "./tenant-shell";

export const dynamic = "force-dynamic";

type TenantPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function TenantPage({ params }: TenantPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}`);
  const access = await resolveTenantAccess(user.subject, tenantId);

  if (access.status === "unavailable") {
    return (
      <Suspense>
        <TenantShell state="unavailable" message={access.message} />
      </Suspense>
    );
  }

  if (access.status === "denied") {
    return (
      <Suspense>
        <TenantShell state="denied" />
      </Suspense>
    );
  }

  return (
    <Suspense>
      <TenantShell state="allowed" membership={access.membership} />
    </Suspense>
  );
}
