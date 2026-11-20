import { DocumentDetailPanel } from "@/components/reporting/document-detail-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; paymentId: string }> };

export default async function PaymentDetailPage({ params }: PageProps) {
  const { tenantId: rawTenantId, paymentId } = await params;
  return (
    <DocumentDetailPanel
      tenantId={decodeURIComponent(rawTenantId)}
      kind="payment"
      id={decodeURIComponent(paymentId)}
    />
  );
}