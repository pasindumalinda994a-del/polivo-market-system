import { OutstandingPanel } from "@/components/reporting/outstanding-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function OutstandingPage({ params }: PageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  return <OutstandingPanel tenantId={tenantId} />;
}
