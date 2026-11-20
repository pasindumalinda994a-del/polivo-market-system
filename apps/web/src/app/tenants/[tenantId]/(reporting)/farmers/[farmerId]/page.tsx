import { PartyDetailPanel } from "@/components/reporting/party-detail-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; farmerId: string }> };

export default async function FarmerDetailPage({ params }: PageProps) {
  const { tenantId: rawTenantId, farmerId } = await params;
  return (
    <PartyDetailPanel
      tenantId={decodeURIComponent(rawTenantId)}
      partyKind="farmer"
      partyId={decodeURIComponent(farmerId)}
    />
  );
}