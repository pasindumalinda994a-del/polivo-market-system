import { TenantReportingLayout } from "../tenant-reporting-layout";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
};

export default async function TenantLayout({ children, params }: LayoutProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  return <TenantReportingLayout tenantId={tenantId}>{children}</TenantReportingLayout>;
}