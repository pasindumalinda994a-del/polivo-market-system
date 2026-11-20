import { StatementPanel } from "@/components/reporting/statement-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; partyKind: string; partyId: string }> };

export default async function StatementPage({ params }: PageProps) {
  const { tenantId: rawTenantId, partyKind, partyId } = await params;
  const normalizedKind = partyKind === "farmer" ? "farmer" : "trader";
  return (
    <StatementPanel
      tenantId={decodeURIComponent(rawTenantId)}
      partyKind={normalizedKind}
      partyId={decodeURIComponent(partyId)}
    />
  );
}