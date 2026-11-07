import { listActiveMemberships } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";

import { DashboardShell } from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser("/dashboard");
  const membershipResult = await listActiveMemberships(user.subject);

  if (membershipResult.status === "unavailable") {
    return (
      <DashboardShell
        membershipState="unavailable"
        memberships={[]}
        unavailableMessage={membershipResult.message}
      />
    );
  }

  if (membershipResult.memberships.length === 0) {
    return <DashboardShell membershipState="none" memberships={[]} />;
  }

  return <DashboardShell membershipState="active" memberships={membershipResult.memberships} />;
}
