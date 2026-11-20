import { listActiveMemberships } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { resolvePlatformAdminAccess } from "@/lib/platform/admin";

import { DashboardShell } from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser("/dashboard");
  const membershipResult = await listActiveMemberships(user.subject);

  let isPlatformAdmin = false;
  try {
    isPlatformAdmin = await resolvePlatformAdminAccess();
  } catch {
    isPlatformAdmin = false;
  }

  if (membershipResult.status === "unavailable") {
    return (
      <DashboardShell
        membershipState="unavailable"
        memberships={[]}
        unavailableMessage={membershipResult.message}
        isPlatformAdmin={isPlatformAdmin}
      />
    );
  }

  if (membershipResult.memberships.length === 0) {
    return (
      <DashboardShell membershipState="none" memberships={[]} isPlatformAdmin={isPlatformAdmin} />
    );
  }

  return (
    <DashboardShell
      membershipState="active"
      memberships={membershipResult.memberships}
      isPlatformAdmin={isPlatformAdmin}
    />
  );
}
