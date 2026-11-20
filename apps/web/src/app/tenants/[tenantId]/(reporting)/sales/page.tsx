import { ReportViewPanel } from "@/components/reporting/report-view-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function SalesPage({ params }: PageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  return <ReportViewPanel tenantId={tenantId} reportType="sales_summary" title="Sales summary" />;
}
