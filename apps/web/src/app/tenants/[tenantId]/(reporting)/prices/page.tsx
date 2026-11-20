import { ReportViewPanel } from "@/components/reporting/report-view-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function PricesPage({ params }: PageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  return <ReportViewPanel tenantId={tenantId} reportType="vegetable_prices" title="Vegetable prices" />;
}