import { Suspense } from "react";

import { WebAuthError } from "@/lib/auth/errors";
import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { listTenantDevices } from "@/lib/device/enrollment";
import { deriveOnboardingReadiness } from "@/lib/onboarding/readiness";
import { getAccessConfigDeliveryStatus } from "@/lib/tenant/permission-profiles";
import { getStallAdminProfile } from "@/lib/tenant/stall-profile";

import { TenantShell } from "../tenant-shell";
import { SetupOverview } from "./setup-overview";

export const dynamic = "force-dynamic";

type SetupPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function StallSetupPage({ params }: SetupPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/setup`);
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

  const membership = access.membership;
  const isOwner = membership.accessRole === "owner";
  const observedAt = new Date().toISOString();

  let profile = null;
  let profileError: string | null = null;
  if (isOwner) {
    try {
      profile = await getStallAdminProfile(tenantId);
    } catch (error) {
      profileError =
        error instanceof WebAuthError ? error.message : "Unable to load stall profile.";
    }
  }

  let devices = null;
  let devicesError: string | null = null;
  if (isOwner) {
    try {
      ({ devices } = await listTenantDevices(tenantId));
    } catch (error) {
      devicesError = error instanceof WebAuthError ? error.message : "Unable to load devices.";
    }
  }

  let delivery = null;
  let deliveryError: string | null = null;
  try {
    delivery = await getAccessConfigDeliveryStatus(tenantId);
  } catch (error) {
    deliveryError =
      error instanceof WebAuthError
        ? error.message
        : "Unable to load configuration delivery status.";
  }

  const readiness = deriveOnboardingReadiness({
    membership,
    profile,
    profileError,
    devices,
    devicesError,
    delivery,
    deliveryError,
    observedAt,
  });

  return (
    <Suspense>
      <SetupOverview membership={membership} readiness={readiness} isOwner={isOwner} />
    </Suspense>
  );
}
