import { PartyDetailPanel } from "@/components/reporting/party-detail-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; buyerId: string }> };

export default async function BuyerDetailPage({ params }: PageProps) {
  const { tenantId: rawTenantId, buyerId } = await params;
  return (
    <PartyDetailPanel
      tenantId={decodeURIComponent(rawTenantId)}
      partyKind="trader"
      partyId={decodeURIComponent(buyerId)}
    />
  );
}
