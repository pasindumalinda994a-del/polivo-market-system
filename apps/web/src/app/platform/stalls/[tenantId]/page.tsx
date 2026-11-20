import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@polivo/ui";

import { requirePageUser } from "@/lib/auth/require-user";
import { getPlatformStallDetail, resolvePlatformAdminAccess } from "@/lib/platform/admin";

import { PlatformShell } from "../../platform-shell";
import { PlatformStallProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

type StallDetailPageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function PlatformStallDetailPage({ params }: StallDetailPageProps) {
  const { tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  await requirePageUser(`/platform/stalls/${encodeURIComponent(tenantId)}`);

  let isAdmin = false;
  try {
    isAdmin = await resolvePlatformAdminAccess();
  } catch {
    return <PlatformShell state="unavailable" message="Unable to verify platform access." />;
  }
  if (!isAdmin) {
    return <PlatformShell state="denied" />;
  }

  const detail = await getPlatformStallDetail(tenantId);

  return (
    <PlatformShell state="allowed" title={detail.displayName} activeNav="directory">
      <div className="space-y-6">
        <Alert>
          <AlertTitle>Operational scope</AlertTitle>
          <AlertDescription>
            Platform visibility does not grant financial reporting or recovery write access. Status
            is read-only; suspend and archive transitions are unavailable.
          </AlertDescription>
        </Alert>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tenant id
            </dt>
            <dd className="text-sm">{detail.tenantId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Lifecycle status
            </dt>
            <dd className="text-sm capitalize">{detail.status}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Owner subject
            </dt>
            <dd className="text-sm">{detail.ownerSubject ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Enrollment
            </dt>
            <dd className="text-sm">{detail.enrollmentStatus.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last host contact (cloud observation)
            </dt>
            <dd className="text-sm">
              {detail.lastHostContactAt
                ? new Date(detail.lastHostContactAt).toLocaleString()
                : "No observed contact"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last applied upload
            </dt>
            <dd className="text-sm">
              {detail.lastUploadAppliedAt
                ? new Date(detail.lastUploadAppliedAt).toLocaleString()
                : "None observed"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Config delivery
            </dt>
            <dd className="text-sm">
              {detail.configDeliveryStatus.replaceAll("_", " ")}
              {detail.configPublishedRevision != null
                ? ` (pub ${detail.configPublishedRevision}`
                : ""}
              {detail.configAcknowledgedRevision != null
                ? ` / ack ${detail.configAcknowledgedRevision})`
                : detail.configPublishedRevision != null
                  ? " / not ack)"
                  : ""}
            </dd>
          </div>
        </dl>

        <PlatformStallProfileForm
          tenantId={detail.tenantId}
          initial={{
            displayName: detail.displayName,
            timezone: detail.timezone,
            marketLocation: detail.marketLocation ?? "",
            contact: detail.contact ?? "",
            adminNotes: detail.adminNotes,
            expectedRevision: detail.profileRevision,
          }}
        />

        <p className="text-sm">
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            href={`/platform/audit?tenantId=${encodeURIComponent(detail.tenantId)}`}
          >
            View audit history for this stall
          </Link>
        </p>
      </div>
    </PlatformShell>
  );
}
