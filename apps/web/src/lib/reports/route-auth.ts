import {
  assertAccountsViewAccess,
  assertExportAccess,
  assertReportingAccess,
  assertSyncViewAccess,
  assertTenantAccessAllowed,
  resolveTenantAccess,
  type MembershipSummary,
} from "@/lib/auth/memberships";
import { requireApiUser } from "@/lib/auth/require-user";

export async function requireReportingMembership(tenantId: string): Promise<MembershipSummary> {
  const user = await requireApiUser();
  const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
  return assertReportingAccess(access);
}

export async function requireExportMembership(tenantId: string): Promise<{
  membership: MembershipSummary;
  subject: string;
}> {
  const user = await requireApiUser();
  const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
  return { membership: assertExportAccess(assertReportingAccess(access)), subject: user.subject };
}

export async function requireAccountsMembership(tenantId: string): Promise<MembershipSummary> {
  const user = await requireApiUser();
  const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
  return assertAccountsViewAccess(access);
}

export async function requireSyncViewMembership(tenantId: string): Promise<MembershipSummary> {
  const user = await requireApiUser();
  const access = assertTenantAccessAllowed(await resolveTenantAccess(user.subject, tenantId));
  return assertSyncViewAccess(access);
}