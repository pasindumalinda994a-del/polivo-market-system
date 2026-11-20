import { SyncDiagnosticsPanel } from "@/components/reporting/sync-diagnostics-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function SyncDiagnosticsPage({ params }: PageProps) {
  const { tenantId: rawTenantId } = await params;
  return <SyncDiagnosticsPanel tenantId={decodeURIComponent(rawTenantId)} />;
}