import { assertReportingAccess, resolveTenantAccess } from "@/lib/auth/memberships";
import { requirePageUser } from "@/lib/auth/require-user";
import { ReportingShell } from "@/components/reporting/reporting-shell";

export const dynamic = "force-dynamic";

export async function TenantReportingLayout({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  const user = await requirePageUser(`/tenants/${encodeURIComponent(tenantId)}`);
  const access = await resolveTenantAccess(user.subject, tenantId);

  if (access.status === "unavailable") {
    return <ReportingShell state="unavailable" message={access.message} />;
  }
  if (access.status === "denied") {
    return <ReportingShell state="denied" />;
  }

  try {
    assertReportingAccess(access.membership);
  } catch {
    return <ReportingShell state="denied" />;
  }

  return (
    <ReportingShell state="allowed" membership={access.membership}>
      {children}
    </ReportingShell>
  );
}
