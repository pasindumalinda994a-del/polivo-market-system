import { resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { getAccessConfigDeliveryStatus } from "@/lib/tenant/permission-profiles";
import { getStallAdminProfile } from "@/lib/tenant/stall-profile";

import { TenantShell } from "../tenant-shell";
import { StallProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function StallProfilePage({ params }: ProfilePageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}/profile`);
  const access = await resolveTenantAccess(user.subject, tenantId);

  if (access.status === "unavailable") {
    return <TenantShell state="unavailable" message={access.message} />;
  }

  if (access.status === "denied" || access.membership.accessRole !== "owner") {
    return <TenantShell state="denied" />;
  }

  const [profile, delivery] = await Promise.all([
    getStallAdminProfile(tenantId),
    getAccessConfigDeliveryStatus(tenantId),
  ]);

  const deliverySummary = `Published revision: ${delivery.publishedRevision ?? "none"} · Local application: ${delivery.localApplicationStatus.replaceAll("_", " ")}${
    delivery.lastAcknowledgedRevision != null
      ? ` · Acknowledged ${delivery.lastAcknowledgedRevision}`
      : ""
  }. Waiting for host application until acknowledgement arrives.`;

  return (
    <StallProfileEditor
      tenantId={tenantId}
      displayName={access.membership.displayName}
      deliverySummary={deliverySummary}
      initial={{
        displayName: profile.displayName,
        timezone: profile.timezone,
        marketLocation: profile.marketLocation ?? "",
        contact: profile.contact ?? "",
        adminNotes: profile.adminNotes,
        expectedRevision: profile.profileRevision,
        status: profile.status,
      }}
    />
  );
}
