import { OverviewPanel } from "@/components/reporting/overview-panel";

export const dynamic = "force-dynamic";

type TenantPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function TenantPage({ params }: TenantPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  return <OverviewPanel tenantId={tenantId} />;
}