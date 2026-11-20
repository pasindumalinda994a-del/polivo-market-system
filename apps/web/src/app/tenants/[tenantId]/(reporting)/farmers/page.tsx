import { PartyListPanel } from "@/components/reporting/party-list-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string }> };

export default async function FarmersPage({ params }: PageProps) {
  const { tenantId: rawTenantId } = await params;
  return <PartyListPanel tenantId={decodeURIComponent(rawTenantId)} kind="farmers" />;
}