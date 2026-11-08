import { Suspense } from "react";

import { WebAuthError } from "@/lib/auth/errors";
import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { listTenantDevices } from "@/lib/device/enrollment";

import { TenantShell } from "../tenant-shell";
import { DevicesAdmin } from "./devices-admin";

export const dynamic = "force-dynamic";

type DevicesPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function DevicesPage({ params }: DevicesPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/devices`);
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

  let devices: Awaited<ReturnType<typeof listTenantDevices>>["devices"];
  try {
    ({ devices } = await listTenantDevices(tenantId));
  } catch (error) {
    if (error instanceof WebAuthError && error.code === "SERVICE_UNAVAILABLE") {
      return (
        <Suspense>
          <TenantShell state="unavailable" message={error.message} />
        </Suspense>
      );
    }
    throw error;
  }

  return (
    <DevicesAdmin
      tenantId={tenantId}
      displayName={access.membership.displayName}
      devices={devices}
    />
  );
}
