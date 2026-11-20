import { DocumentDetailPanel } from "@/components/reporting/document-detail-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; billKind: string; billId: string }> };

export default async function BillDetailPage({ params }: PageProps) {
  const { tenantId: rawTenantId, billKind, billId } = await params;
  return (
    <DocumentDetailPanel
      tenantId={decodeURIComponent(rawTenantId)}
      kind="bill"
      billKind={billKind === "farmer_bill" ? "farmer_bill" : "trader_bill"}
      id={decodeURIComponent(billId)}
    />
  );
}
